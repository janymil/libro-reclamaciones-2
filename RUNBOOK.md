# Production Runbook — LibroDigital.pe

Operational procedures for the P0 items in [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).
Written so someone who did not write the code can execute them.

---

## 0. Required production environment

Inject these from the platform's secret store — never a committed file. `.env.example`
documents every variable.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | **yes** | Neon serverless PostgreSQL. |
| `SESSION_SECRET` | **yes** | The server refuses to boot without it. Generate with `openssl rand -hex 32`. |
| `APP_URL` | **yes** | Must be the real domain (`https://librodigital.pe`): every email link is built from it. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | **yes** | Zoho Mail (`smtp.zoho.com`, port 465). `SMTP_PASSWORD` must be an **app-specific password**, not the mailbox password. Without them no email is ever delivered. |
| `SMTP_FROM_NAME`, `SMTP_FROM_EMAIL` | recommended | Sender identity on all transactional mail (`LibroDigital.pe` / `hola@librodigital.pe`). Consumer-facing complaint mail is presented as the **business** (its name, logo, contact data and a Reply-To to its own inbox); the platform is only named in a discreet "Gestionado con LibroDigital.pe" line. |
| `SMTP_ALLOWED_SENDER_DOMAINS` | only for a tenant's own sender address | Comma-separated domains the mail host lets the platform send **as** (default `librodigital.pe`). A business can ask to send its consumer emails from its own address (Personalización → Remitente propio, Pro), but Zoho only accepts an address whose domain has verified SPF/DKIM records. Any address outside this list is ignored at send time and the console says so; the message still goes out as `SMTP_FROM_EMAIL` with the business's display name and Reply-To. |
| `PAYMENTS_ALERT_EMAIL` | recommended | `hola@librodigital.pe`. Without it a paid-but-unmatched subscription is only logged. |
| `PLATFORM_ADMIN_EMAILS` | ⚠️ bootstrap only | Comma-separated e-mails that get operator rights **in the app** (the team's panel, confirming a transfer, managing customers). The durable grant is now `users.is_platform_admin`, set from the panel's **Equipo** tab or by `npm run db:admin -- --email <correo>`; this list survives only as the bootstrap door of the first operator and as an emergency way back in. Never a tenant role: every customer is `admin` of their own business. Empty + no flagged operator ⇒ nobody can confirm a transfer and paid transfers stay `pending` forever. |
| `VITE_ADMIN_PATH` | recommended | Where the team's console lives (default `/acceso/operaciones-7f31`). **Never `/admin`**: that is the first path scanners try, so it stays a 404. The client bakes it at build time and the server reads it for `X-Robots-Tag: noindex`, so both must agree in a deployment. There is **one** sign-in page for everybody (`/acceso`): the server names the kind of account (`isPlatformAdmin` in the login response and in `/api/auth/user`) and the app routes it - operator ⇒ console, customer ⇒ `/panel`. Logging out returns to `/acceso`, where logging in again lands on the right screen by itself. |
| `PAYMENTS_MANUAL_INSTRUCTIONS` | optional fallback | The customer-facing text for the "transferencia / Yape directo" checkout: your Yape number, the account/CCI, the account holder and where to send the receipt. **Prefer the console:** the panel's **Configuración** tab stores these details in `platform_payment_settings` and takes precedence (no deploy to change a number); this variable is only the fallback while that row is empty. With neither configured, the customer is told to ask you for the details. |

| `TRUST_PROXY` | recommended | Hop count (or CIDR list) for the Cloudflare proxy. Defaults to 1. See §9.1. |
| `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` | optional | Absent ⇒ AI falls back to local heuristics. The provider is any OpenAI-compatible endpoint; production defaults to Groq with `openai/gpt-oss-120b`. |
| `AI_MODEL_FAST`, `AI_AGENT_MODEL` | optional | Fast model for classification/assistance (`openai/gpt-oss-20b` by default) and the model for the compliance co-pilot (defaults to `AI_MODEL`). |
| `AI_EMBEDDINGS_MODEL` | optional | Enables embeddings-based similar-complaint detection. Groq has no `/embeddings` endpoint; leave unset to use the local TF-IDF fallback. |
| `AI_FALLBACK_BASE_URL`, `AI_FALLBACK_API_KEY`, `AI_FALLBACK_MODEL` | optional | Second OpenAI-compatible provider. It is used only when the primary call fails; `AI_FALLBACK_MODEL` defaults to the primary model. Leave unset for a single provider. |
| `AI_PRICE_INPUT_PER_MTOK`, `AI_PRICE_OUTPUT_PER_MTOK` | optional | Price per million tokens in USD, used only to show an estimated cost in the per-tenant AI usage meter. Unset ⇒ cost is shown as "—", tokens are still counted. |
| `RUC_API_PROVIDER`, `APISNET_API_TOKEN`, `DECOLECTA_API_TOKEN` | optional | Auto-fills the razón social on the registration form. Defaults to the anonymous apis.net.pe endpoint; a token raises the quota. Absent/down ⇒ the user types the razón social manually (the endpoint answers `provider_unreachable` / `provider_rate_limited`, never "RUC not found"). |
| `PORT` | optional | Defaults to 5000. |

**Boot check** (run after every deploy):

```powershell
curl.exe -fsS https://<domain>/health   # 200 {"status":"ok",...}
curl.exe -fsS https://<domain>/ready    # 200, checks.database.status == "up"
```

---

## 0.1 Where the secrets physically live (dev vs VPS)

**An application cannot hide a secret from the machine it runs on.** Whatever the
process can read — its environment, `/proc/<pid>/environ`, a file next to the
code — anyone with the same OS permissions can read too. So the app-side job is
only to *stop assuming the file is inside the project*; the protection itself is
an OS/platform concern. That is what `ENV_FILE` and this section are for.

`server/env.ts` reads, in this order:

| # | Source | Notes |
|---|---|---|
| 1 | **The process environment** | systemd `EnvironmentFile=`, Docker `environment:`/`secrets:`, Kubernetes, `doppler run`, `infisical run`. **Always wins**: Node's `process.loadEnvFile()` never overwrites a variable that is already set, so a stale file on the server cannot shadow the real secret store. |
| 2 | **`ENV_FILE`** | Path to an env file *outside* the repository (`/etc/librodigital/app.env`). Relative values resolve against the working directory. If it is set and the file is missing, the server **refuses to boot** instead of starting with development defaults. |
| 3 | **`<repo>/.env`** | The historical location, used only when `ENV_FILE` is unset. Convenient for development; never correct on a server. |

`npm run db:apply`, `db:backup`, `db:restore`, `db:demo`, `email:diagnose` and
`db:push` resolve the same way (`scripts/load-env.mjs`, `drizzle.config.ts`).

### Development machine (Windows)

One-time move, after which the workspace holds no passwords at all:

```powershell
New-Item -ItemType Directory -Force "$HOME\.librodigital" | Out-Null
Move-Item .env "$HOME\.librodigital\dev.env"        # once, from the repo root
setx ENV_FILE "$HOME\.librodigital\dev.env"         # persists for new shells
```

Every later shell (and therefore `npm run dev`, `npm run db:backup`, `npm run
email:diagnose`, …) finds the file automatically. To scope it to a single session
instead, set `$env:ENV_FILE` in that terminal only. A `.env` inside the repo can
stay as a decoy with non-secret local values — or be deleted: with no
`DATABASE_URL` at all the app boots on the embedded PGlite database in
`.local-db`.

*Variant: keep the file in the repo but encrypted.* `npx @dotenvx/dotenvx encrypt`
turns `.env` into ciphertext and writes the private key to `.env.keys` (already
git-ignored), so an agent or a code host only ever sees ciphertext; start the app
with `npx dotenvx run -- npm run dev` and keep `.env.keys` in your password
manager. `sops`/`age` work the same way.

### VPS — option A: systemd `EnvironmentFile` (no extra software)

The baseline that satisfies "secure storage on the VPS": the file lives outside
the deploy directory, is unreadable by every account except `root` and the
service user, and survives a `git pull`/rsync of the app.

```bash
# Once. 0750 on the directory, 0640 on the file: only root and the
# `librodigital` group can look inside.
sudo install -d -m 0750 -o root -g librodigital /etc/librodigital
sudo install -m 0640 -o root -g librodigital app.env /etc/librodigital/app.env
```

```ini
# /etc/systemd/system/librodigital.service
[Service]
User=librodigital
WorkingDirectory=/srv/librodigital
Environment=NODE_ENV=production
EnvironmentFile=/etc/librodigital/app.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=3
# Hardening: the process cannot write to the app directory (except the uploads it
# legitimately needs), cannot see other users' home directories, cannot gain
# privileges, and gets a private /tmp.
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/srv/librodigital/uploads
```

Why that is enough:

* systemd hands the variables to the process from a file only `root:librodigital`
  can read — no placeholder in the repo, no password in `git`, `ps`, the journal
  or a CI log.
* `/proc/<pid>/environ` is mode `0400` owned by the service user, so no other
  unprivileged account on the box can read the running process's secrets.
* Never pass a secret as a command-line argument (world-readable in `ps`) and
  never put one in a Dockerfile `ENV`, a JS bundle, or `client/`: anything with a
  `VITE_` prefix ships to the browser.

### VPS — option B: encrypted at rest with `systemd-creds`

When the requirement also includes "the file on disk must be useless to anyone who
copies it", encrypt it with the host key (TPM, or `/var/lib/systemd/credential.secret`):

```bash
sudo systemd-creds encrypt --name=librodigital-env \
  /etc/librodigital/app.env /etc/librodigital/app.env.cred
sudo shred -u /etc/librodigital/app.env        # the plaintext is no longer needed
```

```ini
[Service]
LoadCredentialEncrypted=librodigital-env:/etc/librodigital/app.env.cred
# systemd decrypts into a root-only tmpfs and the app reads it from there;
# `set -a` exports every KEY=VALUE in the file.
ExecStart=/bin/sh -c 'set -a; . "$CREDENTIALS_DIRECTORY/librodigital-env"; exec /usr/bin/node dist/index.js'
```

The `.cred` file cannot be decrypted on another machine, so a stolen backup, a
snapshot or a copied disk yields nothing. Rotating = re-run `systemd-creds encrypt`
and `systemctl restart librodigital`.

### VPS — option C: Docker

```yaml
# compose.yaml — the env file stays OUTSIDE the build context (/etc/librodigital),
# so it is in no image and no layer.
services:
  app:
    build: .
    user: "1001:1001"                     # never root
    env_file: /etc/librodigital/app.env   # or mount it as a secret instead
    secrets:
      - app_env
    read_only: true
    tmpfs: [/tmp]
    volumes: [/srv/librodigital/uploads:/app/uploads]

secrets:
  app_env:
    file: /etc/librodigital/app.env
```

`docker secrets` are mounted as files on a tmpfs (`/run/secrets/app_env`), never
as environment variables, and never show up in `docker inspect`. The app reads
them by pointing `ENV_FILE` at the mount (`ENV_FILE=/run/secrets/app_env`).

### VPS — option D: a real secret manager (audit log + rotation)

Once more than one person or service needs access, files stop being enough and a
manager is the honest answer. Each wraps the process:

| Tool | Start command | Where its own credential lives |
|---|---|---|
| Doppler | `doppler run -- node dist/index.js` | 0600 file or a systemd credential |
| Infisical | `infisical run -- node dist/index.js` | same |
| HashiCorp Vault | `vault agent` renders an env file on a tmpfs | AppRole token |

They add what a file cannot: per-secret access control, an audit log of who read
what, and rotation without touching the host. Because they export into the
process environment, they take precedence automatically (source 1 above).

### Verify the setup after deploying

```bash
sudo -u librodigital cat /etc/librodigital/app.env > /dev/null && echo "service can read it"
sudo -u nobody       cat /etc/librodigital/app.env    # MUST fail: Permission denied
sudo tr '\0' '\n' < /proc/$(pgrep -f 'dist/index.js')/environ | cut -d= -f1 | sort
# ^ prints variable NAMES only - spot-check that nothing stray is exposed
git ls-files | grep -E '^\.env$'   # MUST print nothing
```

Anything that has ever sat in the workspace has to be rotated before you rely on
this: the Neon role password, the Zoho app-specific password, `SESSION_SECRET`,
the AI key and the payment/WhatsApp tokens have all been readable files on a
development machine — §1 is the procedure.

---

## 1. Secret rotation (before the first deploy, and after any leak)

`DATABASE_URL` and `AI_API_KEY` currently live in a local `.env` and have been handled
outside a secret store. Rotate both:

1. **Neon** — console → project → *Roles* → reset the password for the app role, then
   update `DATABASE_URL` in the platform's secret store and redeploy.
2. **AI provider** — revoke the old key at the provider (e.g. `console.groq.com`) and
   issue a new one; update `AI_API_KEY`.
3. **`SESSION_SECRET`** — generate a fresh value (`openssl rand -hex 32`). NOTE: this
   invalidates every existing session, so do it before launch or in a maintenance window.
4. Confirm `.env` is **not** committed: `git ls-files | Select-String '^\.env$'` must
   return nothing.
5. Redeploy, then re-run the boot check above.

---

## 2. Health and readiness probes

| Endpoint | Purpose | Expected |
|---|---|---|
| `GET /health` | Liveness — the process is up. Never touches the DB, so a database blip cannot cause a restart loop. | `200 {"status":"ok"}` |
| `GET /ready` | Readiness — runs a real `select 1`. Used by the load balancer and uptime monitors. | `200 status:"ready"`, or `503 status:"degraded"` when the DB is unreachable |
| `GET /api/status` | Human-facing component report (API, DB, AI, email, background jobs). | `200` — **trust `/ready`, not this, for uptime** |

Point the uptime monitor at `/ready` (not `/` and not `/api/status`): it is the only
endpoint that fails when the database is down.

---

## 3. Monitoring and alerting (not yet wired — do this before launch)

Nothing currently reports failures to a human. Minimum viable set:

1. **Uptime monitor** → `GET /ready`, 1-minute interval, alert after 2 consecutive failures.
2. **Error tracking** (Sentry or equivalent) → capture unhandled 5xx. The server already
   logs them via `console.error('Unhandled error:', err)` in `server/index.ts`; that is
   where a `captureException(err)` call belongs.
3. **Security-log alert** → the app already emits one JSON line tagged `[security]` per
   401/403 on `/api` (`server/middleware/securityLog.ts`). Alert on bursts: that is the
   signature of credential stuffing or a tenant-isolation bug.
4. **Background jobs** → `GET /api/status` reports `jobs.retention` and
   `jobs.slaMonitoring` with `lastRun` / `lastResult`. Alert if `lastRun` is older than
   2× the interval (daily / hourly), or if `lastResult` starts with `error:`.

---

## 4. Database backup and restore drill

Backup:

```powershell
npm run db:backup -- backups/manual-20261013.json users businesses complaints complaint_attachments
```

**Restore drill — run this at least once against a scratch database.** An untested
backup is not a backup:

```powershell
# 1. Provision a scratch Neon branch/database and point a TEST DATABASE_URL at it
#    (e.g. via a local .env.scratch file). DESTRUCTIVE: it TRUNCATEs the tables.
# 2. Restore:
node --env-file=.env.scratch scripts/restore-tables.mjs backups/manual-20261013.json --yes
# 3. Verify the printed row counts match the source, then boot the app against it.
```

`scripts/restore-tables.mjs` TRUNCATEs every table present in the dump before
re-inserting, and refuses to run without `--yes`. It also rejects any table name that is
not a plain SQL identifier, so a tampered dump file cannot inject SQL.

Also confirm Neon's own point-in-time-recovery window is enabled for the production
project, and record the retention period here: ______ .

---

## 5. Release checklist (every deploy)

```powershell
npm ci
npm run check          # typecheck client + server + shared
npm test               # unit + route tests
npm run build          # client bundle + bundled server
npm run audit:security # production dependencies, fails on high+
```

Then apply any pending manual migration (§7) before starting the new version.

Then: deploy → `curl /health` → `curl /ready` → confirm the error tracker is receiving
events → smoke-test login and one public complaint submission.

`.github/workflows/ci.yml` runs the same chain on every push and pull request, so this
checklist is enforced automatically for anything merged to `main`.

### A user reports "the app still looks old" after a deploy

Almost always the **service worker**, not the server: it was filling navigations from its own
cache. Two things changed so this cannot happen again — `sw.js` v2 serves **documents
network-first** (cache only as the offline fallback) and dev unregisters any leftover worker on
boot (`client/src/main.tsx`). A browser that is currently stuck on the old shell is the one case
the fix cannot reach by itself, because the page it renders comes from that very cache.

**One URL fixes it** — the recovery page, `GET /reset.html` (also served in production, and
`/sw.js` + `/reset.html` are served `no-store`):

```
https://<app-host>/reset.html     # unregisters every worker, clears every cache, reloads the app
```

Give that link to the user (or open it yourself). It also prints a fallback hint (incognito, or
DevTools → Application → Storage → Clear site data) if the automatic cleanup fails. Verify the fix
is reachable with `curl -I https://<app-host>/reset.html` → `200` and `Cache-Control: no-store`.

---

## 6. Onboarding, email verification and access requests

Registered by `POST /api/auth/register` (step 1: account + emailed password and confirmation
link) and finished by `POST /api/auth/complete-onboarding` (step 2: business + Libro + first
establishment). **`POST /api/businesses` (Empresas → "Nueva Empresa") finishes the same write**
for a company registered outside the wizard: it takes the company profile *plus* the Libro
(`libro: { libroName, businessType, urlSlug?, notificationEmail? }`) and calls the same
transaction, so a company is never created without its book.

**The step-2 write is one transaction.** `storage.completeOnboarding` creates the tenant, the
access grant, the Libro configuration, the default establishment and its Libro de Reclamaciones
(`books` row), and flags the user as onboarded only as its last statement. Either the account is
fully usable or nothing changed - a failure returns
`500 {"code":"onboarding_failed","message":"...no se guardaron..."}` and the wizard can simply
be retried. When the caller already has an active company (an additional RUC), the tenant is
created with `makeActive: false`: it joins the switcher but does not steal `users.business_id`.

**The first establishment is named after what the user typed** (`defaultEstablishmentFor`):
the name of the Libro, else the commercial name, else the razón social. It used to be a
hard-coded "Casa Matriz", so a tenant that named its book "Wong" saw "Casa Matriz" on
Sucursales, Libros and the public portal. The sales channel still decides the identification
code (`ONLINE-01` for `tienda_virtual`, `SUC-001` otherwise), and an existing sucursal can be
renamed from /sucursales (`PATCH /api/establishments/:id`).

**One public Libro per company, one register per local.** `libro_configuration.business_id`
is UNIQUE: one public link, one QR, one notification inbox and one branding for the whole
company, and the consumer **chooses the establishment** in the complaint form (the portal
lists them). The folio is `YYYY-NNNN` and unique **per company** (not per local), so a
correlative quoted by a consumer is unambiguous across sucursales. What each establishment has
is its own row in `books`: the per-local register that `/libros` lists and exports
(GET /api/books/:id/download renders the complaints of that establishment) for a local
inspection. `POST /api/establishments` commits that register together with the establishment
in ONE transaction (`storage.createEstablishmentWithBook`), and the registration does the same
for the first local. Note the public intake does NOT consult `books` - it validates the
business + establishment - so a legacy local without a register still receives complaints; the
register is what makes its records exportable (and what the "Primeros pasos" row on /panel
flags).

**The wizard asks how the business operates** (un solo local / casa matriz + sucursales / solo
online) and then names its first establishment accordingly: one local takes the business's
name, a chain gets "Casa Matriz - <marca>" plus an optional total, an online-only store gets
its brand with the `ONLINE-01` channel. A live panel lists what the transaction will write.
Afterwards `/panel` shows **Primeros pasos** for real accounts (never for the shared demo):
libro publicado, correo de reclamos confirmado (with a resend button), locales pendientes vs
the total declared at signup, and a row that appears whenever `books < establishments` - i.e.
the same repair a legacy tenant needs. It disappears when nothing is pending, and the customer
can close it (per browser).

**Closing a local does not delete it.** /sucursales can deactivate a sucursal
(`PATCH /api/establishments/:id { isActive: false }`): it leaves the public portal list and the
intake refuses new complaints for it (409, even from an already-printed QR), while its register
and the complaints it already received stay intact - and the admin list keeps showing it so it
can be reactivated with the same code. The plan's sucursal quota counts active ones only.
`/libros` presents the result the way the customer thinks about it: ONE "Libro de Reclamaciones"
card (name, public link, QR, all-company folios) and, below it, a "Registros por local" table
with one row per local (its own PDF export, its description, and a "Crear registro" action when
a legacy local predates the automatic register). The old "Libro activo" toggle is gone: it was
never read by anything, and "this local is closed" belongs to the establishment.

Two situations that used to be permanent dead ends are now recoverable:

| Situation | Response | What to do |
|---|---|---|
| A previous attempt already created the tenant for this RUC | `200`, `"resumed": true` | nothing - the retry finishes the Libro and establishment |
| The RUC belongs to another account | `409 {"code":"ruc_already_registered"}` | the client offers *Solicitar acceso* |
| The public URL is taken | `409 {"code":"slug_taken"}` | choose another URL in step 2 |
| Already configured | `409 {"code":"already_onboarded"}` | go to `/panel` |
| The account's mailbox is unconfirmed | `403 {"code":"email_not_verified"}` | confirm the email (the wizard offers *Reenviar enlace*) |

**Access requests.** `POST /api/businesses/access-requests { ruc, message? }` records the
request and emails the tenant's administrators; `GET /api/businesses/access-requests` lists the
incoming ones for the caller's tenants, `.../mine` lists the ones the caller sent, and
`POST /api/businesses/access-requests/:id/approve|reject` decides. Only an administrator of the
affected tenant can decide (anything else is a 404), nobody can approve their own request, and
a request that was already decided answers `409 already_decided`.

**Email verification.** `users.is_email_verified` is now set by something real:

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/verify-email { token }` | consumes the link from the welcome (or resend) email |
| `POST /api/auth/resend-verification` | issues a fresh link for the signed-in account |
| Page `/acceso/verificar-email?token=…` | the page the email links to |
| Banner in the panel | shown while the address is unconfirmed (hidden for demo accounts) |

Tokens live 24 hours, are replaced on every resend, and are cleared in the same UPDATE that
sets the flag. A URL whose token was already used answers
`400 {"verified":false,"message":"...no es válido o ya fue usado."}` rather than confirming
twice. Accounts created before this feature ships stay `false` on purpose - the banner invites
them to confirm (or to reset their password, which confirms it) - because "verified" must keep
meaning "a human confirmed this mailbox".

**The flag is ENFORCED (`server/services/verificationService.ts`).** The mailbox is where every
complaint notification lands, so a business publishes its Libro only once at least one *active
administrator* of that tenant has confirmed it:

| Where | Behaviour |
|---|---|
| `POST /api/auth/complete-onboarding` | `403 {"code":"email_not_verified"}`: no company/libro from an unconfirmed account (demo accounts excluded - nobody can confirm them) |
| `POST /api/public/complaints` | `403 {"code":"libro_not_published"}`: consumers cannot file against an unpublished book |
| `GET /api/public/libro/:slug` | `libro.acceptingComplaints: false`, rendered by the portal as "Este Libro aún no está en línea" instead of a form |

`ALLOW_UNVERIFIED_BUSINESSES=true` disables the check in both places. Use it only for a legacy
tenant whose book is already live; without it, that tenant stops receiving complaints until its
administrator confirms. Changing the account's email clears `is_email_verified` and re-sends the
confirmation link to the NEW address (`PATCH /api/users/profile`).

**Code login ("entra con un código por email").**

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/request-code { email }` | emails a 6-digit, bcrypt-hashed, single-use code (10 min). Answers the same for known and unknown addresses |
| `POST /api/auth/login-with-code { email, code }` | exchanges the code for a session (same session regeneration as the password route) |
| UI at `/acceso` | "Entrar con un código por email" (6-slot input, resend, "usar otro correo") |

The code is burned after 5 wrong tries, and the failure counter and the 30-minute lockout are
shared with the password path, so neither route can be used to bypass the other's throttling.

**Deletion ("abandon the app").** Three endpoints, every one of them audited in `auth_audit_log`
(`user_deleted`, `account_deleted`, `business_closed`):

| Endpoint | Who | Behaviour |
|---|---|---|
| `DELETE /api/users/:id` | admin of the same tenant | removes a login. `400 own_account` for your own account, `409 last_administrator` for the tenant's last active admin |
| `DELETE /api/users/me?closeBusiness=true` | the account itself | removes the caller's login and ends the session. Without `closeBusiness=true` it answers `409 last_administrator` when the company would be left ownerless |
| `POST /api/businesses/:id/close` | admin of the tenant | closes the company: cancels the recurring charge and takes the Libro offline (`libro_configuration.is_active = false`, so the public portal 404s and intake rejects) |

What happens to the data is a legal decision, not an implementation detail. A tenant with **zero
complaints** is erased outright — logins, grants, libro, establishments, notifications, API keys,
webhooks (`server/storage/purge.storage.ts`). A tenant **with complaints** keeps them: they are a
legal record with the 2-year retention the landing page promises, the team keeps read access to
answer them, and the retention job purges them when the window closes. `payments`/`subscriptions`
and the `auth_audit_log`/`login_attempts` trail are never deleted (accounting, and the security
forensics that make an abuse investigation possible after the account is gone).

UI: Mi Perfil → **Zona de riesgo** (delete my account, with a "close my company too" checkbox when
the caller is its last administrator) and Empresas → the trash button on a card, which asks for the
company name in writing because the action cannot be undone.

---

## 7. Manual migrations (schema)

`migrations/manual/*.sql` are **not** applied automatically (see the header of each file).
Run them deliberately, in order, against every environment:

```powershell
npm run db:apply -- migrations/0006_login_codes.sql                       # login_code_* columns for the code login
npm run db:apply -- migrations/0008_platform_payment_settings.sql         # console "Configuración": our Yape number / bank accounts
npm run db:apply -- migrations/0009_platform_settings_pricing_discounts.sql  # console: alerts, identity, flags, price list, discounts, audit
npm run db:apply -- migrations/0010_expected_establishments.sql           # businesses.expected_establishments (locales declarados)
npm run db:apply -- migrations/0011_libro_privacy_policy_url.sql          # libro_configuration.privacy_policy_url (política de privacidad del consentimiento)
npm run db:apply -- migrations/manual/0006_business_access_requests.sql   # access-request table
npm run db:apply -- migrations/manual/0007_users_role_default.sql         # users.role DEFAULT/NOT NULL
npm run db:apply -- migrations/manual/0008_trial_lifecycle_backfill.sql   # trial_ends_at for pre-0003 tenants
npm run db:apply -- migrations/manual/0009_normalize_plan_ids.sql         # legacy 'basic' -> 'gratis'
npm run db:apply -- migrations/manual/0010_rebrand_domain_emails.sql      # @librovirtual.pe -> @librodigital.pe
npm run db:apply -- migrations/manual/0011_provision_missing_books.sql    # Libro de Reclamaciones of pre-existing establishments
```

`0008_platform_payment_settings.sql` is the console's **Configuración** tab (not to be
confused with `migrations/manual/0008_trial_lifecycle_backfill.sql`): the singleton
`platform_payment_settings` row holding the holder name/RUC, the Yape and Plin numbers, up to
8 bank accounts (bank, tipo, número, CCI, moneda) and where the voucher is sent, i.e. the text
a paying customer reads on the "transferencia / Yape directo" checkout. It is listed in
`migrations/meta/_journal.json`, so an embedded PGlite development database applies it
automatically while Neon needs the `db:apply` line above (`IF NOT EXISTS` throughout). While
the row is empty the message falls back to `PAYMENTS_MANUAL_INSTRUCTIONS`; if the table itself
is missing, a checkout still works (the read is logged and the fallback is used) but the
**Configuración** and **Plataforma** screens of the console answer 500 - i.e. the operator sees
it, the customer is not blocked.

