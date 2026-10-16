# LibroDigital.pe - Sistema de Gestión de Libro de Reclamaciones

## Overview

LibroDigital.pe is a comprehensive SaaS application designed for Peruvian businesses to manage their "Libro de Reclamaciones" (Complaints Book) in strict compliance with Peruvian regulations. The system enables multi-tenant management of customer complaints and grievances while ensuring legal compliance with DS 011-2011-PCM, DS 101-2022-PCM, and Law 29733 (Personal Data Protection).

The application provides businesses with tools to digitally manage customer complaints, track response deadlines, generate compliance reports, and maintain proper documentation as required by Peruvian consumer protection laws. It features AI-powered complaint classification, automated deadline tracking, and comprehensive reporting capabilities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Full-Stack Architecture
The application follows a monorepo structure with clear separation between client, server, and shared components:
- **Frontend**: React with TypeScript, using Vite as the build tool
- **Backend**: Express.js server with TypeScript
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Styling**: Tailwind CSS with shadcn/ui component library for consistent UI
- **Routing**: Wouter for lightweight client-side routing

### Project Structure
```
client/src/              React app: pages/, components/, hooks/, lib/
server/
  index.ts               Process entry: express app, error handler, Vite/static
  routes.ts              Thin facade: applies middleware, calls each route module
  routes/*.routes.ts     One module per domain (auth, complaints, public, ai, ...)
  middleware/            security (helmet + session), rateLimits, requireAuth
  storage.ts             Barrel: composes the aggregate modules over IStorage
  storage/*.storage.ts   One module per aggregate (users, complaints, reporting...)
  services/              Business logic: auth, AI, email, PDF, business days
  types/express.d.ts     Ambient `req.user` / `req.session.userId` types
shared/
  schema.ts              Drizzle tables and zod schemas
  peru-holidays.ts       Only source of holiday data and business-day maths
migrations/              Drizzle SQL migrations; apply extras with `npm run db:apply`
```

Both god files were split by feature: `routes.ts` (50 endpoints) and `storage.ts`
(64 `IStorage` methods) are now stable, reviewable facades. Adding an endpoint means
touching one small file.

### Verifying changes
- `npm run check` - TypeScript across client, server and shared
- `npm test` - Vitest suite (Peruvian business-day maths, form validation, AI fallbacks,
  CAPTCHA signing, retention cutoff, quotas, expediente/CSV generation, attachments)
- `npm run build` - production client bundle plus the bundled server
- `npm run verify` - `check` + `test` in one go (use this before every deploy)
- `npm run audit:security` - production dependency audit (fails on high+ severity)
- `npm run db:apply -- migrations/0003_compliance_commercial.sql` - applies the
  additive compliance/commercial migration (idempotent, `IF NOT EXISTS` throughout);
  local PGlite databases get it automatically from `migrations/`.

### Local dev server: restart it yourself (do not hand this back to the user)
`npm run dev` runs `tsx server/index.ts` with **no watcher**. Vite hot-reloads
`client/` on save, but `server/` and `shared/` keep running whatever was loaded at
boot. A stale server paired with a fresh client is the most confusing failure mode
in this repo (a form calling an endpoint whose shape just changed), so after
touching anything under `server/` or `shared/`: **restart the server, then verify**.
Never report a server-side change as done while the running process predates it.

