# LibroDigital.pe — Production Readiness Assessment & Roadmap

> Read-only audit of the repository, with the concrete work remaining to bring the
> app live for paying customers. Generated 2026-10-13.
>
> **Section 1 is the state as originally measured** (before remediation).
> **See [§6 Fix log](#6-fix-log)** for what has since been fixed, and
> [RUNBOOK.md](RUNBOOK.md) for the operational procedures.

---

## 1. Current state (measured, not assumed)

The project's own verification suite was run end-to-end:

| Check | Command | Result |
|---|---|---|
| TypeScript | `npm run check` | ✅ **Passes** (client + server + shared) |
| Unit/route tests | `npm test` | ✅ **242 passed**, 1 skipped, 27 files |
| Production build | `npm run build` | ✅ Passes — client 863 KB JS (247 KB gz) + server 327.8 KB |
| Dependency audit | `npm run audit:security` | ❌ **FAILS — 9 vulns (7 high, 2 moderate)** |
| CI pipeline | `.github/` | ❌ Does not exist |
| Dockerfile / Procfile | — | ❌ None (deploy = Replit `autoscale` via `.replit`) |

**Architecture is genuinely in good shape.** The god-files were split (`routes.ts` →
21 route modules, `storage.ts` → 16 storage modules), there is a real security model
(session `businessId` as the only trusted tenant source, `requireAuth`/`requireRole`,
per-route rate limiters, Helmet CSP enabled only in production, pg-backed sessions with
a hard `SESSION_SECRET` fail-fast). Tenant-isolation and complaint-isolation are covered
by dedicated test files (21 + 17 tests). That is a level of rigor most pre-launch apps
don't have.

**But "all tests pass" ≠ "ready for paying customers."** The audit found several hard
blockers that the test suite by design cannot catch.

---

## 2. P0 — Blockers. Do these before any real customer touches it.

### 2.1 `npm audit` fails at your own stated bar

Your `audit:security` script is documented to "fail on high+ severity" — and it does.
7 high-severity advisories:

- **`nodemailer` ≤ 10.0.5** — 13 advisories including **CRLF/SMTP command injection**,
  **SSRF + arbitrary file read via `raw`/`resolveContent`**, **cross-tenant SMTP credential
  disclosure via a process-global DNS cache**, and **DoS via addressparser**. This one
  matters *directly* for a multi-tenant app that emails consumers.
- **`drizzle-orm`** (breaking bump to 0.45.4 required)
- **`postcss-selector-parser`** via `tailwindcss` (breaking bump to Tailwind 4)

Fix path: bump the three, re-run `npm run verify` + `npm run build`, and confirm tests
still pass. Because they are breaking changes, do this as one isolated commit.
**Until this is green, `audit:security` cannot be part of a release gate.**

### 2.2 There is no self-service password reset (users get permanently locked out)

This is the finding to act on first, because it will generate support tickets on day one:

- `authService.generatePasswordResetToken()` exists but is explicitly commented
  **"Generate password reset token (for future use)"**.
- `emailService.sendPasswordReset()` builds a link to
  **`/acceso/restablecer-password?token=…`** — but **that route does not exist** in
  `App.tsx` and there is no such page.
- There is **no** `/api/auth/forgot-password` or `/api/auth/reset-password` route (auth
  routes are only register, login, logout, user, businesses, switch-business,
  complete-onboarding).
- Login only supports an existing password + change-password for logged-in users.

So: a customer who forgets their password must contact you. For a paid SaaS this must be
built (token issue → email → reset page → token consume/expire → invalidate sessions).

### 2.3 Secrets that must be rotated and moved to a manager

`.env` currently holds a **live Neon connection string with its `npg_` password** and a
**live Groq API key**. Good news: `.env` is git-ignored and correctly not tracked. Still
required before launch:

- **Rotate both** (they've been sitting in a workspace / shared in this session).
- Production must inject `DATABASE_URL`, `SESSION_SECRET`, `AI_API_KEY`, `SMTP_*`,
  `APP_URL` from the platform's secret store — never a file on disk.
- Confirm `SESSION_SECRET` and `APP_URL` are set to the real domain in prod
  (`APP_URL=https://librodigital.pe`; the local `.env` keeps `http://localhost:5000`, where
  reset/confirmation emails would link to localhost).
- Confirm the Cloudflare proxy is configured for this app before the first deploy:
  `TRUST_PROXY` matching the topology, SSL/TLS mode *Full (strict)*, Rocket Loader and
  Email Address Obfuscation off. RUNBOOK.md §9.1 lists the records and settings.

### 2.4 No error monitoring / uptime alerting / real health probe

- `/api/status` always reports `database: 'operational'` with the comment *"serving this
  response proves it"* — it does **not** actually ping the DB, and there is **no `/health`
  or `/ready`** endpoint for a load balancer.
- There is no Sentry/Rollbar/OpenTelemetry wiring. 5xx errors are `console.error` only. If
  the app breaks at 2 a.m. you'll find out from a customer.
- Required: an error tracker, an external uptime monitor hitting a **real** readiness
  endpoint (DB ping), and alerting on bursts of `[security]` 401/403 log lines (your
  `securityLog.ts` already produces them — nobody is watching).

### 2.5 Backups + a rehearsed restore

`npm run db:backup` exists (table backups) but there is no documented restore drill, no
retention policy on the backups, and no verification that a restore actually works. For a
system holding consumer PII under a 24-month retention obligation, an untested backup is
not a backup. Run **one full restore to a scratch DB** and write the steps down.

### 2.6 No CI

No `.github/workflows`. Nothing prevents a broken commit from reaching production. Minimum
viable pipeline on every PR:

```
npm ci → npm run check → npm test → npm run build → npm run audit:security
```

### 2.7 Payments are absent — decide how customers actually pay

> **Status: implemented (Phase 2.7).** The section below is kept as the original
> assessment; see `shared/payments.ts` and `server/services/paymentGateway.ts`
> for what shipped.

There is **no** Stripe / MercadoPago / Culqi / Niubiz / PayPal anywhere in `package.json`
or the server. `shared/plans.ts` defines Esencial/Profesional/Corporativo and quotas are
enforced, and there's a 7-day trial — but **plan changes do not collect money**. If
"production for customers" means charging money, you must either integrate a payment
gateway + webhook-driven entitlement, or explicitly run on manual invoicing at launch and
hide/disable any self-serve "upgrade" CTA that implies instant paid activation.

---

## 3. P1 — Should do before or immediately after launch

1. **Email deliverability.** With `SMTP_*` unset the app prints emails to the terminal and
   `/api/status` reports `email: degraded`. The sending domain is `librodigital.pe`, hosted
   on **Zoho Mail** (SMTP `smtp.zoho.com`, an app-specific password — see RUNBOOK.md §9.2),
   with DNS in **Cloudflare**. Then configure **SPF, DKIM and DMARC** for the sending domain
   and send a live test to Gmail/Outlook — transactional mail from a new domain lands
   straight in spam otherwise.
2. **Code-split the 863 KB bundle.** Vite already warns `Some chunks are larger than 500 kB`.
   Route-level `React.lazy()` + `manualChunks` will roughly halve first load and improve the
   PWA experience on mobile, which is the primary channel for Peruvian consumers.
3. **Legal/compliance sign-off.** The app *asserts* compliance (DS 011-2011-PCM,
   DS 101-2022-PCM, Ley 29733). Before selling it, have someone qualified verify the
   generated artifacts: the 15-business-day deadline math (excellent test coverage exists —
   `businessDayCalculator.test.ts`, `peru-holidays.test.ts`), the Anexo II/III PDFs, the
   constancia PDF, the expediente ZIP, and the 24-month anonymization sweep.
4. **Apply the manual migration on prod.** `migrations/manual/0004_tenant_integrity_hardening.sql`
   (unique `(business_id, correlative_number)`) is deliberately outside the drizzle journal —
   verify it's actually applied in production.
5. **Least-privilege DB role + RLS.** The same file contains a *commented-out* RLS template.
   Tenant isolation currently relies entirely on application code being correct on every
   query. Enabling Postgres RLS is the defense-in-depth that makes a future coding mistake
   non-catastrophic.
6. **Client-side route guarding.** Protected pages render `AppLayout` immediately; the
   redirect happens only after an API 401 triggers `handleSessionExpired()`. It works, but
   users see a flash of chrome first. A `<ProtectedRoute>` wrapper (and resetting the
   module-level `sessionExpiryHandled` flag on login) would clean this up.
7. **Frontend dependency/legal pages**: published Terms, Privacy Policy, and a
   data-processing agreement for business customers (you already have `/accesibilidad` and a
   cookie notice).
8. **Load/soak test** the public intake path at realistic traffic (rate limiters are tuned
   per-IP/per-complaint already, so this is validation, not design).

---

## 4. How to find out whether every frontend function works and there are no bugs

**The honest answer: you cannot answer this today, because there is no browser-level test
layer.** The 242 tests are backend/domain tests. The client has exactly **three** test files
(`validation.test.ts`, `apiRequest-usage.test.ts`, `widget-position.test.ts`). None of them
render a page or click a button. So today, *no automated test proves that a single page in
`client/src/pages/` actually loads, submits, or renders correctly.*

Build verification in layers, from cheapest to most valuable:

**Layer 1 — Static (have it).** `npm run check`. Keep it.

**Layer 2 — Coverage measurement (missing tooling).** Add `@vitest/coverage-v8` and run
`npx vitest run --coverage`. This won't find frontend bugs, but it *proves which files are
untested* — right now nearly all of `client/src` will show ~0%.

**Layer 3 — Component tests (missing tooling).** `vitest.config.ts` sets
`environment: "node"`; there is no `jsdom` and no `@testing-library/react` in
`package.json`. Add both, then test the pages with the most non-trivial logic:
`complaint-form.tsx` (30 KB, the riskiest file), `complaint-response-dialog`,
`complaint-table`, `establishment-form`, `libro-qr-card`.

**Layer 4 — End-to-end browser tests (the real answer).** Install **Playwright** and run it
against the **production build** (`npm run build && npm run start`). This is what actually
closes the question. Cover, per role (admin / user / viewer) and per plan tier:

| Flow | What to assert |
|---|---|
| Public intake `/libro/:slug` | CAPTCHA solves automatically and shows "Verificado", honeypot works, submit returns a constancia, attachment upload by document number |
| Consumer consult | Lookup by correlative + document returns the right complaint |
| Auth | Register → onboarding → login → logout; **session-expiry redirect**; wrong password shows an error |
| Dashboard `/panel` | Stats, alerts and recent complaints render real data |
| Complaints `/reclamos` | Create / edit / respond / filter / paginate / download PDF |
| Reports `/reportes` | Charts + expediente ZIP download (`sirec.csv`, `MANIFIESTO.txt` inside) |
| Establishments / Books / Users / Businesses | CRUD + role restrictions (viewer cannot mutate) |
| Plan `/plan`, multi-RUC switch, customization | Quota messages, plan change, brand color applied |
| AI | Classification/triage (all plans); response drafting, trends, SLA prediction, case summary and abusive-clause review (Pro+); public draft assistant (CAPTCHA); compliance co-pilot with citations; heuristic fallback when no key is set |
| QR `/codigo-qr`, widget `widget.js`, `/estado`, `/accesibilidad` | Render, accessible landmarks, no console errors |
| Cross-cutting | **Assert zero console errors and no failed network requests on every page** |

**Layer 5 — Test-gap inventory (30 min).** There are **22 pages** and **86 API endpoints**.
Build a matrix: page → endpoints it calls → which test file covers it. Anything with an empty
cell is unverified. The largest gaps are the Phase 2/3 pages (integrations, subscription,
customization, ARCO, documents).

**Layer 6 — Manual QA matrix + staged rollout (still necessary).** Automated tests don't
verify *legal* correctness (is the 15-day date right? is the Anexo II title >= 1 cm?) or
*visual* correctness. Write a one-page checklist by role, run it on desktop + a real phone,
and launch with 2-3 friendly pilot tenants before general availability while error monitoring
is live.

---

## 5. Suggested sequencing

**Week 1 — unblock launch:** rotate secrets; fix `npm audit`; build password reset
end-to-end; add `/health` + real DB readiness; wire an error tracker + uptime monitor;
add CI running `verify + build + audit`; rehearse a DB restore.

**Week 2 — verify & polish:** add Playwright with the smoke suite above (this is the
direct answer to "are there bugs"); configure Zoho SMTP + SPF/DKIM/DMARC in Cloudflare
(RUNBOOK.md §9); decide payments (integrate, or explicitly go manual); legal sign-off on
the generated documents; apply the manual migration + least-privilege DB role.

**Week 3+ — harden & scale:** code-split the bundle; component tests for the complaint
form; enable RLS; `<ProtectedRoute>`; staged pilot rollout with monitoring.

**Bottom line:** the app is architecturally solid and its *server-side* correctness and
tenant isolation are genuinely well-tested — far ahead of a typical pre-launch project.
What blocks customers is not the core logic, but the operational shell around it:
unpatched high-severity dependencies, no password reset, no monitoring/CI/restore-drill,
an undecided payment path, and no browser-level test layer to prove the UI actually works.

---

## 6. Fix log

Status of each P0 blocker after the remediation pass.

| Item | Status | What changed |
|---|---|---|
| 2.1 `npm audit` | ✅ **Fixed** | `nodemailer` 7 → 10.1.0, `drizzle-orm` 0.39 → 0.45.4, `@types/nodemailer` 7 → 8; `tailwindcss-animate` and `tw-animate-css` moved from `dependencies` to `devDependencies` (they are build-time only — that move is what had dragged `chokidar`/`braces`/`micromatch`/`fast-glob`/`postcss-nested`/`postcss-selector-parser` into the *production* audit tree). `npm run audit:security` now reports **0 vulnerabilities**. |
| 2.2 Password reset | ✅ **Fixed** | New `POST /api/auth/forgot-password` + `POST /api/auth/reset-password`; `authService.requestPasswordReset` / `resetPassword`; storage `getUserByPasswordResetToken` / `completePasswordReset`; a `/acceso/restablecer-password` page and a "¿Olvidaste tu contraseña?" entry point on `/acceso`. Tokens are 256-bit, single-use, expire in 60 minutes, and the request endpoint never reveals whether an address exists. Covered by `server/services/passwordReset.test.ts` and `server/routes/passwordReset.routes.test.ts`. |
| 2.3 Secrets | ⚠️ **Action required** | `.env.example` added and documented, and the required-variable list is in RUNBOOK.md §0. The secrets themselves still need rotating in the provider consoles and moving into the platform's secret store — RUNBOOK.md §1. |
| 2.4 Monitoring / probes | 🟡 **Partially fixed** | `GET /health` (liveness) and `GET /ready` (real `select 1`, answers 503 when the DB is down) added; `/api/status` no longer hard-codes `database: 'operational'`. Error tracking, uptime monitoring and alerting are still to be wired — RUNBOOK.md §3. |
| 2.5 Backups | 🟡 **Partially fixed** | `scripts/restore-tables.mjs` + `npm run db:restore` added, with a documented drill. The drill itself still needs to be run once against a scratch database — RUNBOOK.md §4. |
| 2.6 CI | ✅ **Fixed** | `.github/workflows/ci.yml` runs `check → test → build → audit:security` on every push to `main` and every pull request. |
| 2.7 Payments | ✅ **Implemented** | Peruvian-first payment layer, **with recurring billing**. `shared/payments.ts` is the provider catalog (Mercado Pago wired for both one-off charges and subscriptions; Culqi/Niubiz/Izipay catalogued with their requirements), prices are handled as integer céntimos, and a plan is applied only by a confirmed payment. `POST /api/payments/checkout` creates a Mercado Pago **subscription** (preapproval) by default, so monthly/yearly plans renew without anyone sending a reminder; `subscriptions` holds the authorisation and each charge lands in `payments` linked to it (migrations `0004_payments.sql`, `0005_subscriptions.sql`). `POST /api/payments/webhook/:provider` settles everything and always re-reads the authoritative state from the provider API instead of trusting the webhook body — an unknown charge is matched to its agreement through `external_reference`, so renewals work even when only the `payment` topic arrives. `POST /api/payments/subscription/cancel` stops future charges while the already-paid period keeps running. Subscriptions bought through a **panel plan link** (`mpago.la/...`, created by Mercado Pago rather than by the app) are adopted on the webhook: the plan is recognised from its panel code (`PLAN_REFERENCE_CODES` in `shared/payments.ts`) or, failing that, from the amount plus the frequency, and the account is matched by the payer's email; a payer that matches no account raises an alert to `PAYMENTS_ALERT_EMAIL` instead of vanishing. The old no-charge `POST /api/subscription` answers 402 unless `PAYMENTS_ALLOW_FREE_PLAN_CHANGE=true`. Transferencia/Yape directo works with no credentials, and the arrival of the money is confirmed **only by the LibroDigital team** (`PLATFORM_ADMIN_EMAILS` / `requirePlatformAdmin`; deliberately *not* by a tenant role, because every customer is `admin` of their own business and could otherwise confirm their own unpaid transfer and grant themselves the plan for free). The **destination** of those transfers is edited from the console (migration `0008_platform_payment_settings.sql`, tab **Configuración**, `PUT /api/admin/payment-settings`): the singleton `platform_payment_settings` row holds the holder name/RUC, the Yape and Plin numbers, up to 8 bank accounts (bank, tipo, número, CCI, moneda) and where the voucher is sent, and it **supersedes** `PAYMENTS_MANUAL_INSTRUCTIONS`, which survives only as the fallback while that row is empty. The message is built by one exported, unit-tested function (`buildTransferInstructions` in `shared/payment-details.ts`), which the console also renders as a live preview, so what the operator sees is what the customer reads. The rest of the commercial configuration now lives in the console too (migration `0009_platform_settings_pricing_discounts.sql`): **Configuración** holds the alert mailbox, the platform's own identity (razón social, RUC, dirección fiscal, contact), the trial length and the audited `allow_free_plan_change` flag (which activates a plan WITHOUT money); **Planes** is the price list the checkout charges from *and* the one `GET /api/plans` serves, so a marketing page cannot disagree with the amount charged; **Descuentos** holds promo codes (percent or fixed, optional plan scope, expiry, redemption cap), honoured only on a single period and counted only when a payment is confirmed. Every one of those writes is recorded in `platform_config_audit` with the operator's e-mail, which is what makes the dangerous switch acceptable. **Remaining:** live testing runs on a development machine published through a Cloudflare Tunnel, so `APP_URL=https://dev.librodigital.pe`, `MERCADOPAGO_SANDBOX=true`, a `TEST-…` credential, and the webhook `https://dev.librodigital.pe/api/payments/webhook/mercadopago` are registered for the events `payment`, `subscription_preapproval` and `subscription_authorized_payment`. **Before go-live, switch all five items in the "dev hostname vs production domain" table of [replit.md](replit.md)** — `APP_URL`, the webhook URL, the panel tab (*Modo de prueba* → *Modo productivo*), the credential prefix (`TEST-` → `APP_USR-`) and `MERCADOPAGO_SANDBOX`. A webhook URL left pointing at the laptop is the silent one: plans would never activate, and nothing would log an error. Covered by `shared/payments.test.ts`, `server/services/paymentGateway.test.ts`, `server/services/paymentService.test.ts`, `server/routes/paymentsIsolation.test.ts` and `server/routes/subscription.routes.test.ts`. |

Also cleaned up in this pass: `MIN_PASSWORD_LENGTH` is now defined once in
`@shared/schema.ts` instead of being duplicated in `server/routes/users.routes.ts`.

---

## 7. What "the auth service" is, and what I recommend for production

### What exists today

Authentication is **session-cookie based**, and the whole implementation sits behind one
class:

**`server/services/authService.ts`** — an `AuthService` singleton exported as
`authService`. It owns:

- **Credential handling** — bcrypt at cost 14; initial passwords come from
  `crypto.randomInt` (a CSPRNG — it previously used `Math.random()`, which would have made
  emailed signup passwords predictable).
- **The flows** — `registerUser`, `loginUser`, `logoutUser`, `validateSessionUser`.
- **Brute-force defence** — 5 failed attempts ⇒ 30-minute lockout (`isAccountLocked`,
  `MAX_LOGIN_ATTEMPTS`, `LOCKOUT_DURATION_MINUTES`), plus a per-email + IP attempt counter.
- **Password recovery** — `requestPasswordReset` / `resetPassword` (added in this pass).
- **Audit trail** — every attempt is written to `auth_audit_log` and `login_attempts`.

Around it:

| Concern | Where |
|---|---|
| Session storage + cookie | `server/middleware/security.ts` — `connect-pg-simple` in production, `memorystore` on the embedded local DB; cookie `lv.sid`, `httpOnly`, `sameSite=lax`, `secure` in production; session id regenerated on login (fixation defence) |
| Route enforcement | `server/middleware/requireAuth.ts` — `requireAuth`, `requireRole`, `requireAdmin`, `requireStaff`, `requireNonDemo` |
| Tenant scoping | `server/services/tenantAccess.ts` — `getManageableBusinessIds`; `req.user.businessId` is the only trusted tenant source |
| Rate limiting | `server/middleware/rateLimits.ts` — `authLimiter` (5/15 min), `passwordResetLimiter`, `registerLimiter`, … |
| 401/403 logging | `server/middleware/securityLog.ts` |
| Client session state | `client/src/hooks/use-auth.tsx` + the 401 handler in `client/src/lib/queryClient.ts` |

**Assessment.** For a product of this size, session auth is the right call — simpler and
safer than hand-rolling JWT access/refresh rotation, and it gives instant server-side
revocation (`validateSessionUser` rejects deactivated and locked accounts on *every*
request). The layering is clean: routes are thin, policy lives in middleware, and tenant
scoping has a single chokepoint. The gaps were operational, not architectural.

### Recommended for production

**Keep sessions. Harden the edges. Do not migrate to JWT for its own sake.**

1. **Add an `Origin`/`Referer` check on state-changing `/api` requests.** There is no CSRF
   token today. `sameSite=lax` plus a same-site JSON API is a reasonable defence, but an
   explicit same-origin check on POST/PATCH/PUT/DELETE is a few lines of middleware and
   closes the remaining gap for older browsers.
2. **Email verification is enforced (done).** `users.is_email_verified` now gates publication:
   `POST /api/auth/complete-onboarding` refuses an unconfirmed account
   (`403 email_not_verified`) and the public intake refuses consumer submissions while no active
   administrator of the tenant is verified (`403 libro_not_published`) - see
   `server/services/verificationService.ts`. `ALLOW_UNVERIFIED_BUSINESSES=true` is the documented
   escape hatch for a legacy tenant whose book is already live. Open edge: nothing re-checks the
   flag periodically, so a confirmed mailbox that later bounces stays "verified" until someone
   acts on the bounce.
3. **Support a rolling `SESSION_SECRET`.** Rotating the secret invalidates every session;
   `express-session` accepts `secret: [current, previous]`, which lets you rotate without
   logging everyone out.
4. **Push rate limiting to the edge (or a shared store).** The in-app limiters are
   per-instance and in-memory, so behind autoscaling the effective ceiling multiplies by
   the instance count. If that matters, back them with Redis/Postgres or enforce at the
   WAF/CDN.
5. **Consider an external IdP only when you outgrow sessions** — e.g. SSO for Corporativo
   customers or "login with Google" for the long tail. That is a product decision, not a
   launch requirement.
6. **Add MFA for `admin` accounts** once paying customers have multiple staff per RUC: the
   session cookie is the only factor today, and an admin can export the whole expediente.
