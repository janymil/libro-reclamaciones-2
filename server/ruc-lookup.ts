import type { Express, Response } from "express";

import { rucLookupLimiter } from "./middleware/rateLimits";

/**
 * RUC lookup proxy for the public registration form
 * ("type the RUC, we fill the razón social").
 *
 * A third-party provider is queried server-side because the browser cannot call
 * it directly: CORS, and any token would be exposed in the page. The answer is
 * normalized here into ONE stable snake_case contract that the client depends
 * on (`client/src/pages/onboarding-page.tsx` reads `razon_social`,
 * `departamento`, `provincia`, `distrito`), so the provider is chosen by
 * configuration alone — no UI change, no code change.
 *
 * Providers (all republish SUNAT's public "Consulta RUC" data):
 *   apisnet    GET https://api.apis.net.pe/v2/ruc?numero={ruc}
 *              Answers with NO token at all (verified), but that anonymous
 *              endpoint is rate-limited per source IP (429 after a handful of
 *              calls). With a free token it switches to the documented
 *              /v2/sunat/ruc, which answers 401 anonymously.
 *   decolecta  GET https://api.decolecta.com/v1/sunat/ruc?numero={ruc}
 *              Requires a token (Bearer header, or `&token=` in the query).
 *
 * Alternatives that plug into the same contract later, if wanted:
 *   - SUNAT's own API: GET https://api.sunat.gob.pe/v1/contribuyente/
 *     contribuyentes/{ruc} — answers 401 without an OAuth2 token issued to a
 *     client_id obtained with clave SOL.
 *   - SUNAT's free monthly bulk file ("Padrón Reducido", ~375 MB with RUC +
 *     razón social + local anexo) imported into the database.
 *
 * Failures carry a `code` so the client can tell "SUNAT has no such RUC" apart
 * from "the lookup service is down": the previous implementation answered 500
 * for every problem and the UI then said "RUC no encontrado", sending users to
 * hunt for a typo that did not exist.
 *
 * Nothing personal is logged here: only the provider, the upstream status and
 * the error name.
 */

/** One company, as the rest of the application consumes it. */
export interface RucLookupRecord {
  /** Razón social / company name. The only field the UI truly needs. */
  razon_social: string;
  numero_documento: string | null;
  estado: string | null;
  condicion: string | null;
  direccion: string | null;
  ubigeo: string | null;
  distrito: string | null;
  provincia: string | null;
  departamento: string | null;
  es_agente_retencion: boolean | null;
  es_buen_contribuyente: boolean | null;
  /** SUNAT "locales anexo" (establishments), when the provider returns them. */
  locales_anexos: unknown[] | null;
  /** Which provider answered — useful in support, never sensitive. */
  source: string;
}

type ProviderId = "apisnet" | "decolecta";

interface ProviderConfig {
  id: ProviderId;
  url: string;
  /** Absent ⇒ the provider has to answer anonymously or not at all. */
  token?: string;
}

const APISNET_ANONYMOUS_URL = "https://api.apis.net.pe/v2/ruc";
const APISNET_TOKEN_URL = "https://api.apis.net.pe/v2/sunat/ruc";
const DECOLECTA_URL = "https://api.decolecta.com/v1/sunat/ruc";

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** Upper bound, so a long-lived server cannot grow this map without limit. */
const MAX_CACHE_ENTRIES = 5_000;

interface CacheEntry {
  record: RucLookupRecord;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Test helper: drops every cached lookup. */
export function clearRucLookupCache(): void {
  cache.clear();
}

function readCache(ruc: string): RucLookupRecord | null {
  const entry = cache.get(ruc);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    cache.delete(ruc);
    return null;
  }

  // Re-inserting moves the key to the end of the Map's insertion order, which
  // is what makes the eviction below drop the least recently used entry.
  cache.delete(ruc);
  cache.set(ruc, entry);
  return entry.record;
}

