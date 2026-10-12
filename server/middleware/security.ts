import type { Express } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import memorystore from "memorystore";
import helmet from "helmet";

import { isLocalDatabase } from "../db";

/**
 * Trust proxy, security headers and the session store.
 *
 * Must run before any route is registered: the auth middleware reads
 * `req.session`, and rate limiting relies on `trust proxy` to see the real client
 * address in production.
 */
export function applySecurityMiddleware(app: Express): void {
  // Trust proxy for rate limiting to work correctly in production
  app.set('trust proxy', 1);
  
  // Security middleware with relaxed CSP for development
  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        connectSrc: ["'self'", "ws:", "wss:"],
      },
    } : false, // Disable CSP in development
  }));

  // Session configuration: PostgreSQL backed sessions in production, in-memory
  // sessions when running against the embedded local development database.
  const sessionStore = isLocalDatabase
    ? new (memorystore(session))({ checkPeriod: 24 * 60 * 60 * 1000 })
    : new (connectPg(session))({
        conString: process.env.DATABASE_URL,
        tableName: 'session',
        createTableIfMissing: true,
      });

  app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'fallback-secret-only-for-dev',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  }));
}
