import type { Express } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import memorystore from "memorystore";
import helmet from "helmet";

import { isLocalDatabase } from "../db";
import { securityAuditLogger } from "./securityLog";

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
  
  // Security middleware with relaxed CSP for development.
  // In production the client is a plain Vite build (external module scripts
  // only), so scripts do NOT need 'unsafe-inline' or 'unsafe-eval' - allowing
  // them would neutralize the CSP against stored-XSS payloads embedded in
  // complaint content.
  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"],
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

  // The session secret signs the session cookie: running production with a
  // publicly known fallback would let anyone forge sessions. Fail fast instead.
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret && process.env.NODE_ENV === 'production') {
    throw new Error(
      'SESSION_SECRET is required in production. Refusing to start with the ' +
      'insecure development fallback.'
    );
  }

  app.use(session({
    name: 'lv.sid',
    store: sessionStore,
    secret: sessionSecret || 'fallback-secret-only-for-dev',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      // Blocks the cookie on cross-site POSTs (CSRF defense-in-depth; the API
      // is same-site and uses no third-party form posts).
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  }));

  // Authorization failures are logged in a structured, PII-free way so they can
  // be alerted on (see middleware/securityLog.ts).
  app.use(securityAuditLogger);
}
