import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Shared Mercado Pago MCP auth helper.
 *
 * Two credentials can talk to https://mcp.mercadopago.com/mcp:
 *
 *   * the application access token (`APP_USR-...` / `TEST-...`) from the panel,
 *     which works for `application_list`, `search_documentation`, `save_webhook`,
 *     `create_test_user`, `add_money_test_user` and `form_homologation`;
 *   * an OAuth access token (authorization code + PKCE, refreshable), which is
 *     the ONLY thing accepted by the tools that validate ownership:
 *     `create_application`, `get_credentials`, `notifications_history`,
 *     `quality_checklist` and `quality_evaluation`.
 *
 * `npm run mcp:login` obtains the second one and stores it OUTSIDE the repo
 * (user profile, so no token can end up in a commit or a backup):
 *
 *   %USERPROFILE%\.mercadopago-mcp\oauth.json        (Windows)
 *   ~/.mercadopago-mcp/oauth.json                    (Linux/macOS)
 *
 * Override with MERCADOPAGO_MCP_OAUTH_FILE. The token is never printed by any
 * script in this repo.
 */

export const MCP_ENDPOINT = (process.env.MERCADOPAGO_MCP_URL || "https://mcp.mercadopago.com/mcp").trim();
export const MCP_ORIGIN = new URL(MCP_ENDPOINT).origin;
export const MCP_PATH = new URL(MCP_ENDPOINT).pathname.replace(/\/+$/, "");
export const DEFAULT_PORT = Number(process.env.MERCADOPAGO_MCP_PORT || 8788);

export const TOKEN_FILE =
  (process.env.MERCADOPAGO_MCP_OAUTH_FILE || "").trim() ||
  path.join(os.homedir(), ".mercadopago-mcp", "oauth.json");

export function readTokens() {
  try {
    const parsed = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function writeTokens(tokens) {
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
  fs.writeFileSync(TOKEN_FILE, `${JSON.stringify(tokens, null, 2)}\n`, { mode: 0o600 });
}

export function isExpired(tokens, skewSeconds = 60) {
  if (!tokens?.access_token) return true;
  if (!tokens.expires_at) return false;
  return Date.now() + skewSeconds * 1000 >= tokens.expires_at;
}

function withExpiry(tokens, previous) {
  const now = Date.now();
  return {
    ...previous,
    ...tokens,
    client_id: tokens.client_id || previous?.client_id,
    redirect_uri: tokens.redirect_uri || previous?.redirect_uri,
    obtained_at: now,
    expires_at: tokens.expires_in ? now + Number(tokens.expires_in) * 1000 : previous?.expires_at,
  };
}

/**
 * The OAuth server advertises `token_endpoint` in its metadata; both the code
 * exchange and the refresh live there. `resource` (RFC 8707) is sent because MCP
 * expects audience binding, but some deployments reject unknown parameters - so
 * a 400 retries once without it instead of failing the whole login.
 */
export async function postToken(body) {
  const attempt = async (params) => {
    const response = await fetch(`${MCP_ORIGIN}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(30000),
    });
    return { response, text: await response.text() };
  };

  let { response, text } = await attempt(body);
  if (!response.ok && body.resource) {
    const retry = await attempt(
      Object.fromEntries(Object.entries(body).filter(([key]) => key !== "resource")),
    );
    response = retry.response;
    text = retry.text;
  }

  if (!response.ok) {
    throw new Error(`token endpoint -> HTTP ${response.status}: ${text.slice(0, 400)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`token endpoint devolvió una respuesta no JSON: ${text.slice(0, 200)}`);
  }
}

export async function refreshTokens(tokens) {
  if (!tokens?.refresh_token || !tokens.client_id) {
    throw new Error("no hay refresh_token guardado; ejecuta `npm run mcp:login`");
  }

  const fresh = await postToken({
    grant_type: "refresh_token",
    client_id: tokens.client_id,
    refresh_token: tokens.refresh_token,
    resource: MCP_ENDPOINT,
  });

  const merged = withExpiry(fresh, tokens);
  writeTokens(merged);
  return merged;
}

/**
 * MCP servers publish OAuth metadata per endpoint path (RFC 9728 path-aware
 * discovery). For https://mcp.mercadopago.com/mcp the document lives at
 * `/.well-known/oauth-authorization-server/mcp` and is the one that advertises
 * the real registration endpoint (`/oauth/register/mcp`) and scopes
 * (offline_access, read, write). The root document is a fallback only - using it
 * makes dynamic registration fail with "MCP name not found".
 */
export async function discoverMetadata() {
  const candidates = [
    `${MCP_ORIGIN}/.well-known/oauth-authorization-server${MCP_PATH}`,
    `${MCP_ORIGIN}/.well-known/oauth-authorization-server`,
  ];

  const errors = [];
  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) {
        errors.push(`${url} -> HTTP ${response.status}`);
        continue;
      }
      const metadata = await response.json();
      if (metadata?.authorization_endpoint && metadata?.token_endpoint) {
        return { ...metadata, metadata_url: url };
      }
      errors.push(`${url} -> sin authorization_endpoint/token_endpoint`);
    } catch (error) {
      errors.push(`${url} -> ${error.message}`);
    }
  }

  throw new Error(`no se encontró metadata OAuth:\n  ${errors.join("\n  ")}`);
}

/**
 * Returns `{ token, source }`. OAuth wins; the panel token is only used as a
 * fallback so read-only tooling keeps working before the first login.
 */
export async function getAccessToken({ allowStatic = false } = {}) {
  const tokens = readTokens();

  if (tokens?.access_token && !isExpired(tokens)) {
    return { token: tokens.access_token, source: "OAuth" };
  }

  if (tokens?.refresh_token && tokens?.client_id) {
    try {
      const fresh = await refreshTokens(tokens);
      return { token: fresh.access_token, source: "OAuth (refrescado)" };
    } catch (error) {
      if (!allowStatic) throw error;
      console.error(`Aviso: no se pudo refrescar el token OAuth (${error.message}).`);
    }
  }

  const staticToken = (process.env.MERCADOPAGO_ACCESS_TOKEN || "").trim();
  if (allowStatic && staticToken) {
    return { token: staticToken, source: "access token de la aplicación (.env)" };
  }

  throw new Error(
    [
      "No hay sesión OAuth de Mercado Pago.",
      "  npm run mcp:login",
      `El token se guarda en ${TOKEN_FILE}`,
    ].join("\n"),
  );
}

export function base64url(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function createPkcePair() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}
