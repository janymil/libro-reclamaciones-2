import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { startTestApp, call } from "../test/routeTestHarness";

/**
 * The NO-CHARGE plan change must be impossible by default.
 *
 * Before payments existed, POST /api/subscription switched the plan and
 * collected nothing. Now that the money path exists, that endpoint would be a
 * free upgrade for any logged-in admin, so it is gated behind
 * PAYMENTS_ALLOW_FREE_PLAN_CHANGE (the manual-invoicing escape hatch).
 */

const h = vi.hoisted(() => {
  // Declared inside the hoisted factory: vi.hoisted runs before any module-level
  // const, so it cannot close over one.
  const A = "11111111-1111-4111-8111-111111111111";

  const calls: Record<string, any[][]> = {};
  const track = (name: string, args: any[]) => {
    (calls[name] ??= []).push(args);
  };

  const business = {
    id: A,
    ruc: "20111111111",
    businessName: "Tenant A",
    address: "Av. Siempre Viva 123",
    distrito: "Lima",
    provincia: "Lima",
    departamento: "Lima",
    isActive: true,
    subscriptionPlan: "esencial",
    subscriptionStatus: "active",
    trialEndsAt: null,
    planPeriod: "monthly",
    currentPeriodEnd: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const users: Record<string, any> = {
    admin: { id: "aaaaaaaa-1111-4111-8111-111111111111", email: "admin@example.com", firstName: "Admin", lastName: "A", role: "admin", businessId: A, isActive: true, isDemo: false },
    staff: { id: "aaaaaaaa-2222-4222-8222-222222222222", email: "staff@example.com", firstName: "Staff", lastName: "A", role: "user", businessId: A, isActive: true, isDemo: false },
  };

  const storageMock: any = {
    getBusiness: async (id: string) => {
      track("getBusiness", [id]);
      return id === A ? business : undefined;
    },
    updateBusiness: async (id: string, updates: any) => {
      track("updateBusiness", [id, updates]);
      Object.assign(business, updates);
      return business;
    },
    countComplaintsSince: async () => 0,
    getAllUsers: async () => Object.values(users),
    getEstablishmentsByBusiness: async () => [],
    getUserBusinessAccess: async () => [],
  };

  const authMock: any = {
    validateSessionUser: async (userId: string) =>
      Object.values(users).find((user) => user.id === userId) ?? null,
    logoutUser: async () => {},
  };

  return { calls, users, storageMock, authMock };
});

vi.mock("../storage", () => ({ storage: h.storageMock }));
vi.mock("../services/authService", () => ({ authService: h.authMock }));

import { registerSubscriptionRoutes } from "./subscription.routes";

let app: { url: string; close: () => Promise<void> };

beforeEach(async () => {
  for (const key of Object.keys(h.calls)) delete h.calls[key];
  delete process.env.PAYMENTS_ALLOW_FREE_PLAN_CHANGE;

  app = await startTestApp((expressApp) => {
    registerSubscriptionRoutes(expressApp);
  });
});

afterEach(async () => {
  await app.close();
  delete process.env.PAYMENTS_ALLOW_FREE_PLAN_CHANGE;
});

describe("POST /api/subscription", () => {
  it("refuses to change the plan without a payment by default", async () => {
    const res = await call(app.url, "/api/subscription", {
      method: "POST",
      userId: h.users.admin.id,
      body: { plan: "corporativo", period: "annual" },
    });

    expect(res.status).toBe(402);
    expect(res.body.code).toBe("payment_required");
    // Nothing was even loaded, let alone written.
    expect(h.calls.getBusiness).toBeUndefined();
    expect(h.calls.updateBusiness).toBeUndefined();
  });

  it("still works when manual invoicing is explicitly enabled", async () => {
    process.env.PAYMENTS_ALLOW_FREE_PLAN_CHANGE = "true";

    const res = await call(app.url, "/api/subscription", {
      method: "POST",
      userId: h.users.admin.id,
      body: { plan: "profesional", period: "monthly" },
    });

    expect(res.status).toBe(200);
    expect(h.calls.updateBusiness[0][1].plan).toBe("profesional");
  });

  it("stays admin-only even with the escape hatch open", async () => {
    process.env.PAYMENTS_ALLOW_FREE_PLAN_CHANGE = "true";

    const res = await call(app.url, "/api/subscription", {
      method: "POST",
      userId: h.users.staff.id,
      body: { plan: "corporativo", period: "annual" },
    });

    expect(res.status).toBe(403);
    expect(h.calls.updateBusiness).toBeUndefined();
  });
});
