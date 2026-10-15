import { describe, it, expect, beforeEach, vi } from "vitest";

import { startTestApp, call } from "../test/routeTestHarness";

/**
 * Onboarding completion (`POST /api/auth/complete-onboarding`).
 *
 * Three properties are pinned here, all of them regressions that used to strand
 * a real customer:
 *
 *   1. the write is ALL-OR-NOTHING and reported as such (a failure must leave the
 *      account exactly as it was, not "onboarded" with no libro),
 *   2. a partially completed onboarding can be RESUMED (a RUC this login already
 *      created must not collide with its own unique constraint),
 *   3. a RUC owned by ANOTHER account is a 409 that names the way forward
 *      (access request), not a dead end.
 */

const OWNED_BY_OTHER = "20111111111";
const OWNED_BY_SELF = "20222222222";
const FREE_RUC = "20999999999";

const h = vi.hoisted(() => {
  const calls: Record<string, any[][]> = {};
  const track = (name: string, args: any[]) => {
    (calls[name] ??= []).push(args);
  };

  const state: any = {
    user: null,
    slugOwner: undefined,
    businessByRuc: undefined,
    accessGrants: [] as string[],
    completeResult: undefined,
    completeError: undefined,
  };

  return { calls, state, track };
});

vi.mock("../storage", () => ({
  storage: {
    getLibroConfigurationBySlug: async (slug: string) => {
      h.track("getLibroConfigurationBySlug", [slug]);
      return h.state.slugOwner;
    },
    getBusinessByRuc: async (ruc: string) => {
      h.track("getBusinessByRuc", [ruc]);
      return h.state.businessByRuc;
    },
    getUserBusinessAccess: async (userId: string) => {
      h.track("getUserBusinessAccess", [userId]);
      return h.state.accessGrants.map((businessId) => ({ businessId }));
    },
    completeOnboarding: async (input: any) => {
      h.track("completeOnboarding", [input]);
      if (h.state.completeError) {
        throw h.state.completeError;
      }
      return h.state.completeResult;
    },
    createAuthAuditLog: async (data: any) => data,
  },
}));

vi.mock("../services/authService", () => ({
  authService: { validateSessionUser: async () => h.state.user },
}));

import { registerAuthRoutes } from "./auth.routes";

const businessData = (ruc: string) => ({
  ruc,
  businessName: "Empresa SAC",
  commercialName: "Empresa",
  phone: "999888777",
  address: "Av. Siempre Viva 123",
  distrito: "Lima",
  provincia: "Lima",
  departamento: "Lima",
});

const libroData = {
  libroName: "Libro de Empresa",
  urlSlug: "empresa-sac",
  businessType: "local_fisico",
  notificationEmail: "reclamos@example.com",
};

const payload = (ruc: string) => ({ businessData: businessData(ruc), libroData });

const accountUser = (overrides: Record<string, unknown> = {}) => ({
  id: "aaaaaaaa-1111-4111-8111-111111111111",
  email: "nuevo@example.com",
  firstName: "Nuevo",
  lastName: "Usuario",
  role: "admin",
  businessId: null,
  onboardingStep: 1,
  onboardingCompleted: false,
  isActive: true,
  isDemo: false,
  ...overrides,
});

let app: { url: string; close: () => Promise<void> };

