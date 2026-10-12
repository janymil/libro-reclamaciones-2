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
- `npm test` - Vitest suite (Peruvian business-day maths, form validation, AI fallbacks)
- `npm run build` - production client bundle plus the bundled server

### Database Design
The system uses a multi-tenant PostgreSQL database with the following core entities:
- **Users**: Business user accounts with role-based access
- **Businesses**: Company information and subscription management
- **Establishments**: Multiple business locations per company
- **Complaints**: Customer complaints with full audit trail
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
- **Data retention**: 2-year complaint record retention requirement
- **Legal notices**: Mandatory signage and disclosure requirements

### API Architecture
RESTful API endpoints organized by domain:
- `/api/auth/*` - Authentication and session management
- `/api/complaints/*` - Complaint CRUD operations and management
- `/api/establishments/*` - Business location management
- `/api/compliance/*` - Legal compliance tracking and reporting
- `/api/public/*` - Public-facing complaint submission portal

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