function writeCache(ruc: string, record: RucLookupRecord, ttlMs: number): void {
  if (ttlMs <= 0) return;

  cache.set(ruc, { record, expiresAt: Date.now() + ttlMs });

  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Which provider(s) to ask, in order.
 *
 * `RUC_API_PROVIDER` picks one (`apisnet` by default); `auto` chains them, but
 * only across providers that actually have credentials.
 */
export function resolveProviderChain(env: NodeJS.ProcessEnv = process.env): ProviderConfig[] {
  const apisnetToken = env.APISNET_API_TOKEN?.trim() || undefined;
  const decolectaToken = env.DECOLECTA_API_TOKEN?.trim() || undefined;
  const requested = env.RUC_API_PROVIDER?.trim().toLowerCase() || "apisnet";

  const apisnet: ProviderConfig = {
    id: "apisnet",
    // The documented endpoint rejects anonymous calls, so only ask for it when
    // there is a token to send; otherwise use the one that works keyless.
    url: apisnetToken ? APISNET_TOKEN_URL : APISNET_ANONYMOUS_URL,
    token: apisnetToken,
  };
  const decolecta: ProviderConfig = { id: "decolecta", url: DECOLECTA_URL, token: decolectaToken };

  if (requested === "decolecta") return [decolecta];
  if (requested === "auto") return decolectaToken ? [decolecta, apisnet] : [apisnet];
  return [apisnet];
}

function firstString(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function firstBoolean(source: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return null;
}

/**
 * Maps any provider payload onto `RucLookupRecord`.
 *
 * Returns null when the payload carries no company name at all — a provider
 * error body (`{"success":false,...}`), an HTML error page, or SUNAT having no
 * record for that RUC. Callers report that as `ruc_not_found`.
 */
export function normalizeRucRecord(payload: unknown, source: string): RucLookupRecord | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;

  const raw = payload as Record<string, unknown>;

  // apis.net.pe v2 → razonSocial, v1 → nombre, Decolecta → razon_social.
  const name = firstString(raw, ["razon_social", "razonSocial", "nombre", "nombre_o_razon_social"]);
  if (!name) return null;

  const anexos = raw.locales_anexos ?? raw.localesAnexos;

  return {
    razon_social: name,
    numero_documento: firstString(raw, ["numero_documento", "numeroDocumento", "ruc"]),
    estado: firstString(raw, ["estado"]),
    condicion: firstString(raw, ["condicion"]),
    direccion: firstString(raw, ["direccion", "dirección", "domicilio_fiscal"]),
    ubigeo: firstString(raw, ["ubigeo"]),
    distrito: firstString(raw, ["distrito"]),
    provincia: firstString(raw, ["provincia"]),
    departamento: firstString(raw, ["departamento"]),
    es_agente_retencion: firstBoolean(raw, ["es_agente_retencion", "EsAgenteRetencion", "esAgenteRetencion"]),
    es_buen_contribuyente: firstBoolean(raw, ["es_buen_contribuyente", "EsBuenContribuyente", "esBuenContribuyente"]),
    locales_anexos: Array.isArray(anexos) ? anexos : null,
    source,
  };
}

interface ProviderAnswer {
  status: number;
  payload: unknown;
}

/**
 * Vendor wording for "the document you sent is not valid", used to read 400s.
 *
 * 404 and 422 are unambiguous (`apis.net.pe` answers 422 `{"message":"ruc no
 * valido"}`), but 400 can mean either "invalid RUC" (Decolecta documents 400)
 * or "your request was malformed" — i.e. our bug. Only the first deserves the
 * "RUC no encontrado" wording.
 */
function mentionsInvalidRuc(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const text = JSON.stringify(payload).toLowerCase();
  return text.includes("ruc") || text.includes("documento");
}

async function askProvider(
  provider: ProviderConfig,
  ruc: string,
  timeoutMs: number,
): Promise<ProviderAnswer> {
  const url = new URL(provider.url);
  url.searchParams.set("numero", ruc);

  const headers: Record<string, string> = { accept: "application/json" };
  // Sent as a header even for Decolecta, which also accepts `&token=`: a query
  // string token ends up in proxy and access logs.
  if (provider.token) headers.authorization = `Bearer ${provider.token}`;

  const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  const text = await response.text();

  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    // A WAF/HTML error page: treated as a provider failure, never parsed.
    payload = null;
  }

  return { status: response.status, payload };
}

type FailureKind =
  | "not_found"
  | "rate_limited"
  | "not_configured"
  | "auth"
  | "provider_error"
  | "unreachable";

/**
 * Customer-facing wording.
 *
 * The technical distinction lives in `code` (for the client and for support)
 * and in the server log - never in the text the customer reads: no vendor
 * names, no mention of quotas, tokens or providers, nothing about the limits of
 * the underlying data source.
 */
const UNAVAILABLE_ERROR = "No se pudo verificar el RUC";
const UNAVAILABLE_MESSAGE = "Completa los datos de tu empresa manualmente.";

/**
 * Turns a failure into something the client can act on.
 *
 * `code` plus the HTTP status is the contract: `ruc_not_found` (404) means the
 * RUC does not exist and retyping it is useless; every other code means the
 * lookup itself is unavailable, so the form keeps the manual entry path.
 */
