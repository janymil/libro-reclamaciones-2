import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { startTestApp, call } from "./test/routeTestHarness";
import {
  clearRucLookupCache,
  normalizeRucRecord,
  resolveProviderChain,
  setupRUCLookup,
} from "./ruc-lookup";

/**
 * RUC lookup proxy (`GET /api/lookup-ruc/:ruc`).
 *
 * The endpoint is deliberately unauthenticated (the public registration form
 * uses it) and depends on a third party, so what these tests pin down is:
 *
 *  - one stable field contract for every provider (camelCase, snake_case, v1),
 *  - an outage is never reported as "this RUC does not exist" — the previous
 *    implementation answered 500 for every problem and the UI said
 *    "RUC no encontrado",
 *  - a repeated lookup does not hit the provider again (cache),
 *  - a saturated provider degrades to a message, not to a broken form.
 *
 * NOTE: `rucLookupLimiter` is a module-level instance shared by every app the
 * harness starts, so this file keeps its total request count well below the
 * 30 requests / 15 minutes budget.
 */

/** Shape returned by apis.net.pe v2 (camelCase) — the default provider. */
const APISNET_PAYLOAD = {
  razonSocial: "SUPERMERCADOS PERUANOS SOCIEDAD ANONIMA",
  numeroDocumento: "20100070970",
  estado: "ACTIVO",
  condicion: "HABIDO",
  direccion: "CAL. MORELLI NRO 181 INT. P-2 ",
  ubigeo: "150130",
  distrito: "SAN BORJA",
  provincia: "LIMA",
  departamento: "LIMA",
  EsAgenteRetencion: true,
  EsBuenContribuyente: false,
  localesAnexos: [
    { direccion: "NRO 495", ubigeo: "150122", departamento: "LIMA", provincia: "LIMA", distrito: "MIRAFLORES" },
  ],
};

/** Shape documented by Decolecta (snake_case) — the reason for the adapter. */
const DECOLECTA_PAYLOAD = {
  razon_social: "REXTIE S.A.C.",
  numero_documento: "20601030013",
  estado: "ACTIVO",
  condicion: "HABIDO",
  direccion: "AV. JOSE GALVEZ BARRENECHEA NRO 566 INT. 101 URB. CORPAC ",
  ubigeo: "150131",
  distrito: "SAN ISIDRO",
  provincia: "LIMA",
  departamento: "LIMA",
  es_agente_retencion: false,
  es_buen_contribuyente: false,
  locales_anexos: null,
};

const realFetch = globalThis.fetch;
const providerCalls: string[] = [];
let answer: (url: string, init?: RequestInit) => Promise<Response>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let app: { url: string; close: () => Promise<void> };

beforeEach(async () => {
  providerCalls.length = 0;
  clearRucLookupCache();
  delete process.env.APISNET_API_TOKEN;
  delete process.env.DECOLECTA_API_TOKEN;
  delete process.env.RUC_API_PROVIDER;
  delete process.env.RUC_API_TIMEOUT_MS;

  answer = async () => jsonResponse(200, APISNET_PAYLOAD);

  vi.stubGlobal("fetch", ((input: any, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    // The harness drives the app itself over real HTTP: let those through.
    if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) {
      return realFetch(input, init);
    }

    providerCalls.push(url);
    return answer(url, init);
  }) as typeof fetch);

  app = await startTestApp(setupRUCLookup);
});

afterEach(async () => {
  await app.close();
  vi.unstubAllGlobals();
  delete process.env.APISNET_API_TOKEN;
  delete process.env.DECOLECTA_API_TOKEN;
  delete process.env.RUC_API_PROVIDER;
  delete process.env.RUC_API_TIMEOUT_MS;
});

describe("resolveProviderChain", () => {
  it("defaults to the tokenless apis.net.pe endpoint", () => {
    expect(resolveProviderChain({})).toEqual([
      { id: "apisnet", url: "https://api.apis.net.pe/v2/ruc", token: undefined },
    ]);
  });

  it("uses the documented apis.net.pe endpoint once a token exists", () => {
    const [provider] = resolveProviderChain({ APISNET_API_TOKEN: " tok " });

    expect(provider.url).toBe("https://api.apis.net.pe/v2/sunat/ruc");
    expect(provider.token).toBe("tok");
  });

  it("selects Decolecta when asked, with or without its token", () => {
    expect(resolveProviderChain({ RUC_API_PROVIDER: "decolecta" })[0]).toEqual({
      id: "decolecta",
      url: "https://api.decolecta.com/v1/sunat/ruc",
      token: undefined,
    });
    expect(
      resolveProviderChain({ RUC_API_PROVIDER: "decolecta", DECOLECTA_API_TOKEN: "k" })[0].token,
    ).toBe("k");
  });

  it("only chains providers in auto mode when both could work", () => {
    expect(resolveProviderChain({ RUC_API_PROVIDER: "auto" }).map((p) => p.id)).toEqual(["apisnet"]);
    expect(
      resolveProviderChain({ RUC_API_PROVIDER: "auto", DECOLECTA_API_TOKEN: "k" }).map((p) => p.id),
    ).toEqual(["decolecta", "apisnet"]);
  });
});

