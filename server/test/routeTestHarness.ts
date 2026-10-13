import express, { type Express } from "express";
import type { AddressInfo } from "node:net";

/**
 * Minimal HTTP harness for route-level security tests.
 *
 * Deliberately dependency-free (no supertest): the app is mounted on an
 * ephemeral port and driven with the global `fetch`.
 *
 * `x-test-user` carries the id of the authenticated session user. The stub
 * session middleware below stands in for `express-session`; the REAL
 * `requireAuth` middleware still runs, resolving the user through the mocked
 * `authService.validateSessionUser`, so tests exercise the production
 * authorization chain (auth -> role check -> tenant check -> handler).
 */
export interface TestSessionStore {
  users: Record<string, any>;
}

export async function startTestApp(
  register: (app: Express) => void,
): Promise<{ url: string; close: () => Promise<void> }> {
  const app = express();
  app.use(express.json());

  app.use((req: any, _res, next) => {
    const userId = req.get("x-test-user");
    req.session = {
      userId,
      destroy: (cb?: (err?: unknown) => void) => cb?.(),
      regenerate: (cb?: (err?: unknown) => void) => {
        req.session.userId = userId;
        cb?.();
      },
    };
    next();
  });

  register(app);

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export interface TestResponse {
  status: number;
  body: any;
}

/** Performs a JSON request against the harnessed app. */
export async function call(
  url: string,
  path: string,
  options: { method?: string; userId?: string | null; body?: unknown } = {},
): Promise<TestResponse> {
  const { method = "GET", userId, body } = options;

  const headers: Record<string, string> = {};
  if (userId !== null && userId !== undefined) {
    headers["x-test-user"] = userId;
  }
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const response = await fetch(`${url}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  return { status: response.status, body: parsed };
}