`0009_platform_settings_pricing_discounts.sql` is the rest of the operator console, and it is
all "things that used to need a deploy":

| Console screen | Table it writes | What it replaces |
|---|---|---|
| **Configuración → Alertas / Identidad / Operación** | `platform_settings` (singleton) | `PAYMENTS_ALERT_EMAIL`, the hardcoded platform identity, `TRIAL_DAYS`, `PAYMENTS_ALLOW_FREE_PLAN_CHANGE` |
| **Planes** | `plan_pricing` (one row per paid plan) | the prices compiled into `shared/plans.ts` |
| **Descuentos** | `discount_codes` | nothing: promo codes are new |
| every one of them | `platform_config_audit` | nothing: an append-only record of who changed what |

`platform_settings.allow_free_plan_change` is the flag that lets a plan be applied **without
collecting money**; the env var still works as the deploy-level override, and either one is
enough. Both paths are audited, and the console warns loudly on the way in. The price list is
what the checkout charges *and* what `GET /api/plans` serves, so a price shown on the landing
page cannot disagree with the amount the payment asks for. `discount_codes` are only honoured
on a **single period** (a recurring charge at a discounted amount would follow the customer
forever) and a redemption is counted when a payment is **confirmed**, never at checkout. Until
this migration is applied the server logs the failure and falls back to the code's defaults
(catalogue prices, env alert address, flag off) - a checkout keeps working, the console screens
answer 500 and the operator sees it.

