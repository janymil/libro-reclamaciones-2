# Mercado Pago MCP server

`https://mcp.mercadopago.com/mcp` — MCP protocol `2025-06-18`, 11 tools, OAuth 2.1
(authorization code + PKCE, scopes `offline_access read write`, refreshable).

This server works **on your Mercado Pago developer account**: it creates
applications, reads their credentials, creates test users, configures webhooks
and runs integration diagnostics. It does not deploy code and the application
does not use it at runtime — the app keeps using `MERCADOPAGO_ACCESS_TOKEN` from
`.env`.

## Two credential levels (this is the part that surprises everyone)

| Tool | Panel token (`APP_USR-…`, `.env`) | OAuth session (`npm run mcp:login`) |
| --- | --- | --- |
| `application_list` | yes — verified | yes |
| `search_documentation` | yes — verified | yes |
| `notifications_history` | **no** — verified: *OAuth ownership validation failed* | yes |
| `quality_checklist` | **no** — verified: *OAuth ownership validation failed* | yes |
| `create_application` | **no** — documented as OAuth-only | yes |
| `get_credentials` | **no** — documented as OAuth-only | yes |
| `save_webhook`, `create_test_user`, `add_money_test_user`, `form_homologation`, `quality_evaluation` | not ownership-gated (not yet exercised with a panel token) | yes |

So: a panel token is enough to *look around*, but the moment the server has to
prove the app belongs to you (`create_application`, `get_credentials`,
`notifications_history`, `quality_checklist`) it requires a user-delegated OAuth
token. That is by design — those tools can mint credentials.

## One-time OAuth login

```powershell
npm run mcp:login
```

What it does: discovers the OAuth metadata for the `/mcp` path, registers a
public client dynamically (`/oauth/register/mcp`), opens the browser on
`https://auth.mercadopago.com/mcp/authorization`, listens on
`http://127.0.0.1:8788/callback` for the code, exchanges it and stores the
session **outside the repository**:

```
%USERPROFILE%\.mercadopago-mcp\oauth.json      (Windows)
~/.mercadopago-mcp/oauth.json                  (Linux/macOS)
```

Override with `MERCADOPAGO_MCP_OAUTH_FILE`; change the callback port with
`--port 8790` (the dynamic client is bound to the redirect URI, so a different
port registers a new client).

```powershell
npm run mcp:login -- --status    # is there a usable session? when does it expire?
npm run mcp:login -- --logout    # delete it
npm run mcp:login -- --no-wait   # register + print the authorize URL only
npm run mcp:login -- --force     # register a brand-new OAuth client (stale client_id)
```

Access tokens are short-lived; every script refreshes them automatically with
the stored `refresh_token`. If the refresh fails, run `npm run mcp:login` again.

> The login is interactive by nature — it is your Mercado Pago account
> password/2FA. No script here can (or should) automate that step.

## Daily commands

```powershell
npm run mcp:smoke                                  # handshake + tool list + 2 read-only calls
npm run mcp:smoke -- --oauth-check                 # also calls notifications_history (proves OAuth)
npm run mcp:call -- --list                         # tools, with "solo lectura"/"destructiva" hints
npm run mcp:call -- --schema create_application    # full JSON schema of one tool
npm run mcp:call -- application_list
npm run mcp:call -- <tool> '<json arguments>'
```

`mcp:call` uses the OAuth session when present and falls back to
`MERCADOPAGO_ACCESS_TOKEN`. Tools the server marks as **destructive**
(`save_webhook`, `add_money_test_user`) refuse to run without `--yes`. Output is
printed as text; add `--json` for the raw result.

## Recipes for "new app + new test users"

All of these need the OAuth session (see the matrix above).

### 1. Create the application

```powershell
npm run mcp:call -- create_application '{"name":"LibroDigital Checkout Pro","payment_solution":"online_payments","product":"checkout_pro","platform":"self_developed","description":"Libro de Reclamaciones - pagos y suscripciones"}'
```

