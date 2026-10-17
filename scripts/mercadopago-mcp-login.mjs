import "./load-env.mjs";
import crypto from "node:crypto";
import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import {
  DEFAULT_PORT,
  MCP_ENDPOINT,
  TOKEN_FILE,
  createPkcePair,
  discoverMetadata,
  isExpired,
  postToken,
  readTokens,
  writeTokens,
} from "./mercadopago-mcp-auth.mjs";

/**
 * OAuth login for the Mercado Pago MCP server (authorization code + PKCE).
 *
 *   npm run mcp:login            # opens the browser, waits for the callback
 *   npm run mcp:login -- --no-wait   # only register + print the URL
 *   npm run mcp:login -- --status    # is there a usable session?
 *   npm run mcp:login -- --logout    # delete the stored session
 *   npm run mcp:login -- --force     # register a brand-new OAuth client
 *
 * Why a browser is unavoidable: the MCP server creates applications, test users
 * and credentials inside YOUR Mercado Pago account, so it needs a user-delegated
 * token, not the application token from the panel. The login itself uses OAuth
 * 2.1 with PKCE: this script registers a public client dynamically, listens on
 * 127.0.0.1 for the redirect and exchanges the code. Nothing is stored in the
 * repository; the session lives in TOKEN_FILE (see mercadopago-mcp-auth.mjs).
 */

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(name);
const force = hasFlag("--force");
const portIndex = args.indexOf("--port");
const port = portIndex >= 0 ? Number(args[portIndex + 1]) : DEFAULT_PORT;
const redirectUri = `http://127.0.0.1:${port}/callback`;
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

function html(res, status, title, body) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(
    `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
      `<body style="font-family:system-ui;max-width:40rem;margin:4rem auto;line-height:1.5">` +
      `<h1>${title}</h1><p>${body}</p></body>`,
  );
}

function openBrowser(url) {
  const [command, commandArgs] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  try {
    const child = spawn(command, commandArgs, { stdio: "ignore", detached: true });
    child.unref();
  } catch {
    /* the URL is printed anyway */
  }
}

async function registerClient(registrationEndpoint) {
  const response = await fetch(registrationEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_name: "LibroDigital MCP CLI",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`registro de cliente OAuth -> HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  const parsed = JSON.parse(text);
  if (!parsed.client_id) throw new Error(`el registro no devolvió client_id: ${text.slice(0, 200)}`);
  return parsed;
}

if (hasFlag("--status")) {
  const tokens = readTokens();
  if (!tokens?.access_token) {
    console.log(`Sin sesión OAuth. Archivo esperado: ${TOKEN_FILE}`);
    console.log("Ejecuta: npm run mcp:login");
    process.exit(1);
  }
  const expired = isExpired(tokens);
  console.log(`Archivo : ${TOKEN_FILE}`);
  console.log(`Usuario : ${tokens.user_id ?? "(no informado)"}`);
  console.log(`Estado  : ${expired ? "vencido (se refresca automáticamente al usarlo)" : "válido"}`);
  if (tokens.expires_at) {
    const minutes = Math.round((tokens.expires_at - Date.now()) / 60000);
    console.log(`Expira  : ${new Date(tokens.expires_at).toLocaleString()} (${minutes} min)`);
  }
  process.exit(expired && !tokens.refresh_token ? 1 : 0);
}

if (hasFlag("--logout")) {
  fs.rmSync(TOKEN_FILE, { force: true });
  console.log(`Sesión eliminada: ${TOKEN_FILE}`);
  process.exit(0);
}

try {
  const metadata = await discoverMetadata();
  const existing = readTokens();

  /**
   * A dynamic client is bound to the redirect URI it was registered with, so
   * reuse only when the port still matches; otherwise register a new one.
   */
  const canReuse = !force && existing?.client_id && existing?.redirect_uri === redirectUri;
  const client = canReuse
    ? { client_id: existing.client_id }
    : await registerClient(metadata.registration_endpoint);
  console.log(
    canReuse
      ? `Cliente OAuth: ${client.client_id} (reutilizado)`
      : `Cliente OAuth registrado: ${client.client_id}`,
  );
  if (!canReuse) {
    writeTokens({ ...(existing ?? {}), client_id: client.client_id, redirect_uri: redirectUri });
  }

  const state = crypto.randomBytes(24).toString("hex");
  const { verifier, challenge } = createPkcePair();

  const authorizationUrl = new URL(metadata.authorization_endpoint);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("client_id", client.client_id);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("code_challenge", challenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");
  authorizationUrl.searchParams.set("state", state);
  if (metadata.scopes_supported?.length) {
    authorizationUrl.searchParams.set("scope", metadata.scopes_supported.join(" "));
  }

  console.log("");
  console.log("Autoriza el acceso a tu cuenta de Mercado Pago desde el navegador:");
  console.log(`  ${authorizationUrl.toString()}`);
  console.log("");

  if (hasFlag("--no-wait")) {
    console.log("--no-wait: no se espera la redirección. Vuelve a ejecutar sin el flag para completar el login.");
    process.exit(0);
  }

  openBrowser(authorizationUrl.toString());

  const codePromise = new Promise((resolve, reject) => {
    const server = http.createServer(async (request, response) => {
      const callback = new URL(request.url, redirectUri);
      if (callback.pathname !== "/callback") {
        html(response, 404, "Ruta desconocida", "Vuelve a la terminal.");
        return;
      }

      const error = callback.searchParams.get("error");
      if (error) {
        html(response, 400, "Autorización rechazada", `${error}: ${callback.searchParams.get("error_description") ?? ""}`);
        server.close();
        reject(new Error(`autorización rechazada (${error})`));
        return;
      }

      if (callback.searchParams.get("state") !== state) {
        html(response, 400, "Estado inválido", "La redirección no corresponde a este login. Inténtalo de nuevo.");
        return;
      }

      const code = callback.searchParams.get("code");
      if (!code) {
        html(response, 400, "Falta el código", "Mercado Pago no envió el parámetro code.");
        return;
      }

      try {
        const token = await postToken({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: client.client_id,
          code_verifier: verifier,
          resource: MCP_ENDPOINT,
        });
        html(response, 200, "Listo", "Autorización completada. Cierra esta pestaña y vuelve a la terminal.");
        server.close();
        resolve(token);
      } catch (exchangeError) {
        html(response, 500, "No se pudo completar el login", exchangeError.message);
        server.close();
        reject(exchangeError);
      }
    });

    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => {
      console.log(`Esperando la redirección en ${redirectUri} ...`);
    });

    setTimeout(() => {
      server.close();
      reject(new Error("tiempo de espera agotado (5 minutos)"));
    }, OAUTH_TIMEOUT_MS).unref();
  });

  const token = await codePromise;
  const session = {
    ...token,
    client_id: client.client_id,
    redirect_uri: redirectUri,
    obtained_at: Date.now(),
    expires_at: token.expires_in ? Date.now() + Number(token.expires_in) * 1000 : null,
  };
  writeTokens(session);

  const minutes = session.expires_at ? Math.round((session.expires_at - Date.now()) / 60000) : null;
  console.log("");
  console.log("Sesión OAuth guardada.");
  console.log(`  usuario : ${session.user_id ?? "(no informado)"}`);
  console.log(`  archivo : ${TOKEN_FILE}`);
  console.log(`  expira  : ${minutes ? `${minutes} min (se refresca solo)` : "sin vencimiento informado"}`);
  console.log("");
  console.log("Siguiente paso: npm run mcp:smoke");
} catch (error) {
  console.error(`Login falló: ${error.message}`);
  process.exit(1);
}

