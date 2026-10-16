import "./env";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { isPubliclyReachableBaseUrl } from "@shared/payments";
import { setupRUCLookup } from "./ruc-lookup";
import { startScheduler } from "./services/scheduler";

const app = express();
// The raw body is kept so webhook signatures can be verified (WhatsApp Cloud
// API signs the exact bytes it sent; re-serializing parsed JSON would not match).
app.use(express.json({
  verify: (req, _res, buf) => {
    (req as Request & { rawBody?: Buffer }).rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: false }));

// Request logging. Response bodies are deliberately NOT logged: this is a
// multi-tenant system handling consumer PII (names, document numbers, contact
// details) and credentials flows, and persisting response payloads to logs
// would be a personal-data leak path (Ley 29733 minimization principle).
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

(async () => {
  // Setup RUC lookup endpoint first
  setupRUCLookup(app);
  
  const server = await registerRoutes(app);

  // The exact address to paste into the Mercado Pago panel, printed once at boot.
  // Guessing it is a common source of "the plan never activates": the panel needs
  // the same base URL the app builds its notifications and return URLs from.
  const configuredAppUrl = process.env.APP_URL?.trim().replace(/\/+$/, '');
  if (!configuredAppUrl) {
    log('[payments] APP_URL is not set: Mercado Pago notifications will not work.');
  } else {
    log(`[payments] Mercado Pago webhook to register: ${configuredAppUrl}/api/payments/webhook/mercadopago`);
    if (!isPubliclyReachableBaseUrl(configuredAppUrl)) {
      log(
        `[payments] WARNING: APP_URL "${configuredAppUrl}" is not a public HTTPS address, so ` +
          'Mercado Pago cannot deliver payment notifications there. Use a public tunnel (ngrok, ' +
          'cloudflared) while developing, and the real domain in production.',
      );
    }
  }

  // Background jobs: 2-year retention sweep (daily) + SLA monitoring (hourly)
  startScheduler();

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;

    // Log server-side with the stack, but answer 5xx with a generic message:
    // internal error text can disclose schema details, file paths or data.
    console.error('Unhandled error:', err);

    const message = status >= 500
      ? "Error interno del servidor"
      : err.message || "Internal Server Error";

    res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    // SO_REUSEPORT is not supported on Windows (throws ENOTSUP), so only enable it elsewhere
    reusePort: process.platform !== "win32",
  }, () => {
    log(`serving on port ${port}`);
  });
})();
