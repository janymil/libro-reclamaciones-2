import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { startTestApp, call } from "../test/routeTestHarness";

/**
 * HTTP contract for self-service password recovery.
 *
 * `authService` is mocked on purpose: what is asserted here is the ROUTE
 * behaviour that is easy to break while editing — the identical response for
 * known and unknown addresses (no account enumeration) and the status codes for
 * malformed input. The token/hashing logic is covered in
 * `server/services/passwordReset.test.ts`.
 */

const h = vi.hoisted(() => ({
  requests: [] as Array<{ email: string }>,
  resets: [] as Array<{ token: string; password: string }>,
  resetResult: {
    success: true,
    message: "Contraseña actualizada. Ya puedes iniciar sesión.",
  },
}));

vi.mock("../storage", () => ({ storage: {} }));

vi.mock("../services/authService", () => ({
  authService: {
    requestPasswordReset: async (email: string) => {
      h.requests.push({ email });
    },
    resetPassword: async (token: string, password: string) => {
      h.resets.push({ token, password });
      return h.resetResult;
    },
  },
}));

import { registerAuthRoutes } from "./auth.routes";

let app: Awaited<ReturnType<typeof startTestApp>>;

beforeEach(async () => {
  h.requests = [];
  h.resets = [];
  h.resetResult = {
    success: true,
    message: "Contraseña actualizada. Ya puedes iniciar sesión.",
  };
  app = await startTestApp(registerAuthRoutes);
});

afterEach(async () => {
  await app.close();
});

describe("POST /api/auth/forgot-password", () => {
  it("answers identically for a known and an unknown address", async () => {
    const known = await call(app.url, "/api/auth/forgot-password", {
      method: "POST",
      userId: null,
      body: { email: "juana@example.com" },
    });
    const unknown = await call(app.url, "/api/auth/forgot-password", {
      method: "POST",
      userId: null,
      body: { email: "nadie@example.com" },
    });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    // The bodies must be indistinguishable, otherwise the endpoint leaks which
    // email addresses have accounts.
    expect(known.body).toEqual(unknown.body);
    expect(h.requests).toHaveLength(2);
  });

  it("rejects a malformed email with 400 and never reaches the service", async () => {
    const res = await call(app.url, "/api/auth/forgot-password", {
      method: "POST",
      userId: null,
      body: { email: "no-es-un-email" },
    });

    expect(res.status).toBe(400);
    expect(h.requests).toHaveLength(0);
  });
});

describe("POST /api/auth/reset-password", () => {
  it("rejects a password shorter than the shared minimum", async () => {
    const res = await call(app.url, "/api/auth/reset-password", {
      method: "POST",
      userId: null,
      body: { token: "a".repeat(64), password: "corta" },
    });

    expect(res.status).toBe(400);
    expect(h.resets).toHaveLength(0);
  });

  it("rejects a missing token", async () => {
    const res = await call(app.url, "/api/auth/reset-password", {
      method: "POST",
      userId: null,
      body: { password: "NewPassw0rd!" },
    });

    expect(res.status).toBe(400);
    expect(h.resets).toHaveLength(0);
  });

  it("passes a valid token + password through and reports success", async () => {
    const res = await call(app.url, "/api/auth/reset-password", {
      method: "POST",
      userId: null,
      body: { token: "a".repeat(64), password: "NewPassw0rd!" },
    });

    expect(res.status).toBe(200);
    expect(h.resets).toHaveLength(1);
    expect(h.resets[0].password).toBe("NewPassw0rd!");
    expect(res.body.message).toContain("actualizada");
  });

  it("surfaces a rejected token as 400", async () => {
    h.resetResult = { success: false, message: "El enlace de restablecimiento no es válido o ha expirado." };

    const res = await call(app.url, "/api/auth/reset-password", {
      method: "POST",
      userId: null,
      body: { token: "b".repeat(64), password: "NewPassw0rd!" },
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("expirado");
  });
});