`0010` moves the platform's own identity addresses off the retired domain after the
librovirtual.pe → librodigital.pe rebrand (old-domain rows: the demo account's login email
and the demo tenant's notification mailbox — see §9.3). It deliberately leaves consumer
addresses on legal records and the `login_attempts` / `auth_audit_log` history untouched,
and fails loudly if an identity row survives. Idempotent.

`0010` adds `businesses.expected_establishments` - how many locales the company says it will
have (casa matriz included), asked during onboarding and used by the "Primeros pasos"
checklist on /panel ("Sucursales 2 de 5"). It is nullable and pure guidance (no quota, billing
or legal rule reads it), but the column IS required by the deployed code: the schema selects it
on every `businesses` read, so **apply it before (or with) the release** - against a database
without it, `GET /api/businesses/current`, the public portal and the dashboard all answer 500.
It is listed in the journal, so an embedded PGlite dev database applies it automatically while
Neon needs the `db:apply` line above.

`0011` repairs the tenants left half-provisioned by the company-registration bug fixed in §6
(an establishment with no register, and an establishment still named by the old rule). **It is
optional**: it only does something where such a tenant still exists, and it is a no-op on a
database whose establishments all have their register already (it prints what it found before
touching anything). Run it when the audit query in the file reports rows - not as a routine
step.
every establishment of an active tenant gets the `books` row ("Libro de Reclamaciones of that
establishment") it never had, and an establishment still carrying the old machine-generated
name ("Casa Matriz" / "Tienda Online") is renamed to the book's name - only when that name is
the only establishment of the tenant, so a human-typed name is never rewritten. Tenants with no
`libro_configuration` at all are deliberately left alone: that row holds the **public URL** and
the notification inbox, which are the customer's decision, not a migration's. Idempotent; the
file prints the SELECT to review before the UPDATE.

`0006` backs the code login (`POST /api/auth/request-code` → `POST /api/auth/login-with-code`):
`login_code_hash`, `login_code_expires` and `login_code_attempts`. It is listed in
`migrations/meta/_journal.json`, so an embedded PGlite development database applies it
automatically, while Neon/production needs the `db:apply` line above (every statement is
`IF NOT EXISTS`, so re-running is safe). Without the columns those two endpoints answer 500
while email + password keeps working.

`0007` repairs a real outage on databases created from the legacy schema: there `users.role`
had no `DEFAULT` and was nullable, so every new signup was inserted with `role NULL` and got
`403` from every admin-only endpoint (users, businesses, plan, integrations, access requests).
The application now also sets `role: 'admin'` explicitly at signup, so the migration is the
backstop rather than the only defence.

`0008` closes the same kind of gap for the trial lifecycle. `0003_compliance_commercial.sql`
added `subscription_status` (`DEFAULT 'trialing'`) and `trial_ends_at` (nullable, no default) to
an already populated `businesses` table, so tenants that existed before it ended up as
"trialing" with a NULL trial end. The header then read
`Prueba gratuita activa — quedan 0 día(s)` (the day counter is computed from that same missing
date) and `getEffectivePlan()` kept the Pro feature set unlocked forever instead of falling back
to the stored plan. The application now reconstructs the window as `created_at + 15 días`
(`resolveTrialEnd` in `shared/plans.ts`) and treats an unknowable window as "no trial"; `0008`
writes that same result into the data and marks the expired ones `trial_ended`.

`0009` is the same cleanup for the stored plan id. `0000_init.sql` declared
`businesses.subscription_plan` with `DEFAULT 'basic'`, an id that does not exist in the current
catalog (`gratis | esencial | profesional | corporativo`). `getPlan()` has always resolved such a
value to **Gratis**, so those tenants were on Free all along, but the stored label disagreed with
it: the upgrade screen never marked a plan as current (`storedPlanId === plan.id`) and plan
reports showed a phantom tier. `0009` rewrites every non-catalog id to `gratis` (nothing is
upgraded or downgraded — only the label is made to match), and `getSubscriptionInfo()` now answers
with the catalog id the row resolves to, so drift can never reach the UI again.

---

## 8. Password recovery support notes

Self-service recovery is now live end to end:

| Piece | Location |
|---|---|
| Request endpoint | `POST /api/auth/forgot-password` (`server/routes/auth.routes.ts`) |
| Confirm endpoint | `POST /api/auth/reset-password` |
| Logic | `authService.requestPasswordReset` / `resetPassword` |
| Email | `emailService.sendPasswordReset` → links to `/acceso/restablecer-password?token=…` |
| Page | `client/src/pages/reset-password.tsx` |
| Entry point | "¿Olvidaste tu contraseña?" on `/acceso` |

Things to know when a customer reports trouble:

- **No email arrived.** The endpoint answers identically whether or not the address has
  an account, so support cannot read account existence off the response — check the SMTP
  credentials and the provider's outbound log instead. `/api/status` reports
  `email: degraded` when `SMTP_*` is unset.
- **"El enlace ... ha expirado."** Tokens live 60 minutes. Ask the customer to request a
  new one.
- **Link goes to localhost.** `APP_URL` is misconfigured in production.
- **Nothing happens after a valid reset.** Tokens are single-use: the first successful
  submit consumes it. A second submit with the same link is expected to fail.

---

## 9. Domain, CDN and email (Cloudflare + Zoho Mail)

`librodigital.pe` is served through **Cloudflare** (DNS + proxy + TLS) and its mail is
hosted on **Zoho Mail**, with a single mailbox: `hola@librodigital.pe`.

`.env.example` documents the variables; this section covers the part that lives in the two
dashboards.

### 9.1 Cloudflare

| Record | Name | Value | Proxy |
|---|---|---|---|
| `A` / `CNAME` | `@` | the origin host running this app | **Proxied** (orange cloud) |
| `CNAME` | `www` | `librodigital.pe` | Proxied |
| `MX` ×3 | `@` | `mx.zoho.com` (10), `mx2.zoho.com` (20), `mx3.zoho.com` (50) | DNS only |
| `TXT` | `@` | `v=spf1 include:zoho.com ~all` | DNS only |
| `TXT` | `zmail._domainkey` | the DKIM key Zoho generates (Zoho Mail → Email authentication → DKIM) | DNS only |
| `TXT` | `_dmarc` | `v=DMARC1; p=none; rua=mailto:hola@librodigital.pe` — tighten to `quarantine`, then `reject`, once the reports are clean | DNS only |
| `TXT` | `@` | `zoho-verification=…` (from the Zoho console) | DNS only |

Settings that this app specifically depends on:

- **SSL/TLS mode: Full (strict).** Production sets `secure` session cookies; "Flexible"
  would leave the Cloudflare→origin leg unencrypted.
- **Rocket Loader: OFF.** It injects and defers scripts, and the app ships
  `scriptSrc: 'self'` (see `server/middleware/security.ts`) — the injected loader is blocked
  and the SPA never boots.
- **Email Address Obfuscation: OFF.** It rewrites `mailto:` links into a script that the
  same CSP blocks, so the contact address on `/` and `/accesibilidad` would render as
  garbage instead of `hola@librodigital.pe`.
- **`TRUST_PROXY` must match the topology.** Unset means 1, correct when Cloudflare reaches
  the origin directly; set `2` when the host adds its own proxy hop; the safest form is the
  CIDR list from <https://www.cloudflare.com/ips/>. A wrong value fails silently and
  confusingly — one login-limit bucket for every visitor (`/api/auth/login` answering
  "Demasiados intentos", see `server/middleware/rateLimits.ts`) and `[security]` lines
  carrying Cloudflare's IP instead of the attacker's. The app logs
  `[proxy] trust proxy = …` once at boot: read it after every deploy.
- **Lock the origin down.** Allow only Cloudflare's ranges through the origin firewall; a
  reachable origin means anybody can forge `X-Forwarded-For` and escape every limiter.
- **Do not cache HTML.** No Cache Rule for `text/html`; after a deploy, purge when the
  bundle hash did not change (see §5, "the app still looks old").
- **Do not put a managed challenge in front of `/api/public/*`, `/libro/*` or `/`.** A
  legally mandated complaint form must never be blocked for a real consumer; those routes
  already carry their own proof-of-work CAPTCHA (`CAPTCHA_POW_DIFFICULTY`).

### 9.2 Zoho Mail

The account's own settings page is the authority for the server values (Zoho Mail →
Configuración → Cuentas de correo → the address → "Detalles de configuración del
servidor"). For `hola@librodigital.pe` it reads: **outgoing server `smtp.zoho.com`, port 465
with SSL or 587 with TLS, authentication required**, IMAP `imap.zoho.com:993` - i.e. the
global data centre, so neither `smtppro.*` nor a `.eu`/`.in` host is involved. `.env` ships
exactly those values; a paid-plan organisation whose page shows `smtppro.zoho.com` instead
only changes `SMTP_HOST`.

```
APP_URL=https://librodigital.pe
SMTP_HOST=smtp.zoho.com      # smtppro.zoho.com on such plans / smtp.zoho.eu|in on other DCs
SMTP_PORT=587                # 587 = STARTTLS, 465 = SSL; the port alone decides (no SMTP_SECURE)
SMTP_USER=hola@librodigital.pe
SMTP_PASSWORD=<see the table below>
SMTP_FROM_NAME=LibroDigital.pe
SMTP_FROM_EMAIL=hola@librodigital.pe
PAYMENTS_ALERT_EMAIL=hola@librodigital.pe
PLATFORM_ADMIN_EMAILS=hola@librodigital.pe     # who may confirm a transfer/Yape by hand
# Where the customer sends a transfer / Yape. The panel's "Configuración" tab
# (platform_payment_settings) wins over this line; keep it only as the fallback for
# an environment where nobody has opened that screen yet.
PAYMENTS_MANUAL_INSTRUCTIONS=Yape al 999 888 777 (LibroDigital S.A.C.)\nCCI 002-193-001234567012-15\nEnvíe el comprobante a hola@librodigital.pe
```

`SMTP_PASSWORD` is not necessarily the mailbox password - it depends on the account:

| Account | What `SMTP_PASSWORD` must contain |
|---|---|
| 2FA/TFA **off** | the normal mailbox password |
| 2FA/TFA **on** | an *app-specific password*, generated in **Zoho Accounts** (`accounts.zoho.com` → Seguridad → **Contraseñas de la aplicación** → Generar nueva contraseña). Not inside Zoho Mail, and shown **once only**. |

Enabling 2FA is the recommended setup: the app then holds a revocable app password instead
of the real mailbox password. Zoho shows the generated password in spaced groups - paste it
into `.env` as-is, the credentials reader strips the spaces.

Verification checklist - run it once, after the DNS records propagate:

1. `npm run email:diagnose` on the server: it tries every documented Zoho endpoint, prints
   the one that authenticates and the exact `SMTP_*` lines to keep. Add
   `-- --send tu@correo.com` to deliver a real message. This answers "which host / which
   password" without guessing.
2. `POST /api/email/test` from a signed-in, non-demo account does the same inside the app
   (a 502 means `SMTP_*` is wrong), and `GET /api/status` must then report
   `email: operational` instead of `degraded`.
3. Deliver to Gmail **and** Outlook: both must reach the inbox, not spam. Zoho's console
   keeps a per-message SMTP log.
4. Register a throwaway company end to end: the welcome/verification mail arrives at the
   address the customer typed, with links on `https://librodigital.pe` — never localhost.
5. Confirm SPF/DKIM resolve (`nslookup -type=txt librodigital.pe`,
   `nslookup -type=txt zmail._domainkey.librodigital.pe`) before tightening DMARC.

### 9.3 Renamed identifiers (migration note)

The rebrand renamed identifiers an external system may already be pinned to:

- **Webhook signature headers** (Corporativo plan): `X-LibroDigital-Signature` /
  `X-LibroDigital-Event`, plus the `LibroDigital-Webhooks/1.0` user agent
  (`server/services/webhookService.ts`). A receiver verifying the old `X-LibroVirtual-*`
  names must be updated.
- **Mercado Pago statement descriptor**: `LIBRODIGITAL` (`server/services/paymentGateway.ts`)
  — it is customer-visible on the card statement and must match the panel configuration.
- The session cookie keeps its original name (`lv.sid`), so the rename does not silently
  log every user out.

- **Deactivated account.** Reset links are deliberately NOT issued for deactivated
  accounts; an administrator must re-enable the account first.