function respondWithFailure(res: Response, failure: FailureKind, upstreamStatus: number) {
  if (failure === "not_found") {
    return res.status(404).json({
      error: "RUC no encontrado",
      code: "ruc_not_found",
      message: "No encontramos información para este RUC. Verifica el número.",
    });
  }

  if (failure === "rate_limited") {
    // The provider quota is exhausted: invite a retry instead of a retype.
    res.setHeader("Retry-After", "60");
    return res.status(429).json({
      error: UNAVAILABLE_ERROR,
      code: "provider_rate_limited",
      message: "Intenta nuevamente en unos minutos o completa los datos manualmente.",
    });
  }

  // `not_configured` and `auth` stay distinct in the response and the log so an
  // operator can act on them, while the customer sees the same neutral text as
  // any other outage.
  if (failure === "not_configured") {
    console.error("RUC lookup is misconfigured: the selected provider requires a token");
    return res.status(503).json({
      error: UNAVAILABLE_ERROR,
      code: "provider_not_configured",
      message: UNAVAILABLE_MESSAGE,
    });
  }

  if (failure === "auth") {
    return res.status(502).json({
      error: UNAVAILABLE_ERROR,
      code: "provider_auth_failed",
      message: UNAVAILABLE_MESSAGE,
    });
  }

  console.error(`RUC lookup unavailable (upstream status ${upstreamStatus})`);
  return res.status(502).json({
    error: UNAVAILABLE_ERROR,
    code: failure === "provider_error" ? "provider_error" : "provider_unreachable",
    message: UNAVAILABLE_MESSAGE,
  });
}

export function setupRUCLookup(app: Express) {
  // RUC lookup proxy endpoint (to avoid CORS issues). Unauthenticated by
  // design (it is used on the public registration form) but rate-limited so
  // the server cannot be abused as a free relay against the provider.
  app.get('/api/lookup-ruc/:ruc', rucLookupLimiter, async (req, res) => {
    const { ruc } = req.params;

    // Validate RUC format
    if (!ruc || ruc.length !== 11 || !/^\d+$/.test(ruc)) {
      return res.status(400).json({
        error: 'RUC inválido',
        code: 'invalid_ruc',
        message: 'El RUC debe tener exactamente 11 dígitos'
      });
    }

    const cached = readCache(ruc);
    if (cached) {
      res.setHeader("x-ruc-cache", "hit");
      res.setHeader("x-ruc-source", cached.source);
      return res.json(cached);
    }

    const timeoutMs = readPositiveInt(process.env.RUC_API_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
    const ttlMs = readPositiveInt(process.env.RUC_API_CACHE_TTL_MS, DEFAULT_CACHE_TTL_MS);

    let failure: FailureKind = "unreachable";
    let lastStatus = 0;

    for (const provider of resolveProviderChain()) {
      try {
        const answer = await askProvider(provider, ruc, timeoutMs);
        lastStatus = answer.status;

        const record = normalizeRucRecord(answer.payload, provider.id);
        if (answer.status >= 200 && answer.status < 300 && record) {
          writeCache(ruc, record, ttlMs);
          res.setHeader("x-ruc-cache", "miss");
          res.setHeader("x-ruc-source", provider.id);
          return res.json(record);
        }

        // "There is no such RUC": a 404, a 422 (apis.net.pe: `{"message":"ruc no
        // valido"}`), a 400 that blames the document, or a 2xx carrying no
        // record. Asking the next provider would only burn its quota.
        const answeredWithoutRecord =
          answer.status === 404 ||
          answer.status === 422 ||
          (answer.status === 400 && mentionsInvalidRuc(answer.payload)) ||
          (answer.status >= 200 && answer.status < 300);

        if (answeredWithoutRecord) {
          failure = "not_found";
          break;
        }

        if (answer.status === 429) {
          failure = "rate_limited";
        } else if (answer.status === 401 || answer.status === 403) {
          // 401 with no token configured is a setup problem, not a bad token.
          failure = provider.token ? "auth" : "not_configured";
        } else {
          failure = "provider_error";
        }

        console.warn(`RUC lookup: provider ${provider.id} answered ${answer.status} (${failure})`);
      } catch (error) {
        // Network failure or timeout: the provider is the problem, not the RUC.
        failure = "unreachable";
        const name = error instanceof Error ? error.name : "unknown";
        console.warn(`RUC lookup: provider ${provider.id} failed (${name})`);
      }
    }

    return respondWithFailure(res, failure, lastStatus);
  });
}