beforeEach(async () => {
  for (const key of Object.keys(h.calls)) delete h.calls[key];

  h.state.user = accountUser();
  h.state.slugOwner = undefined;
  h.state.businessByRuc = undefined;
  h.state.accessGrants = [];
  h.state.completeError = undefined;
  h.state.completeResult = {
    business: { id: "b-new", businessName: "Empresa SAC" },
    config: { id: "cfg", urlSlug: libroData.urlSlug },
    establishment: { id: "est", name: "Casa Matriz" },
    createdBusiness: true,
  };

  app = await startTestApp(registerAuthRoutes);
});
describe("POST /api/auth/complete-onboarding", () => {
  it("creates a brand-new tenant for a free RUC", async () => {
    const response = await call(app.url, "/api/auth/complete-onboarding", {
      method: "POST",
      userId: h.state.user.id,
      body: payload(FREE_RUC),
    });

    expect(response.status).toBe(200);
    expect(response.body.resumed).toBe(false);
    expect(response.body.redirectTo).toBe("/panel");

    const input = h.calls.completeOnboarding[0][0];
    expect(input.userId).toBe(h.state.user.id);
    // Nothing pre-existing: the transaction creates the tenant itself.
    expect(input.existingBusinessId).toBeNull();
    expect(input.refreshBusinessProfile).toBe(false);
    // The establishment is derived from the sales channel, inside the same write.
    expect(input.establishment.name).toBe("Casa Matriz");
    // The plan is server-assigned, never taken from the payload.
    expect(input.business.subscriptionPlan).toBe("gratis");
  });

  it("resumes the tenant a previous failed attempt already created", async () => {
    // A half-finished attempt: the business exists and carries our access grant,
    // but the user was never flagged as onboarded.
    h.state.businessByRuc = { id: "b-mine", businessName: "Empresa SAC" };
    h.state.accessGrants = ["b-mine"];
    h.state.completeResult = { ...h.state.completeResult, createdBusiness: false };

    const response = await call(app.url, "/api/auth/complete-onboarding", {
      method: "POST",
      userId: h.state.user.id,
      body: payload(OWNED_BY_SELF),
    });

    expect(response.status).toBe(200);
    expect(response.body.resumed).toBe(true);

    const input = h.calls.completeOnboarding[0][0];
    expect(input.existingBusinessId).toBe("b-mine");
    // The wizard's values win for the profile of the tenant being finished.
    expect(input.refreshBusinessProfile).toBe(true);
  });

  it("answers 409 naming the access-request path when the RUC is someone else's", async () => {
    h.state.businessByRuc = { id: "b-other", businessName: "Otra Empresa SAC" };

    const response = await call(app.url, "/api/auth/complete-onboarding", {
      method: "POST",
      userId: h.state.user.id,
      body: payload(OWNED_BY_OTHER),
    });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("ruc_already_registered");
    expect(response.body.businessName).toBe("Otra Empresa SAC");
    // Crucially: nothing was written for the stranger's RUC.
    expect(h.calls.completeOnboarding).toBeUndefined();
  });

  it("rejects a public URL another company already owns", async () => {
    h.state.slugOwner = { businessId: "b-other" };

    const response = await call(app.url, "/api/auth/complete-onboarding", {
      method: "POST",
      userId: h.state.user.id,
      body: payload(FREE_RUC),
    });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("slug_taken");
    expect(h.calls.completeOnboarding).toBeUndefined();
  });

  it("lets the caller keep the URL of its own half-finished business", async () => {
    const user = accountUser({ businessId: "b-mine" });
    h.state.user = user;
    h.state.slugOwner = { businessId: "b-mine" };

    const response = await call(app.url, "/api/auth/complete-onboarding", {
      method: "POST",
      userId: user.id,
      body: payload(FREE_RUC),
    });

    expect(response.status).toBe(200);
  });

  it("keeps the account untouched when the transaction fails", async () => {
    h.state.completeError = new Error("connection reset");

    const response = await call(app.url, "/api/auth/complete-onboarding", {
      method: "POST",
      userId: h.state.user.id,
      body: payload(FREE_RUC),
    });

    expect(response.status).toBe(500);
    expect(response.body.code).toBe("onboarding_failed");
    // The message must tell the truth: nothing was saved, so retrying is safe.
    expect(response.body.message).toContain("no se guardaron");
  });

  it("refuses a second run for an account that is already configured", async () => {
    h.state.user = accountUser({ onboardingCompleted: true, businessId: "b-mine" });

    const response = await call(app.url, "/api/auth/complete-onboarding", {
      method: "POST",
      userId: h.state.user.id,
      body: payload(FREE_RUC),
    });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("already_onboarded");
    expect(response.body.redirectTo).toBe("/panel");
    expect(h.calls.completeOnboarding).toBeUndefined();
  });

  it("never trusts plan fields sent by the client", async () => {
    const response = await call(app.url, "/api/auth/complete-onboarding", {
      method: "POST",
      userId: h.state.user.id,
      body: {
        businessData: { ...businessData(FREE_RUC), subscriptionPlan: "corporativo", isActive: false },
        libroData,
      },
    });

    expect(response.status).toBe(200);
    const input = h.calls.completeOnboarding[0][0];
    expect(input.business.subscriptionPlan).toBe("gratis");
    expect(input.business.subscriptionStatus).toBe("trialing");
    expect(input.business.isActive).toBeUndefined();
  });
});