describe("normalizeRucRecord", () => {
  it("maps the apis.net.pe v2 contract", () => {
    const record = normalizeRucRecord(APISNET_PAYLOAD, "apisnet");

    expect(record).toMatchObject({
      razon_social: "SUPERMERCADOS PERUANOS SOCIEDAD ANONIMA",
      numero_documento: "20100070970",
      estado: "ACTIVO",
      condicion: "HABIDO",
      distrito: "SAN BORJA",
      provincia: "LIMA",
      departamento: "LIMA",
      es_agente_retencion: true,
      es_buen_contribuyente: false,
      source: "apisnet",
    });
    expect(record?.locales_anexos).toHaveLength(1);
  });

  it("maps the Decolecta contract", () => {
    const record = normalizeRucRecord(DECOLECTA_PAYLOAD, "decolecta");

    expect(record).toMatchObject({
      razon_social: "REXTIE S.A.C.",
      departamento: "LIMA",
      provincia: "LIMA",
      distrito: "SAN ISIDRO",
      es_agente_retencion: false,
    });
    expect(record?.locales_anexos).toBeNull();
  });

  it("maps the legacy apis.net.pe v1 `nombre` field", () => {
    expect(normalizeRucRecord({ nombre: "MI EMPRESA S.A.C." }, "apisnet")?.razon_social).toBe(
      "MI EMPRESA S.A.C.",
    );
  });

  it("returns null for error bodies, arrays and junk", () => {
    expect(
      normalizeRucRecord({ success: false, message: "No autorizado. Token inválido o no enviado." }, "apisnet"),
    ).toBeNull();
    expect(normalizeRucRecord({ error: "Apikey Required / Limit Exceeded" }, "decolecta")).toBeNull();
    expect(normalizeRucRecord([{ razonSocial: "X" }], "apisnet")).toBeNull();
    expect(normalizeRucRecord("Request Rejected", "apisnet")).toBeNull();
    expect(normalizeRucRecord(null, "apisnet")).toBeNull();
  });
});

