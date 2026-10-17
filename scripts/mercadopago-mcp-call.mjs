import "./load-env.mjs";
import { getAccessToken, MCP_ENDPOINT } from "./mercadopago-mcp-auth.mjs";

/**
 * Call any Mercado Pago MCP tool from the terminal.
 *
 *   npm run mcp:call -- --list
 *   npm run mcp:call -- --schema create_test_user
 *   npm run mcp:call -- application_list
 *   npm run mcp:call -- create_test_user '{"site_id":"MPE","description":"comprador demo","profile":"buyer"}'
 *
 * Prefers the OAuth session created by `npm run mcp:login`; falls back to
 * MERCADOPAGO_ACCESS_TOKEN for the tools that accept it. Tools flagged as
 * destructive by the server (`save_webhook`, `add_money_test_user`) additionally
 * require `--yes`, so a copy-pasted command cannot reconfigure a webhook by
 * accident.
 */

const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith("--")));
const positional = args.filter((arg) => !arg.startsWith("--"));
const [toolName, rawArguments] = positional;

let nextId = 0;

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
      /* keepalive */
    }
  }
  return messages;
}

async function rpc(token, method, params, timeoutMs = 60000) {
  const body = { jsonrpc: "2.0", method, ...(params === undefined ? {} : { params }) };
  const isNotification = method.startsWith("notifications/");
  if (!isNotification) body.id = ++nextId;

  const response = await fetch(MCP_ENDPOINT, {
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
  if (!response.ok) {
    throw new Error(`${method} -> HTTP ${response.status} ${response.statusText}: ${text.slice(0, 300)}`);
  }
  if (isNotification) return null;

  const messages = parseMessages(text, response.headers.get("content-type"));
  const reply = messages.find((message) => message.id === body.id) ?? messages[0];
  if (!reply) throw new Error(`${method} -> respuesta vacía`);
  if (reply.error) throw new Error(`${method} -> ${JSON.stringify(reply.error)}`);
  return reply.result ?? null;
}

function firstText(result) {
  return (result?.content || [])
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");
}

try {
  const { token, source } = await getAccessToken({ allowStatic: true });
  await rpc(token, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "librodigital-mcp-call", version: "1.0.0" },
  });
  await rpc(token, "notifications/initialized");

  const { tools = [] } = (await rpc(token, "tools/list", {})) ?? {};

  if (flags.has("--list") || !toolName) {
    console.log(`Credencial: ${source}`);
    console.log(`Servidor  : ${MCP_ENDPOINT}\n`);
    for (const tool of tools) {
      const hints = [
        tool.annotations?.readOnlyHint ? "solo lectura" : null,
        tool.annotations?.destructiveHint ? "destructiva (--yes)" : null,
      ].filter(Boolean);
      console.log(`${tool.name}${hints.length ? `  [${hints.join(", ")}]` : ""}`);
      console.log(`  ${(tool.description ?? "").replace(/\s+/g, " ").slice(0, 200)}`);
    }
    if (!toolName) {
      console.log("\nUso: npm run mcp:call -- <herramienta> '<argumentos JSON>'");
    }
    process.exit(0);
  }

  const tool = tools.find((item) => item.name === toolName);
  if (!tool) {
    console.error(`Herramienta desconocida: ${toolName}`);
    console.error(`Disponibles: ${tools.map((item) => item.name).join(", ")}`);
    process.exit(1);
  }

  if (flags.has("--schema")) {
    console.log(JSON.stringify(tool.inputSchema ?? {}, null, 2));
    process.exit(0);
  }

  if (tool.annotations?.destructiveHint && !flags.has("--yes")) {
    console.error(
      `${toolName} está marcada como destructiva por el servidor.\n` +
        "Revisa los argumentos y repite con --yes si es lo que quieres:",
    );
    console.error(`  npm run mcp:call -- --yes ${toolName} '${rawArguments ?? "{}"}'`);
    process.exit(1);
  }

  let toolArguments = {};
  if (rawArguments) {
    try {
      toolArguments = JSON.parse(rawArguments);
    } catch (error) {
      console.error(`Los argumentos no son JSON válido: ${error.message}`);
      process.exit(1);
    }
  }

  console.log(`Credencial: ${source}`);
  console.log(`Herramienta: ${toolName} ${JSON.stringify(toolArguments)}\n`);

  const result = await rpc(token, "tools/call", { name: toolName, arguments: toolArguments });
  const text = firstText(result);

  if (flags.has("--json")) {
    console.log(JSON.stringify(result?.structuredContent ?? result, null, 2));
  } else if (text) {
    console.log(text);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }

  if (result?.isError) process.exit(1);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
