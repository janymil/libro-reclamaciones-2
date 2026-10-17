import "./load-env.mjs";
import { getAccessToken } from "./mercadopago-mcp-auth.mjs";

/**
 * Mercado Pago remote MCP smoke test.
 *
 * Answers one question: "is the MCP server I configured actually working?", and
 * answers it from the server instead of from the client's UI.
 *
 *   npm run mcp:smoke
 *
 * What it does, in order (all read-only, nothing is created or charged):
 *
 *   1. `initialize` - protocol handshake; prints server name/version and the
 *      negotiated protocol version. A 401 here means the URL is right but the
 *      credentials are not (see the note at the end of the output).
 *   2. `notifications/initialized` + `tools/list` - the catalogue the editor
 *      will show in its tool picker.
 *   3. `tools/call` on two safe tools: `application_list` (which app owns the
 *      token) and `search_documentation` (a real round-trip with arguments).
 *
 * The endpoint is public (https://mcp.mercadopago.com/mcp) but not anonymous:
 * it accepts the Mercado Pago access token as `Authorization: Bearer ...`, which
 * is why this script can run without a browser. Tools that validate OAuth
 * ownership (notifications_history, quality_checklist, get_credentials,
 * create_application) will still answer "OAuth ownership validation failed" -
 * only a real OAuth login in the MCP client unlocks those.
 *
 * Credentials: an OAuth session created by `npm run mcp:login` is preferred (it
 * also unlocks the ownership-validated tools); otherwise the panel token in
 * MERCADOPAGO_ACCESS_TOKEN / ENV_FILE is used for the read-only checks. No token
 * is ever printed.
 */

const endpoint = (process.env.MERCADOPAGO_MCP_URL || "https://mcp.mercadopago.com/mcp").trim();
const protocolVersion = "2025-06-18";
const flags = new Set(process.argv.slice(2).filter((arg) => arg.startsWith("--")));

let token;
let source;
try {
  ({ token, source } = await getAccessToken({ allowStatic: true }));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

let nextId = 0;

/**
 * The MCP Streamable HTTP transport may answer with plain JSON or with a
 * `text/event-stream` where each event is `event: message` + `data: {...}`.
 * Both shapes are parsed here so the script works whichever the server picks.
 */
function parseMessages(text, contentType) {
  if (!text) return [];

  if (!String(contentType || "").includes("text/event-stream")) {
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  }

  const messages = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data) continue;
    try {
      messages.push(JSON.parse(data));
    } catch {
      /* keepalive or comment - not a message */
    }
  }
  return messages;
}

async function rpc(method, params, timeoutMs = 30000) {
  const body = {
    jsonrpc: "2.0",
    method,
    ...(params === undefined ? {} : { params }),
  };

  const isNotification = method.startsWith("notifications/");
  if (!isNotification) body.id = ++nextId;

  const started = Date.now();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  const elapsed = Date.now() - started;

  if (!response.ok) {
    const hint =
      response.status === 401 || response.status === 403
        ? "\n  401/403: el token no es válido, está vencido o no corresponde a esta aplicación."
        : "";
    throw new Error(
      `${method} -> HTTP ${response.status} ${response.statusText} (${elapsed} ms)${hint}\n  ${text.slice(0, 300)}`,
    );
  }

  if (isNotification) return { result: null, elapsed };

  const messages = parseMessages(text, response.headers.get("content-type"));
  const reply = messages.find((message) => message.id === body.id) ?? messages[0];
  if (!reply) throw new Error(`${method} -> respuesta vacía (${elapsed} ms)`);
  if (reply.error) throw new Error(`${method} -> ${JSON.stringify(reply.error)}`);

  return { result: reply.result ?? null, elapsed };
}

const failures = [];

async function step(label, fn) {
  process.stdout.write(`- ${label} ... `);
  try {
    const value = await fn();
    console.log("OK");
    return value;
  } catch (error) {
    console.log("FALLA");
    console.log(`  ${error.message}`);
    failures.push(label);
    return null;
  }
}