* `payment_solution`: `online_payments` | `in_person_payments`.
* `product`: `checkout_pro`, `checkout_api`, `checkout_bricks`, `subscription`
  (online) or `point`, `qr_code`, `smart_app` (in person).
* `api_type`: only for `checkout_api` — `orders` (recommended) or `payments`.
* **Do not send `site_id`**: it is filled from the OAuth account country (Peru →
  `MPE`). Name ≤ 50 alphanumeric characters, description ≤ 150.
* Save the returned application id; `product_id` comes back with it and is what
  `form_homologation` expects (21 Checkout Pro, 24 Checkout API, 26 Bricks,
  28 Subscription, 33 QR, 36 Point, 45 Smart App).

### 2. Read its credentials

```powershell
npm run mcp:call -- get_credentials '{"application_id":"<APP_ID>"}'
```

Returns `client_id`, `client_secret`, `access_token`, `public_key` and the test
variants. Use them to fill `.env` (`MERCADOPAGO_ACCESS_TOKEN`,
`MERCADOPAGO_SANDBOX`) — the server reminds you they are sensitive, and so does
this file: never paste them into chat, tickets or commits.

### 3. Create test users

```powershell
npm run mcp:call -- create_test_user '{"site_id":"MPE","description":"comprador checkout pro","profile":"buyer","amount":1000}'
npm run mcp:call -- create_test_user '{"site_id":"MPE","description":"vendedor pruebas","profile":"seller"}'
npm run mcp:call -- --yes add_money_test_user '{"test_user_id":<ID>,"amount":500}'
```

`profile`: `buyer` | `seller` | `integrator`. The initial `amount` is in the
country's currency and is validated against local limits. The test user comes
back with its own credentials — that is the "test client" to use in checkout
flows.

### 4. Point the webhook at this project

```powershell
npm run mcp:call -- --yes save_webhook '{"callback":"https://librodigital.pe/api/payments/webhook/mercadopago","topics":["payment","subscription_preapproval","subscription_authorized_payment"]}'
```

* `callback` must be **HTTPS, public** and cannot be a private IP or a
  mercadolibre/mercadopago domain (max 400 chars). Locally, expose the dev server
  with a tunnel (`cloudflared`, `ngrok`) and use `callback_sandbox` for tests.
* Topics this project cares about: `payment` (one-off payments) and the
  `subscription_*` family (plan subscriptions). Full list accepted by the server:
  `payment`, `order`, `topic_merchant_order_wh`, `topic_chargebacks_wh`,
  `topic_claims_integration_wh`, `subscription_preapproval`,
  `subscription_preapproval_plan`, `subscription_authorized_payment`,
  `mp-connect`, `topic_card_id_wh`, `topic_wallet_integration`, `wallet_connect`,
  `point_integration_wh`, `shipping`, `delivery`, `stop_delivery_op_wh`.
* `save_webhook` **replaces** the configuration of that application, so `--yes` is
  required and existing topics must be repeated.

### 5. Diagnose what is failing

```powershell
npm run mcp:call -- notifications_history '{"application_id":"6220689569168051"}'
npm run mcp:call -- quality_checklist '{"application_id":"6220689569168051"}'
npm run mcp:call -- quality_evaluation '{"payment_id":123456789,"application_id":"<TEST_APP_ID>"}'
```

* `notifications_history` is the fastest way to answer "was the webhook even
  delivered?" — it shows successful and failed deliveries with error analysis.
  Pair it with `GET /api/payments/webhook/mercadopago` reachability checks.
* `quality_evaluation` needs a payment or order created with **TEST** credentials
  in the last 7 days. Use `payment_id` (Payments API / Checkout Pro) or
  `order_id` (Orders API), never both; for MCP-created apps pass the seller test
  app's id as `application_id`.

### 6. Documentation and homologation

