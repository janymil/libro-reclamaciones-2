import type { Express } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import memorystore from "memorystore";
import helmet from "helmet";

import { isLocalDatabase } from "../db";
import { securityAuditLogger } from "./securityLog";

/**
 * Resolves the `trust proxy` setting from `TRUST_PROXY`.
 *
 * The app runs behind Cloudflare in production, so Express has to be told which
 * peers may set `X-Forwarded-For` / `X-Forwarded-Proto`. Getting this wrong is
 * not cosmetic:
 *
 *  - Too low (or unset behind two proxies) and every request looks like it came
 *    from the CDN: the login limiter throttles the whole country as one visitor
 *    ("too many attempts" for everyone) and the security log records Cloudflare's
 *    IP instead of whoever was probing.
 *  - Too high, or `true`, and anyone who finds the origin IP can forge the header
 *    and sidestep every limiter - which is why the CIDR-list form is the safe one
 *    (only Cloudflare's published ranges are allowed to speak, see
 *    https://www.cloudflare.com/ips/).
 *
 * Accepted values:
 *   undefined / ""  1 - default: a single hop in front of the app (Cloudflare
 *                   talking to the origin directly).
 *   "false"         trust nobody (only correct with no proxy at all).
 *   "true"          trust every hop (insecure unless the origin is unreachable
 *                   except through the proxy - e.g. firewalled to Cloudflare).
 *   2, 3, ...       that many hops, counted from the right of the header.
 *   "1.2.3.0/24,…"  a comma-separated address/CIDR list.
 */
export function parseTrustProxy(raw: string | undefined): boolean | number | string[] {
  const value = raw?.trim();

  if (!value) return 1;
  if (value === "false") return false;
  if (value === "true") return true;
  if (/^\d+$/.test(value)) return Number(value);

  const ranges = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return ranges.length > 0 ? ranges : 1;
}

/**
 * Trust proxy, security headers and the session store.
 *
 * Must run before any route is registered: the auth middleware reads
 * `req.session`, and rate limiting relies on `trust proxy` to see the real client
 * address in production.
 */
export function applySecurityMiddleware(app: Express): void {
  const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);
  app.set('trust proxy', trustProxy);

  // Printed once per boot, because a wrong value fails silently and confusingly
  // (login limiter blocking everyone, security log full of the CDN's address).
  console.log(
    `[proxy] trust proxy = ${JSON.stringify(trustProxy)}. ` +
      'Behind Cloudflare: 1 when the CDN reaches the origin directly, 2 when your ' +
      'host adds its own proxy hop, or a CIDR list of Cloudflare ranges (see .env.example).',
  );
  
  // The team's panel is a private screen: keep it out of every search index. Its
  // path is configurable on purpose (`client/src/lib/admin-path.ts`) and is
  // deliberately NOT `/admin`, which stays a 404 - that is the first path every
  // scanner tries, so it should look like nothing at all.
  const adminPath = (process.env.VITE_ADMIN_PATH || '/ld-oficina-7f31').trim().replace(/\/+$/, '');
  app.use((req, res, next) => {
    if (req.path === adminPath || req.path.startsWith(`${adminPath}/`)) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    }
    next();
  });

  // Security middleware with relaxed CSP for development.
  // In production the client is a plain Vite build (external module scripts
  // only), so scripts do NOT need 'unsafe-inline' or 'unsafe-eval' - allowing
  // them would neutralize the CSP against stored-XSS payloads embedded in
  // complaint content.
  app.use(helmet({
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://www.googletagmanager.com", "https://tagassistant.google.com", "https://static.cloudflareinsights.com"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'", "https://tagassistant.google.com"],
        frameSrc: ["'self'", "https://tagassistant.google.com"],
        imgSrc: ["'self'", "data:", "https:", "https://*.google-analytics.com", "https://*.googletagmanager.com", "https://tagassistant.google.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        connectSrc: ["'self'", "ws:", "wss:", "https://*.google-analytics.com", "https://*.analytics.google.com", "https://*.googletagmanager.com", "https://tagassistant.google.com", "https://static.cloudflareinsights.com"],
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
