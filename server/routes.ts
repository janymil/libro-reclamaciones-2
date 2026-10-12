import type { Express } from "express";
import { createServer, type Server } from "http";

import { applySecurityMiddleware } from "./middleware/security";
import { registerAuthRoutes } from "./routes/auth.routes";
import { registerDashboardRoutes } from "./routes/dashboard.routes";
import { registerBusinessesRoutes } from "./routes/businesses.routes";
import { registerBooksRoutes } from "./routes/books.routes";
import { registerUsersRoutes } from "./routes/users.routes";
import { registerHistoryRoutes } from "./routes/history.routes";
import { registerComplaintsRoutes } from "./routes/complaints.routes";
import { registerAiRoutes } from "./routes/ai.routes";
import { registerEstablishmentsRoutes } from "./routes/establishments.routes";
import { registerArcoRoutes } from "./routes/arco.routes";
import { registerComplianceRoutes } from "./routes/compliance.routes";
import { registerNotificationsRoutes } from "./routes/notifications.routes";
import { registerPublicRoutes } from "./routes/public.routes";
import { registerDocumentsRoutes } from "./routes/documents.routes";

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

  registerAuthRoutes(app);
  registerDashboardRoutes(app);
  registerBusinessesRoutes(app);
  registerBooksRoutes(app);
  registerUsersRoutes(app);
  registerHistoryRoutes(app);
  registerComplaintsRoutes(app);
  registerAiRoutes(app);
  registerEstablishmentsRoutes(app);
  registerArcoRoutes(app);
  registerComplianceRoutes(app);
  registerNotificationsRoutes(app);
  registerPublicRoutes(app);
  registerDocumentsRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}
