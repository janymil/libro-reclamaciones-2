import type { Request, Response, NextFunction } from "express";

/**
 * Structured security logging (OWASP A09: security logging and monitoring).
 *
 * Records authorization failures in a machine-readable, PII-free form so they
 * can be alerted on (e.g. bursts of 403s = someone probing other tenants)
 * without turning the log into a second copy of the personal data the app
 * protects.
 *
 * Deliberately excluded: request bodies, response bodies, query strings
 * (they can carry document numbers / tokens), emails and names. Only the
 * request path, method, status and the internal user id are kept.
 */

export interface AuthzDenialEvent {
  type: "authz_denial";
  at: string;
  method: string;
  path: string;
  status: number;
  userId: string | null;
  role: string | null;
  ip: string | null;
}

/** Pure builder so the redaction rules can be unit-tested. */
export function buildDenialEvent(req: any, status: number): AuthzDenialEvent {
  return {
    type: "authz_denial",
    at: new Date().toISOString(),
    method: String(req.method ?? "GET"),
    // req.path only: never req.originalUrl, which would include the query string.
    path: String(req.path ?? ""),
    status,
    userId: req.session?.userId ?? null,
    role: req.user?.role ?? null,
    ip: req.ip ?? null,
  };
}

/** Emits one JSON line per event (stdout/stderr are collected by the host). */
export function logSecurityEvent(event: AuthzDenialEvent): void {
  console.warn(`[security] ${JSON.stringify(event)}`);
}

/**
 * Logs 401/403 responses on API routes after they are sent. 404s are
 * intentionally not logged: this app answers 404 for "not yours" by design, so
 * logging them would both flood the log and be misleading.
 */
export function securityAuditLogger(req: Request, res: Response, next: NextFunction): void {
  res.on("finish", () => {
    if (!req.path.startsWith("/api")) {
      return;
    }
    if (res.statusCode === 401 || res.statusCode === 403) {
      logSecurityEvent(buildDenialEvent(req, res.statusCode));
    }
  });

  next();
}
