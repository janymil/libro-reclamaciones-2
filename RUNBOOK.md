# Production Runbook — LibroVirtual.pe

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
| `APP_URL` | **yes** | Must be the real domain: every email link is built from it. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | **yes** | Without them no email is ever delivered. |
| `SMTP_FROM_NAME`, `SMTP_FROM_EMAIL` | recommended | Sender identity on all transactional mail. |
| `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` | optional | Absent ⇒ AI falls back to local heuristics. |
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

Then: deploy → `curl /health` → `curl /ready` → confirm the error tracker is receiving
events → smoke-test login and one public complaint submission.

`.github/workflows/ci.yml` runs the same chain on every push and pull request, so this
checklist is enforced automatically for anything merged to `main`.

---

## 6. Password recovery support notes

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
- **Deactivated account.** Reset links are deliberately NOT issued for deactivated
  accounts; an administrator must re-enable the account first.