Restarting, on Windows (this repo's setup):
- **Kill every tree involved, not one root.** The tree is npm -> cross-env -> tsx ->
  node, but a tree started earlier can still own the port after a later one failed
  to bind, so matching a single command line silently leaves the OLD server
  answering (this happened: `GET /api/status` returned 200 from a process started
  over an hour earlier, and every "restart" was a no-op):
  ```powershell
  $pids = Get-CimInstance Win32_Process -Filter "Name='node.exe' or Name='cmd.exe'" |
          Where-Object { $_.CommandLine -like '*server/index.ts*' -or $_.CommandLine -like '*npm run dev*' } |
          Select-Object -ExpandProperty ProcessId
  foreach ($p in $pids) { taskkill /PID $p /T /F 2>$null }
  ```
  Then confirm the port is actually free before relaunching:
  `Get-NetTCPConnection -LocalPort 5000 -State Listen` must return nothing.
- Relaunch with **PORT pinned to 5000**. A CI/agent shell can export its own
  `PORT` (this harness exports `5155`) and `server/index.ts` honours
  `process.env.PORT`, so an inherited value silently moves the app to a port that
  `APP_URL`, the Playwright `baseURL` and the Mercado Pago webhook registration
  do not know about:
  ```powershell
  $env:PORT='5000'
  Start-Process cmd.exe -ArgumentList '/c npm run dev > .dev-server.log 2> .dev-server.err.log' `
    -WorkingDirectory '<repo>' -WindowStyle Hidden
  ```
- Verify, don't assume. A 200 from `/api/status` proves nothing about *which*
  process answered, so check all four:
  1. `.dev-server.log` gained a **new** `serving on port 5000` line in the last
     minute,
  2. the port's owning PID **changed** (`Get-NetTCPConnection -LocalPort 5000 -State Listen`),
  3. `GET /api/public/captcha` answers `algorithm: "SHA-256"` with
     `salt`/`difficulty` - a `question` containing digits means the old math
     captcha code is still live,
  4. the behaviour you changed is actually different (the only real proof).
  `.dev-server.log` is block-buffered (stdout to a file), so a request issued
  seconds ago may not be in it yet.
  `.dev-server.err.log` is where a failed bind lands - check it when the app looks
  old.

Two consequences for testing:
- Rate limiters and the CAPTCHA single-use registry live **in memory**
  (`middleware/rateLimits.ts`, `services/captchaService.ts`), so a restart is also
  what clears them between long sessions. Note the limits are not the same
  everywhere: `authLimiter` is 5 logins per 15 min per IP, and 500 only when the
  process was explicitly relaxed with `RATE_LIMIT_RELAXED=true` - which
  `npm run dev` sets for local work and e2e runs. Never key that off `NODE_ENV`:
  `NODE_ENV !== "production"` is also true for an unset or misspelled value, so a
  misconfigured deployment would silently allow 100x the login attempts.
- e2e flakiness in this repo has always been **time, not limits**: the suite runs
  serially against the dev server, where the first request of each page waits for
  Vite to compile it, and the login also writes to the database. The fix is
  ceilings that are generous but return as soon as the condition is true - not
  tighter windows - plus keeping work out of the critical path:
  - `e2e/auth.setup.ts` logs the demo user in **once** per run and stores the
    session; the authenticated specs reuse it (`chromium-authenticated` project)
    instead of driving the form in every `beforeEach`. The public specs and
    `02-auth-login` run in the session-less `chromium` project and still exercise
    the real form.
  - Avoid `waitForLoadState('networkidle')` in specs: a dev server with an HMR
    socket never really goes quiet, so it is the first thing to time out. Wait for
    the element you actually need.
  - If a run still looks slow, run the single spec (`npx playwright test
    e2e/0X-....spec.ts`) before suspecting a regression.

### Traps worth remembering (each of these cost real debugging time)
- **Drizzle drops unknown keys silently.** `db.update(businesses).set({ plan: "x" })`
  neither throws nor writes: `POST /api/subscription` answered *"Plan actualizado"*
  while the tenant kept its old plan. Always pass the column names
  (`subscriptionPlan`, not `plan`) and, in tests, assert the **persisted** state or
  the exact key names - never just the object the handler handed over.
- **`NODE_ENV` is not a safe way to ask "am I in production?".** `NODE_ENV !==
  "production"` is also true for an unset or misspelled value, so whatever it
  guards gets silently relaxed on a live deployment (here it was the login limiter:
  5 -> 500 attempts). Prefer an explicit opt-in that fails closed
  (`RATE_LIMIT_RELAXED=true`), set by `npm run dev`.
- **A 200 from `/api/status` does not prove which process answered.** See the
  restart recipe above: check the listener PID and a fresh `serving on port` line.

### Security model (read before changing auth or tenant code)
- **Tenant = `businesses` row (RUC).** The only trusted tenant source is
  `req.user.businessId`, resolved from the session by `requireAuth`. Never accept a
  `businessId` from the body/query without checking it against
  `getManageableBusinessIds(user)` (server/services/tenantAccess.ts).
- **Roles** are enforced server-side by `requireRole`/`requireAdmin`/`requireStaff`
  (server/middleware/requireAuth.ts): `admin` = tenant administration (users, business
  profile, plan, establishments, integrations, RNPD register); `user` = complaint
  handling (complaints, attachments, books); `viewer` = read-only (no mutations).
  Client buttons are cosmetic - the server is authoritative.
- **Public intake** (`POST /api/public/complaints`) accepts only consumer fields:
  `complaintSubmissionSchema` strips status/priority/assignee/provider response/AI and
  retention fields. The CAPTCHA is single-use (consumed when a complaint is created), and its
  solution is found by the browser, so the form itself asks the consumer for nothing.
- **Sessions**: `SESSION_SECRET` is required in production (the server refuses to boot
  without it); cookie `lv.sid`, `httpOnly`, `sameSite=lax`, `secure` in production, and
  the session id is regenerated on login.
- **Manual migration**: `migrations/manual/0004_tenant_integrity_hardening.sql` adds the
  unique `(business_id, correlative_number)` index (plus a commented RLS template). It is
  intentionally outside the drizzle journal, so it only runs when applied by hand.
- **Security logging**: 401/403 responses on `/api` are logged as one JSON line tagged
  `[security]` with method/path/status/userId/role only - no bodies, query strings or
  emails (server/middleware/securityLog.ts). Alert on bursts of these.

### Database Design
The system uses a multi-tenant PostgreSQL database with the following core entities:
- **Users**: Business user accounts with role-based access
- **Businesses**: Company information, plan, trial and subscription lifecycle
- **Establishments**: Multiple business locations per company
- **Complaints**: Customer complaints with full audit trail
- **Complaint Attachments**: Evidence files submitted by consumers (metadata; files on disk)
- **User Business Access**: multi-RUC grants (one login, several businesses)
- **API Keys / Webhooks**: Corporativo integrations (keys are stored hashed)
- **Compliance Tracking**: Legal compliance monitoring and reporting
- **ARCO Requests**: Personal data rights management
- **Notifications**: System alerts and deadline reminders

### Authentication & Authorization
Simple session-based authentication is implemented for demo purposes, with user roles (admin, user, viewer) controlling access to different features. The system tracks user sessions and validates access to business-specific data.

### AI Integration
OpenAI GPT-4 integration provides intelligent complaint classification:
- Automatic detection of complaint type (reclamo vs queja)
- Sentiment analysis and priority assessment
- Risk level evaluation for legal compliance
- Suggested response generation

### Business Logic
Core business rules enforce Peruvian legal requirements:
- **15-day response deadline**: Automatic calculation excluding weekends and holidays
- **Correlative numbering**: Sequential complaint numbering per establishment
- **Data retention**: enforced by a daily sweep that anonymizes consumer PII and purges evidence files 24 months after submission (`server/services/retentionService.ts`, scheduled by `server/services/scheduler.ts`)
- **Legal notices**: Mandatory signage and disclosure requirements (Anexo II form + Anexo III poster + copy-paste web notice, see `server/routes/documents.routes.ts`)

### Compliance & commercial roadmap (implemented)
Beyond the base Libro de Reclamaciones, the product now covers the gaps against the
competitors. Everything below is wired end to end (server + client):

**Phase 1 - compliance**
- **Evidence attachments**: consumers upload PDF/JPG/PNG (5 MB each, 10 max) right
  after registering a complaint; files live on disk (`uploads/`, `ATTACHMENTS_DIR`),
  metadata in `complaint_attachments`, shown in the staff UI, listed in the constancia
  PDF and bundled into the expediente ZIP. `POST /api/public/complaints/:id/attachments`
  is authenticated by knowledge (the consumer's document number).
- **2-year retention**: `retentionService` anonymizes consumer PII and deletes evidence
  files once the 24-month window closes, keeping aggregate data; each purge appends an
  audit-log entry. Runs daily (and on boot) via `scheduler.ts`.
- **INDECOPI expediente**: `GET /api/complaints/expediente/descargar` returns a ZIP with
  `hojas/*.pdf` (constancias), `adjuntos/`, `sirec.csv` and `MANIFIESTO.txt` carrying the
  generation timestamp, filters and a SHA-256 verification code.
- **Anexo II/III**: `GET /api/documents/anexo-ii` (print-ready A4 blank form, title >= 1 cm,
  body >= 0.5 cm) plus the existing Anexo III poster and a copy-paste web-notice snippet.
- **CAPTCHA + honeypot**: self-hosted proof-of-work challenge (`captchaService`, no third-party
  script, nothing for the consumer to read or type) plus a honeypot field on the public form;
  both verified on submission. The same gate protects the public AI assistant, the ARCO intake
  and registration.

**Phase 2 - commercial**
- **Plans & quotas**: `shared/plans.ts` defines Básico/Pro/Empresarial (monthly and
  annual, annual ~50% off), quotas are enforced on complaints (unlimited on all paid plans), users, establishments, businesses and
  attachments, and every new tenant starts a 15-day trial with Pro features.
  `GET /api/plans`, `GET|POST /api/subscription`, UI at `/plan`.
- **Multi-RUC switcher**: `user_business_access` grants a login access to several businesses;
  `GET /api/auth/businesses` + `POST /api/auth/switch-business` and a header dropdown.
- **Access requests** (one RUC, one tenant, no dead end): a RUC that is already registered
  cannot be registered again, so the second legitimate person (the accountant of a client, a
  new partner, staff turnover) asks for access instead: `POST /api/businesses/access-requests`
  → the tenant's administrators are notified → `GET /api/businesses/access-requests`
  (incoming) / `.../mine` and `POST .../:id/approve|reject` (UI at `/empresas`). Approving
  grants the switcher access and, when the requester has no tenant yet, finishes their
  onboarding instead of sending them back to the wizard.
- **Email verification**: signup emails a confirmation link (inside the welcome email) for the
  mailbox that receives every complaint notification: `POST /api/auth/verify-email`,
  `POST /api/auth/resend-verification`, page at `/acceso/verificar-email` and a banner in the
  panel while `is_email_verified` is false. Completing a password reset also confirms the
  address, because following that link proves control of the mailbox too. Since
  `services/verificationService.ts` the flag is ENFORCED: no company/libro can be created from an
  unconfirmed account (`403 email_not_verified`) and the public book refuses complaints while no
  active administrator is verified (`403 libro_not_published`; the portal shows "aún no está en
  línea"). `ALLOW_UNVERIFIED_BUSINESSES=true` is the escape hatch for a legacy live book.
- **Code login**: a passwordless second way in, proven against that same mailbox -
  `POST /api/auth/request-code` emails a 6-digit single-use code (10 min, bcrypt-hashed) and
  `POST /api/auth/login-with-code` exchanges it for a session. The failure counter and the
  lockout are shared with the password path. UI: "Entrar con un código por email" at `/acceso`.
- **Abandoning the app**: `DELETE /api/users/:id` (admin, same tenant), `DELETE /api/users/me`
  (own account; `?closeBusiness=true` also closes the company) and `POST /api/businesses/:id/close`.
  An empty tenant is erased; a tenant with complaints keeps them for the legal 2-year retention
  (`server/services/accountClosureService.ts` + `server/storage/purge.storage.ts`), and the
  subscription is always cancelled first. UI: Mi Perfil → "Zona de riesgo" and the trash button on
  each card of `/empresas`.
- **Plan limits are visible BEFORE the click**: `components/subscription/plan-limit.tsx` disables
  "Nuevo Usuario" / "Nueva Empresa" when the plan's quota is reached and explains it on hover, with
  a permanent "1 / 1 · plan Gratis · Mejorar plan" line under the page title. A rejected 400 now
  names the offending field (`apiFieldErrors`) instead of the bare "Datos inválidos".
- **PWA / stale shell**: `client/public/sw.js` (v2) serves documents network-first and only uses
  the cache as an offline fallback, dev unregisters any worker left by a production build
  (`main.tsx`), and `client/public/reset.html` is the one-URL recovery page (unregister + clear
  caches + reload) for a browser that is already stuck on an old shell. `/sw.js` and `/reset.html`
  are served `no-store`.
- **Configurable templates**: per-business brand color, email subject prefix/header/footer and
  portal confirmation text (`PATCH /api/libro-configuration`, UI at `/personalizacion`).
- **SLA reminders + escalation**: `slaMonitoringService` turns the existing SLA prediction into
  in-app/email reminders for the assignee and escalations to managers (with a `wa.me` link),
  hourly via the scheduler.

**Phase 3 - differentiators**
- **AI brand voice**: response drafts follow the business's own tone and policies
  (`brandTone`/`brandPolicies` injected into the prompt via `renderBrandInstructions`).
- **Reincidence, abusive clauses, executive summary**: `GET /api/reports/reincidencia`,
  `POST /api/ai/abusive-clauses` (art. 47 Código de Protección y Defensa del Consumidor) and
  `POST /api/ai/case-summary`; surfaced in the "Analítica IA" tab of `/reportes` and in the
  response dialog.
- **Multichannel intake**: embeddable `widget.js` (iframe modal, `/libro/:slug?embed=1`), public
  REST API `POST|GET /api/v1/complaints` with hashed API keys, and outgoing webhooks signed with
  HMAC-SHA256. UI at `/integraciones` (Corporativo).
- **Compliance co-pilot**: a domain-scoped, tool-calling agent (`server/services/agentService.ts`)
  at `POST /api/agent/chat` (UI at `/asistente`). The model never invents the law or the dates:
  `buscar_normativa` retrieves from the curated corpus `shared/legal-knowledge.ts`, `calcular_plazo`
  delegates to `businessDayCalculator`, and the data tools (`consultar_reclamos`, `resumen_caso`,
  `estado_cumplimiento`, `estadisticas_reclamos`) are hard-scoped to the session `businessId`, so a
  tenant can never see another's data. Consumer PII is left out of the prompts. Override the loop's
  model with `AI_AGENT_MODEL`; verify live with `npx tsx scripts/verify-agent.ts`.
- **PWA, accessibility and status**: web manifest + service worker (static shell only, never
  `/api`), WCAG AA skip link/landmarks/ARIA labels, an accessibility and cookie statement at
  `/accesibilidad`, an informational cookie notice, and a public status page `/estado` backed by
  `GET /api/status`.
- **Redes sociales (la vía simple)**: `client/src/components/libro/social-channels-card.tsx` en
  `/integraciones` entrega el enlace público del Libro, textos listos para copiar y los pasos por
  plataforma para publicarlo en WhatsApp Business, Instagram, TikTok, YouTube y Facebook. Sin API,
  sin alta en Meta y disponible en todos los planes: para quien vende sin web, este ES el camino de
  cumplimiento (el Libro virtual debe ser accesible desde el mismo medio donde vende).
  Qué guía ve cada cliente lo decide `client/src/lib/channel-fit.ts` (probado en `channel-fit.test.ts`)
  a partir de `libro_configuration.business_type`: tienda virtual → enlace web/widget; local físico y
  servicios → guía de perfiles sociales; mixto o valor desconocido → ambas. El tipo es editable en la
  misma página (`PATCH /api/libro-configuration`, solo admin) porque el onboarding puede equivocarse.
- **WhatsApp Cloud API (add-on opcional, sin UI)**: `server/services/whatsappService.ts` y
  `server/routes/whatsapp.routes.ts` pueden responder automáticamente los mensajes entrantes con el
  enlace al Libro y avisar una respuesta ya escrita (`POST /api/complaints/:id/whatsapp-notify`,
  limitado por `features.whatsapp`). Exige una WABA de Meta (variables de entorno) y un número por
  empresa; sin esas variables no envía nada y ninguna pantalla lo muestra. El canal escrito
  (correo/carta) sigue siendo el registro legal.
- **Mobile shell**: bottom navigation is four destinations plus a "Más" sheet
  (`client/src/lib/navigation.ts`, tested in `navigation.test.ts`) with >=44px targets and
  safe-area padding; pinch-zoom is not blocked (`viewport` without `maximum-scale`, WCAG 1.4.4)
  and the tables drop secondary columns below `sm`/`lg` instead of squeezing them.

### API Architecture
RESTful API endpoints organized by domain:
- `/api/auth/*` - Authentication, session management and multi-RUC switching
- `/api/complaints/*` - Complaint CRUD operations, attachments and the expediente ZIP
- `/api/establishments/*` - Business location management
- `/api/compliance/*` - Legal compliance tracking and reporting
- `/api/subscription`, `/api/plans` - plan catalog, quotas and usage
- `/api/api-keys`, `/api/webhooks`, `/api/integrations/*` - Corporativo integrations
- `/api/v1/*` - public REST API for CRM/ERP (API-key auth)
- `/api/status` - public health/status page feed
- `/api/whatsapp/webhook` (Meta), `/api/whatsapp/status`, `/api/complaints/:id/whatsapp-notify` - WhatsApp Cloud API
- `/api/public/*` - Public-facing complaint submission portal (CAPTCHA-protected)

### UI/UX Design
Modern, responsive design using shadcn/ui components:
- Mobile-first responsive layout with adaptive navigation
- Spanish localization throughout the interface
- Accessibility considerations with proper ARIA labels
- Material Design icons for consistent visual language

## External Dependencies

### Database & ORM
- **Neon Database**: Serverless PostgreSQL hosting with connection pooling
- **Drizzle ORM**: Type-safe database operations with schema validation
- **Drizzle Kit**: Database migration and schema management tools

### AI Services
- **OpenAI API**: GPT-4 integration for complaint classification and response generation
- **Natural Language Processing**: Automated text analysis for Spanish language complaints

### UI Framework & Styling
- **React**: Frontend framework with TypeScript support
- **Vite**: Fast build tool and development server
- **Tailwind CSS**: Utility-first CSS framework
- **Radix UI**: Headless component primitives for accessibility
- **shadcn/ui**: Pre-built component library built on Radix UI

### Form Management & Validation
- **React Hook Form**: Performant form handling with minimal re-renders
- **Zod**: TypeScript-first schema validation
- **Hookform Resolvers**: Integration between React Hook Form and Zod

### Date & Time Management
- **date-fns**: Date utility library for business day calculations
- **Peruvian Holiday Calendar**: Hardcoded national holidays for accurate deadline calculation

### Development & Build Tools
- **TypeScript**: Type safety across the entire stack
- **ESLint & Prettier**: Code quality and formatting
- **PostCSS**: CSS processing with Autoprefixer
- **Node.js**: Server runtime environment

### Email & Document Generation
- **Nodemailer**: Email service for complaint confirmations and responses
- **PDFKit**: PDF generation for legal compliance documents
- **File Upload Handling**: Support for complaint attachments and evidence

### Production domain, CDN and email
- **`librodigital.pe`** is the product domain (brand `LibroDigital.pe`); `APP_URL` must
  carry it in production, because every email and payment link is built from it.
- **Cloudflare** fronts the domain (DNS + proxy + TLS). The app reads the real client
  address through `TRUST_PROXY` (`server/middleware/security.ts`) - unset = 1 hop, 2 when
  the host adds its own proxy, or a CIDR list of Cloudflare's ranges. A wrong value
  silently funnels every visitor into one rate-limit bucket and logs the CDN's IP.
- **Zoho Mail** hosts the only mailbox, `hola@librodigital.pe`: it is the SMTP sender
  (`smtp.zoho.com`, port 465/SSL or 587/TLS - authentication with the mailbox password, or
  an app-specific password when 2FA is on), the contact address on the landing and
  accessibility pages, `PAYMENTS_ALERT_EMAIL`, and the address the compliance co-pilot
  names when a user asks for human help. `npm run email:diagnose` finds the working
  host/password combination instead of guessing.
- DNS records, the CSP-vs-Rocket-Loader trap and the end-to-end mail checklist live in
  **RUNBOOK.md §9**.

### Session Management
- **connect-pg-simple**: PostgreSQL session store for Express sessions
- **Session-based Authentication**: Simple authentication without JWT complexity

### Monitoring & Analytics
- **TanStack Query**: Server state management and caching
- **Error Tracking**: Development error overlays and runtime error handling
- **Performance Monitoring**: Built-in development tools for optimization