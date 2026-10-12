import type { User } from "@shared/schema";

/**
 * Ambient types for the request objects the server hands to route handlers.
 *
 * `requireAuth` (server/middleware/requireAuth.ts) decorates the request with the
 * authenticated user and login stores the user id on the session. Declaring both
 * here means handlers can stop reaching for `any` and the compiler catches typos
 * like `req.user.bussinessId`.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by `requireAuth`. The session user, without the password hash. */
      user?: Omit<User, "password">;
    }
  }
}

declare module "express-session" {
  interface SessionData {
    /** Id of the authenticated user, set on successful login. */
    userId?: string;
  }
}

export {};
