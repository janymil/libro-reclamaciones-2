import { describe, it, expect, beforeEach, vi } from "vitest";

import { startTestApp, call } from "../test/routeTestHarness";

/**
 * Irreversible deletion of a login ("abandon the app").
 *
 * Three guards carry the weight and are pinned here:
 *   * only an admin of the SAME tenant may delete somebody (404 for anybody
 *     else, so the endpoint does not confirm that an account exists),
 *   * an admin never deletes itself through the team endpoint - that is
 *     "Eliminar mi cuenta", which knows what to do with the company, and
 *   * the LAST active administrator of a tenant cannot be removed at all: the
 *     company would be left with nobody able to manage it.
 */

const BUSINESS = "aaaaaaaa-1111-4111-8111-111111111111";
const OTHER_BUSINESS = "bbbbbbbb-1111-4111-8111-111111111111";

const h = vi.hoisted(() => {
  const calls: Record<string, any[][]> = {};
  const track = (name: string, args: any[]) => {
    (calls[name] ??= []).push(args);
  };

  const state = {
    user: null as any,
    users: [] as any[],
    closeCalls: [] as any[],
  };

  return { calls, state, track };
});

vi.mock("../storage", () => ({
  storage: {
    getUserById: async (id: string) => h.state.users.find((user) => user.id === id),
    getUsersByBusinessIds: async (ids: string[]) =>
      h.state.users.filter((user) => ids.includes(user.businessId)),
    getUserBusinessAccess: async () => [{ businessId: BUSINESS }],
    deleteUserAccount: async (userId: string) => {
      h.track("deleteUserAccount", [userId]);
    },
    createAuthAuditLog: async (data: any) => {
      h.track("createAuthAuditLog", [data]);
      return data;
    },
    getBusiness: async (id: string) => ({ id, businessName: "Empresa SAC", ruc: "20123456789" }),
  },
}));

vi.mock("../services/tenantAccess", () => ({
  getManageableBusinessIds: async () => new Set([BUSINESS]),
}));

vi.mock("../services/authService", () => ({
  authService: { validateSessionUser: async () => h.state.user },
}));

vi.mock("../services/emailService", () => ({
  emailService: { sendPasswordChangeConfirmation: async () => undefined },
}));

vi.mock("../services/accountClosureService", () => ({
  closeBusiness: async (business: any) => {
    h.state.closeCalls.push(business);
    return { purged: true, complaintCount: 0, message: "cerrada" };
  },
}));

import { registerUsersRoutes } from "./users.routes";

const admin = (overrides: Record<string, unknown> = {}) => ({
  id: "admin-1",
  email: "admin@example.com",
  firstName: "Ada",
  lastName: "Admin",
  role: "admin",
  businessId: BUSINESS,
  isActive: true,
  isDemo: false,
  ...overrides,
});

const staff = (overrides: Record<string, unknown> = {}) => ({
  id: "staff-1",
  email: "staff@example.com",
  firstName: "Sam",
  lastName: "Staff",
  role: "user",
  businessId: BUSINESS,
  isActive: true,
  ...overrides,
});

let app: { url: string; close: () => Promise<void> };

beforeEach(async () => {
  for (const key of Object.keys(h.calls)) delete h.calls[key];
  h.state.closeCalls = [];
  h.state.user = admin();
  h.state.users = [admin(), staff()];

  app = await startTestApp(registerUsersRoutes);
});

describe("DELETE /api/users/:id", () => {
  it("deletes a team member of the caller's tenant and audits it", async () => {
    const res = await call(app.url, "/api/users/staff-1", { method: "DELETE", userId: "admin-1" });

    expect(res.status).toBe(200);
    expect(h.calls.deleteUserAccount[0]).toEqual(["staff-1"]);
    expect(h.calls.createAuthAuditLog[0][0].action).toBe("user_deleted");
    // The answer has to be honest about what was kept.
    expect(res.body.message).toContain("se conservan");
  });

  it("refuses to delete the caller's own account here", async () => {
    const res = await call(app.url, "/api/users/admin-1", { method: "DELETE", userId: "admin-1" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("own_account");
    expect(h.calls.deleteUserAccount).toBeUndefined();
  });

  it("answers 404 for a login of another tenant", async () => {
    h.state.users = [admin(), staff({ id: "stranger", businessId: OTHER_BUSINESS })];

    const res = await call(app.url, "/api/users/stranger", { method: "DELETE", userId: "admin-1" });

    expect(res.status).toBe(404);
    expect(h.calls.deleteUserAccount).toBeUndefined();
  });

  it("refuses to remove the last active administrator of the tenant", async () => {
    // The tenant has two logins: one staff and one admin. Removing that admin
    // would leave the company with nobody able to manage it.
    h.state.users = [staff({ id: "staff-1" }), admin({ id: "admin-2", email: "second@example.com" })];
    h.state.user = admin();

    const res = await call(app.url, "/api/users/admin-2", { method: "DELETE", userId: "admin-1" });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("last_administrator");
    expect(h.calls.deleteUserAccount).toBeUndefined();
  });

  it("requires an admin", async () => {
    h.state.user = staff();

    const res = await call(app.url, "/api/users/staff-1", { method: "DELETE", userId: "staff-1" });

    expect(res.status).toBe(403);
    expect(h.calls.deleteUserAccount).toBeUndefined();
  });
});

describe("DELETE /api/users/me", () => {
  it("refuses while the caller is the last administrator and the company is not closed", async () => {
    h.state.users = [admin()];

    const res = await call(app.url, "/api/users/me", { method: "DELETE", userId: "admin-1" });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("last_administrator");
    expect(res.body.businessName).toBe("Empresa SAC");
    expect(h.state.closeCalls).toHaveLength(0);
    expect(h.calls.deleteUserAccount).toBeUndefined();
  });

  it("closes the company and deletes the account when asked explicitly", async () => {
    h.state.users = [admin()];

    const res = await call(app.url, "/api/users/me?closeBusiness=true", {
      method: "DELETE",
      userId: "admin-1",
    });

    expect(res.status).toBe(200);
    expect(h.state.closeCalls).toHaveLength(1);
    expect(h.calls.deleteUserAccount[0]).toEqual(["admin-1"]);
    expect(h.calls.createAuthAuditLog[0][0].action).toBe("account_deleted");
  });

  it("leaves the company alone when somebody else administers it", async () => {
    h.state.users = [admin(), admin({ id: "admin-2", email: "second@example.com" })];

    const res = await call(app.url, "/api/users/me", { method: "DELETE", userId: "admin-1" });

    expect(res.status).toBe(200);
    expect(h.state.closeCalls).toHaveLength(0);
    expect(h.calls.deleteUserAccount[0]).toEqual(["admin-1"]);
  });
});
