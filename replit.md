# LibroVirtual.pe - Sistema de Gestión de Libro de Reclamaciones

## Overview

LibroVirtual.pe is a comprehensive SaaS application designed for Peruvian businesses to manage their "Libro de Reclamaciones" (Complaints Book) in strict compliance with Peruvian regulations. The system enables multi-tenant management of customer complaints and grievances while ensuring legal compliance with DS 011-2011-PCM, DS 101-2022-PCM, and Law 29733 (Personal Data Protection).

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
- `npm run db:apply -- migrations/0003_compliance_commercial.sql` - applies the
  additive compliance/commercial migration (idempotent, `IF NOT EXISTS` throughout);
  local PGlite databases get it automatically from `migrations/`.

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
- **CAPTCHA + honeypot**: self-hosted signed math challenge (`captchaService`, no third-party
  script) plus a honeypot field on the public form; both verified on submission.

**Phase 2 - commercial**
- **Plans & quotas**: `shared/plans.ts` defines Esencial/Profesional/Corporativo (monthly and
  annual), quotas are enforced on complaints, users, establishments, businesses and
  attachments, and every new tenant starts a 7-day trial with Profesional features.
  `GET /api/plans`, `GET|POST /api/subscription`, UI at `/plan`.
- **Multi-RUC switcher**: `user_business_access` grants a login access to several businesses;
  `GET /api/auth/businesses` + `POST /api/auth/switch-business` and a header dropdown.
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

### Session Management
- **connect-pg-simple**: PostgreSQL session store for Express sessions
- **Session-based Authentication**: Simple authentication without JWT complexity

### Monitoring & Analytics
- **TanStack Query**: Server state management and caching
- **Error Tracking**: Development error overlays and runtime error handling
- **Performance Monitoring**: Built-in development tools for optimization