```powershell
npm run mcp:call -- search_documentation '{"term":"webhooks","language":"es","siteId":"MPE","limit":5}'
npm run mcp:call -- form_homologation '{"action":"get_form","product_id":21,"lang":"es","site_id":"MPE"}'
```

`form_homologation` is a two-step tool: `action:"get_form"` returns the questions
for that `product_id`; `action:"submit"` saves the answers in `form_values`.
Missing fields are reported explicitly.

## Wiring it into the editor

### VS Code (user-level MCP config, OAuth handled by VS Code)

`%APPDATA%\Code\User\mcp.json` — note the `servers` key, not `mcpServers`:

```json
{
  "servers": {
    "mercadopago": {
      "type": "http",
      "url": "https://mcp.mercadopago.com/mcp"
    }
  }
}
```

Then **MCP: List Servers** → `mercadopago` → start/authenticate: VS Code opens
the Mercado Pago login and keeps/refreshes the tokens itself. This is the path
that gives the agent all 11 tools.

### Cline

`%USERPROFILE%\.cline\data\settings\cline_mcp_settings.json` (remote servers use
`streamableHttp`; older builds call it `sse`):

```json
{
  "mcpServers": {
    "mercadopago": {
      "type": "streamableHttp",
      "url": "https://mcp.mercadopago.com/mcp",
      "headers": { "Authorization": "Bearer APP_USR-…" },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

Cline does not refresh OAuth tokens, so the header is normally the application
token from `.env`: verified for `application_list` and `search_documentation`, and
expected to work for the tools that do not validate ownership (`save_webhook`,
`create_test_user`, `add_money_test_user`, `form_homologation`). For the
OAuth-only tools, use `npm run mcp:call …` in the terminal (it refreshes
transparently) instead of pasting a short-lived token into a config file.

### Copilot (already configured)

`%USERPROFILE%\.copilot\mcp-config.json` contains `mercadopago-mcp` as an `http`
server. Copilot is expected to run the OAuth flow on first use; it does **not**
share the session from `npm run mcp:login` (that file is for these scripts).
Note the Copilot CLI is not installed on this machine (`copilot mcp …` will ask
to install it), so prefer the VS Code MCP list above.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `401 {"code":401,"message":"Authentication failed"}` | No token, or an expired one. `npm run mcp:login -- --status`. |
| `OAuth ownership validation failed` | A panel token was used on an ownership-validated tool. Log in and retry (the scripts do this automatically once a session exists). |
| `MCP name not found or invalid: register path not found in URI` | The client used the root `/.well-known/oauth-authorization-server` document. For `/mcp` the registration endpoint is `/oauth/register/mcp` (path-aware discovery). The scripts handle this; a hand-rolled client must too. |
| Browser says *"La aplicación no está preparada para conectarse a Mercado Pago"* | The stored dynamic client is stale (deleted/belonging to a removed app). Re-register it: `npm run mcp:login -- --force`. |
| Login times out | Nothing arrived on `127.0.0.1:8788`. Check the browser needs the exact URL, or a firewall blocks the loopback redirect. |
| `EADDRINUSE` on login | `npm run mcp:login -- --port 8790`. |
| Works yesterday, 401 today | Access token expired and refresh failed (revoked/expired refresh token). `npm run mcp:login -- --force` (re-registers the client). |
| `save_webhook` refused | It is destructive: add `--yes` and double-check the topics you are replacing. |

## Safety notes

* `MERCADOPAGO_ACCESS_TOKEN` in `.env` is a **production** credential
  (`APP_USR-…`) for the app *Libro Digital de Reclamaciones* (id
  `6220689569168051`). These tools can create apps, test users and rewrite
  webhooks in that account — treat every `--yes` as a production change.
* The OAuth session lives in your user profile and can be revoked with
  `npm run mcp:login -- --logout` (and from the Mercado Pago panel's authorized
  applications). It is never written into the repository.
* Never paste credentials returned by `get_credentials` into chat, issues, logs
  or commits; put them in `.env` (or `ENV_FILE`) only.
