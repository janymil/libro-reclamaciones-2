import type { Express } from "express";
import { createServer, type Server } from "http";

import { applySecurityMiddleware } from "./middleware/security";
import { registerHealthRoutes } from "./routes/health.routes";
import { registerAuthRoutes } from "./routes/auth.routes";
import { registerDashboardRoutes } from "./routes/dashboard.routes";
import { registerBusinessesRoutes } from "./routes/businesses.routes";
import { registerAccessRequestRoutes } from "./routes/accessRequests.routes";
import { registerBooksRoutes } from "./routes/books.routes";
import { registerUsersRoutes } from "./routes/users.routes";
import { registerHistoryRoutes } from "./routes/history.routes";
import { registerComplaintsRoutes } from "./routes/complaints.routes";
import { registerAttachmentsRoutes } from "./routes/attachments.routes";
import { registerSubscriptionRoutes } from "./routes/subscription.routes";
import { registerPaymentsRoutes } from "./routes/payments.routes";
import { registerComprobantesRoutes } from "./routes/comprobantes.routes";
import { registerAdminRoutes } from "./routes/admin.routes";
import { registerIntegrationsRoutes } from "./routes/integrations.routes";
import { registerApiV1Routes } from "./routes/api.routes";
import { registerStatusRoutes } from "./routes/status.routes";
import { registerReportsRoutes } from "./routes/reports.routes";
import { registerAiRoutes } from "./routes/ai.routes";
import { registerAgentRoutes } from "./routes/agent.routes";
import { registerEstablishmentsRoutes } from "./routes/establishments.routes";
import { registerArcoRoutes } from "./routes/arco.routes";
import { registerComplianceRoutes } from "./routes/compliance.routes";
import { registerNotificationsRoutes } from "./routes/notifications.routes";
import { registerPublicRoutes } from "./routes/public.routes";
import { registerDocumentsRoutes } from "./routes/documents.routes";
import { registerWhatsAppRoutes } from "./routes/whatsapp.routes";
import { registerEmailRoutes } from "./routes/email.routes";
import { registerContactRoutes } from "./routes/contact.routes";
import { registerSeoRoutes } from "./services/seoService";

/**
 * Wires the HTTP application together.
 *
 * This file is intentionally a thin facade. Each feature area owns its own route
 * module under `server/routes/`, and cross cutting middleware lives in
 * `server/middleware/`. Registration order is preserved from the original
 * monolithic implementation.
 */
export async function registerRoutes(app: Express): Promise<Server> {
  applySecurityMiddleware(app);

  // Probes first: they must stay reachable (and unauthenticated) even if a
  // feature module below fails to register.
  registerHealthRoutes(app);

  registerAuthRoutes(app);
  registerDashboardRoutes(app);
  registerBusinessesRoutes(app);
  registerAccessRequestRoutes(app);
  registerBooksRoutes(app);
  registerUsersRoutes(app);
  registerHistoryRoutes(app);
  registerComplaintsRoutes(app);
  registerAttachmentsRoutes(app);
  registerSubscriptionRoutes(app);
  registerPaymentsRoutes(app);
  registerComprobantesRoutes(app);
  registerAdminRoutes(app);
  registerIntegrationsRoutes(app);
  registerApiV1Routes(app);
  registerStatusRoutes(app);
  registerReportsRoutes(app);
  registerAiRoutes(app);
  registerAgentRoutes(app);
  registerEstablishmentsRoutes(app);
  registerArcoRoutes(app);
  registerComplianceRoutes(app);
  registerNotificationsRoutes(app);
  registerPublicRoutes(app);
  registerDocumentsRoutes(app);
  registerWhatsAppRoutes(app);
  registerEmailRoutes(app);
  registerContactRoutes(app);
  registerSeoRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}