describe("GET /api/lookup-ruc/:ruc", () => {
  it("rejects anything that is not 11 digits", async () => {
    const short = await call(app.url, "/api/lookup-ruc/201000709");
    const letters = await call(app.url, "/api/lookup-ruc/2010007097A");

    expect(short.status).toBe(400);
    expect(short.body.code).toBe("invalid_ruc");
    expect(letters.status).toBe(400);
    expect(letters.body.code).toBe("invalid_ruc");
    // A malformed RUC never reaches the provider.
    expect(providerCalls).toHaveLength(0);
  });

  it("returns the razón social and location, then serves the repeat from cache", async () => {
    const first = await fetch(`${app.url}/api/lookup-ruc/20100070970`);
    const body = await first.json();

    expect(first.status).toBe(200);
    expect(first.headers.get("x-ruc-source")).toBe("apisnet");
    expect(first.headers.get("x-ruc-cache")).toBe("miss");
    expect(body).toMatchObject({
      razon_social: "SUPERMERCADOS PERUANOS SOCIEDAD ANONIMA",
      departamento: "LIMA",
      provincia: "LIMA",
      distrito: "SAN BORJA",
    });
    expect(providerCalls[0]).toBe("https://api.apis.net.pe/v2/ruc?numero=20100070970");

    // Second attempt for the same RUC: the provider is not called again, which
    // is what keeps a registration spike inside the provider's quota.
    const second = await fetch(`${app.url}/api/lookup-ruc/20100070970`);
    await second.json();

    expect(second.headers.get("x-ruc-cache")).toBe("hit");
    expect(providerCalls).toHaveLength(1);
  });

  it("normalizes Decolecta's snake_case payload for the same client contract", async () => {
    process.env.RUC_API_PROVIDER = "decolecta";
    process.env.DECOLECTA_API_TOKEN = "test-token";
    answer = async () => jsonResponse(200, DECOLECTA_PAYLOAD);

    const response = await fetch(`${app.url}/api/lookup-ruc/20601030013`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-ruc-source")).toBe("decolecta");
    expect(body.razon_social).toBe("REXTIE S.A.C.");
    expect(body.departamento).toBe("LIMA");
    expect(body.distrito).toBe("SAN ISIDRO");
  });

  it("answers 404 ruc_not_found when the provider has no such RUC", async () => {
    answer = async () => jsonResponse(404, { success: false, message: "RUC no encontrado" });
    const notFound = await call(app.url, "/api/lookup-ruc/20123456789");

    expect(notFound.status).toBe(404);
    expect(notFound.body.code).toBe("ruc_not_found");

    // apis.net.pe's real answer for a RUC that does not exist (verified live).
    answer = async () => jsonResponse(422, { message: "ruc no valido" });
    const unprocessable = await call(app.url, "/api/lookup-ruc/20123456789");

    expect(unprocessable.status).toBe(404);
    expect(unprocessable.body.code).toBe("ruc_not_found");

    // Decolecta documents 400 for the same situation.
    answer = async () => jsonResponse(400, { message: "RUC inválido" });
    const badRequest = await call(app.url, "/api/lookup-ruc/20123456789");

    expect(badRequest.status).toBe(404);
    expect(badRequest.body.code).toBe("ruc_not_found");
  });

  it("keeps a malformed request distinct from a bad RUC", async () => {
    // A 400 that does not blame the document means we built the request wrong.
    // Calling that "RUC no encontrado" would re-introduce the original bug of
    // sending users to hunt for a typo that does not exist.
    answer = async () => jsonResponse(400, { error: "missing parameter" });

    const response = await call(app.url, "/api/lookup-ruc/20100070970");

    expect(response.status).toBe(502);
    expect(response.body.code).toBe("provider_error");
  });

  it("answers 429 provider_rate_limited when the provider throttles us", async () => {
    answer = async () =>
      new Response("<html><title>429 Too Many Requests</title></html>", {
        status: 429,
        headers: { "content-type": "text/html" },
      });

    const response = await call(app.url, "/api/lookup-ruc/20100070970");

    expect(response.status).toBe(429);
    expect(response.body.code).toBe("provider_rate_limited");
  });

  it("answers 502 provider_unreachable when the provider cannot be reached", async () => {
    // This is the case the old implementation reported as "RUC no encontrado".
    answer = async () => {
      throw new TypeError("fetch failed");
    };

    const response = await call(app.url, "/api/lookup-ruc/20100070970");

    expect(response.status).toBe(502);
    expect(response.body.code).toBe("provider_unreachable");
  });

  it("answers 502 when the provider hangs past the timeout", async () => {
    process.env.RUC_API_TIMEOUT_MS = "30";
    answer = async (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error("no abort signal was passed to the provider call"));
          return;
        }
        signal.addEventListener("abort", () =>
          reject(
            Object.assign(new Error("The operation was aborted due to timeout"), {
              name: "TimeoutError",
            }),
          ),
        );
      });

    const response = await call(app.url, "/api/lookup-ruc/20100070970");

    expect(response.status).toBe(502);
    expect(response.body.code).toBe("provider_unreachable");
  });

  it("answers 503 provider_not_configured when the selected provider needs a token", async () => {
    process.env.RUC_API_PROVIDER = "decolecta";
    answer = async () => jsonResponse(401, { error: "Apikey Required / Limit Exceeded" });

    const response = await call(app.url, "/api/lookup-ruc/20100070970");

    expect(response.status).toBe(503);
    expect(response.body.code).toBe("provider_not_configured");
  });

  it("keeps vendors, quotas and tokens out of the customer-facing text", async () => {
    // The technical reason lives in `code` (and the server log). What a customer
    // reads must stay neutral: no vendor names, no infrastructure talk, nothing
    // about the limits of our data sources.
    const internal = /sunat|provider|proveedor|token|apikey|cuota|quota|saturad|configurad|no configurada/i;

    answer = async () => jsonResponse(422, { message: "ruc no valido" });
    const notFound = await call(app.url, "/api/lookup-ruc/20123456789");

    answer = async () => jsonResponse(429, { error: "limits" });
    const throttled = await call(app.url, "/api/lookup-ruc/20123456788");

    answer = async () => {
      throw new TypeError("fetch failed");
    };
    const unreachable = await call(app.url, "/api/lookup-ruc/20123456787");

    process.env.RUC_API_PROVIDER = "decolecta";
    answer = async () => jsonResponse(401, { error: "Apikey Required / Limit Exceeded" });
    const misconfigured = await call(app.url, "/api/lookup-ruc/20123456786");

    for (const response of [notFound, throttled, unreachable, misconfigured]) {
      const text = `${response.body.error} ${response.body.message}`;

      expect(text).not.toMatch(internal);
      expect(text.trim().length).toBeGreaterThan(10);
    }
  });
});
