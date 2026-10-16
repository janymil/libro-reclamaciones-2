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
| `SMTP_FROM_NAME`, `SMTP_FROM_EMAIL` | recommended | Sender identity on all transactional mail (`LibroDigital.pe` / `hola@librodigital.pe`). |
| `PAYMENTS_ALERT_EMAIL` | recommended | `hola@librodigital.pe`. Without it a paid-but-unmatched subscription is only logged. |
| `TRUST_PROXY` | recommended | Hop count (or CIDR list) for the Cloudflare proxy. Defaults to 1. See §9.1. |
| `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` | optional | Absent ⇒ AI falls back to local heuristics. |
| `RUC_API_PROVIDER`, `APISNET_API_TOKEN`, `DECOLECTA_API_TOKEN` | optional | Auto-fills the razón social on the registration form. Defaults to the anonymous apis.net.pe endpoint; a token raises the quota. Absent/down ⇒ the user types the razón social manually (the endpoint answers `provider_unreachable` / `provider_rate_limited`, never "RUC not found"). |
| `PORT` | optional | Defaults to 5000. |

**Boot check** (run after every deploy):

```powershell
curl.exe -fsS https://<domain>/health   # 200 {"status":"ok",...}
curl.exe -fsS https://<domain>/ready    # 200, checks.database.status == "up"
```

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
establishment).

**The step-2 write is one transaction.** `storage.completeOnboarding` creates the tenant, the
access grant, the Libro configuration and the default establishment, and flags the user as
onboarded only as its last statement. Either the account is fully usable or nothing changed -
a failure returns
`500 {"code":"onboarding_failed","message":"...no se guardaron..."}` and the wizard can simply
be retried. Two situations that used to be permanent dead ends are now recoverable:

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
npm run db:apply -- migrations/manual/0006_business_access_requests.sql   # access-request table
npm run db:apply -- migrations/manual/0007_users_role_default.sql         # users.role DEFAULT/NOT NULL
npm run db:apply -- migrations/manual/0008_trial_lifecycle_backfill.sql   # trial_ends_at for pre-0003 tenants
npm run db:apply -- migrations/manual/0009_normalize_plan_ids.sql         # legacy 'basic' -> 'gratis'
npm run db:apply -- migrations/manual/0010_rebrand_domain_emails.sql      # @librovirtual.pe -> @librodigital.pe
```

`0010` moves the platform's own identity addresses off the retired domain after the
librovirtual.pe → librodigital.pe rebrand (old-domain rows: the demo account's login email
and the demo tenant's notification mailbox — see §9.3). It deliberately leaves consumer
addresses on legal records and the `login_attempts` / `auth_audit_log` history untouched,
and fails loudly if an identity row survives. Idempotent.

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