function firstText(result) {
  const block = (result?.content || []).find((item) => item.type === "text");
  return block?.text || "";
}

function indent(text, spaces, maxChars) {
  const pad = " ".repeat(spaces);
  const body = text.replace(/\n{3,}/g, "\n\n").trim().slice(0, maxChars);
  return body
    .split(/\r?\n/)
    .map((line) => pad + line)
    .join("\n");
}

console.log(`MCP Mercado Pago: ${endpoint}`);
console.log(`Credencial       : ${source}\n`);

const init = await step("initialize (handshake)", async () => {
  const { result, elapsed } = await rpc("initialize", {
    protocolVersion,
    capabilities: {},
    clientInfo: { name: "librodigital-mcp-smoke", version: "1.0.0" },
  });
  if (!result) throw new Error("el servidor no devolvió serverInfo");
  return { ...result, elapsed };
});

if (init) {
  console.log(`  servidor   : ${init.serverInfo?.name} v${init.serverInfo?.version}`);
  console.log(`  protocolo  : ${init.protocolVersion} (${init.elapsed} ms)`);
  console.log(`  capacidades: ${Object.keys(init.capabilities || {}).join(", ") || "(ninguna)"}`);

  await step("notifications/initialized", () => rpc("notifications/initialized"));

  const listed = await step("tools/list", async () => {
    const { result } = await rpc("tools/list", {});
    return result?.tools || [];
  });

  if (listed) {
    console.log(`  ${listed.length} herramientas:`);
    for (const tool of listed) {
      const readOnly = tool.annotations?.readOnlyHint ? " [solo lectura]" : "";
      console.log(`    - ${tool.name}${readOnly}`);
    }
  }

  const applications = await step("tools/call application_list", async () => {
    const { result } = await rpc("tools/call", { name: "application_list", arguments: {} });
    if (result?.isError) throw new Error(firstText(result) || "isError sin detalle");
    return firstText(result);
  });
  if (applications) console.log(indent(applications, 4, 900));

  await step("tools/call search_documentation", async () => {
    const { result } = await rpc("tools/call", {
      name: "search_documentation",
      arguments: { term: "checkout pro", language: "es", siteId: "MPE", limit: 1 },
    });
    if (result?.isError) throw new Error(firstText(result) || "isError sin detalle");
    return result;
  });

  if (flags.has("--oauth-check")) {
    const history = await step("tools/call notifications_history (solo con OAuth)", async () => {
      const { result } = await rpc("tools/call", { name: "notifications_history", arguments: {} });
      if (result?.isError) throw new Error(firstText(result) || "isError sin detalle");
      return firstText(result);
    });
    if (history) console.log(indent(history, 4, 1200));
  }
}

console.log("");

if (failures.length) {
  console.error(`${failures.length} paso(s) fallaron: ${failures.join(", ")}`);
  process.exit(1);
}

if (source.startsWith("OAuth")) {
  console.log(
    [
      "Servidor MCP operativo con sesión OAuth.",
      "Las herramientas que validan propiedad (create_application, get_credentials,",
      "notifications_history, quality_checklist, quality_evaluation) están disponibles.",
    ].join("\n"),
  );
} else {
  console.log(
    [
      "Servidor MCP operativo con el access token de la aplicación.",
      "",
      "Nota: con este token funcionan application_list y search_documentation",
      "(verificado). save_webhook, create_test_user, add_money_test_user,",
      "form_homologation y quality_evaluation no declaran validación de propiedad,",
      "pero no se ejercitan en este smoke test porque escriben en la cuenta.",
      "Las que validan propiedad OAuth (create_application, get_credentials,",
      "notifications_history, quality_checklist) responden",
      "'OAuth ownership validation failed' hasta que ejecutes `npm run mcp:login`.",
    ].join("\n"),
  );
}

