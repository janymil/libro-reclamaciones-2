import { describe, it, expect, beforeEach, vi } from "vitest";

import { startTestApp, call } from "../test/routeTestHarness";

/**
 * Company registration (`POST /api/businesses`, the "Nueva Empresa" form).
 *
 * The regression pinned here: creating a company used to insert ONLY the
 * business (plus an access grant and a hard-coded "Casa Matriz" establishment).
 * A tenant registered this way had
 *
 *   * no `libro_configuration`, so it had no public Libro and no notification
 *     inbox,
 *   * no `books` row, so "Libros" answered "No hay libros creados" (the reported
 *     "no se creó el libro de reclamaciones"), and
 *   * `users.business_id` still NULL for a login that had no company yet, so
 *     "Mi Perfil -> Mi empresa" kept showing "Aún no ha registrado su empresa"
 *     while /empresas listed the company.
 *
 * It also pins the name rule: the establishment carries the name the user gave
 * the book ("Wong"), not the generic "Casa Matriz".
 */

const FREE_RUC = "20999999999";

const h = vi.hoisted(() => {
  const calls: Record<string, any[][]> = {};
  const track = (name: string, args: any[]) => {
    (calls[name] ??= []).push(args);
  };

  const state: any = {
    user: null,
    businessByRuc: undefined,
    slugOwners: {} as Record<string, unknown>,
    accessGrants: [] as string[],
    completeResult: undefined,
    completeError: undefined,
  };

  return { calls, state, track };
});

vi.mock("../storage", () => ({
  storage: {
    getBusinessByRuc: async (ruc: string) => {
      h.track("getBusinessByRuc", [ruc]);
      return h.state.businessByRuc;
    },
    getLibroConfigurationBySlug: async (slug: string) => {
      h.track("getLibroConfigurationBySlug", [slug]);
      return h.state.slugOwners[slug];
    },
    getUserBusinessAccess: async (userId: string) => {
      h.track("getUserBusinessAccess", [userId]);
      return h.state.accessGrants.map((businessId: string) => ({ businessId }));
    },
    completeOnboarding: async (input: any) => {
      h.track("completeOnboarding", [input]);
      if (h.state.completeError) {
        throw h.state.completeError;
      }
      return h.state.completeResult;
    },
  },
}));

vi.mock("../services/authService", () => ({
  authService: { validateSessionUser: async () => h.state.user },
}));

// Quotas and the trial length are resolved through the real storage in
// production; the plan rules themselves are not what this suite tests.
vi.mock("../services/subscriptionService", () => ({
  enforceQuota: async () => ({ allowed: true }),
  newBusinessTrialDefaults: () => ({
    subscriptionPlan: "gratis",
    subscriptionStatus: "trialing",
    trialEndsAt: new Date("2026-01-16T00:00:00.000Z"),
  }),
}));

vi.mock("../services/platformSettingsService", () => ({
  getTrialDays: async () => 15,
}));

vi.mock("../services/verificationService", () => ({
  allowsUnverifiedBusinesses: () => false,
}));

import { registerBusinessesRoutes } from "./businesses.routes";

const businessData = (ruc: string) => ({
  ruc,
  businessName: "CENCOSUD RETAIL PERU S.A.",
  commercialName: "Tienda Wong",
  phone: "999888777",
  address: "Av. Aviación 2405",
  distrito: "San Borja",
  provincia: "Lima",
  departamento: "Lima",
});

/** The payload the "Nueva Empresa" form sends: profile + the Libro it creates. */
const payload = (ruc: string, libro: Record<string, unknown> = {}) => ({
  ...businessData(ruc),
  libro: { libroName: "Wong", businessType: "local_fisico", ...libro },
});

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
  isEmailVerified: true,
  ...overrides,
});

let app: { url: string; close: () => Promise<void> };

beforeEach(async () => {
  for (const key of Object.keys(h.calls)) delete h.calls[key];

  h.state.user = accountUser();
  h.state.businessByRuc = undefined;
  h.state.slugOwners = {};
  h.state.accessGrants = [];
  h.state.completeError = undefined;
  h.state.completeResult = {
    business: { id: "b-new", businessName: "CENCOSUD RETAIL PERU S.A.", ruc: FREE_RUC },
    config: { id: "cfg", libroName: "Wong", urlSlug: "wong" },
    establishment: { id: "est", name: "Wong" },
    book: { id: "book", bookType: "reclamos" },
    createdBusiness: true,
  };

  app = await startTestApp(registerBusinessesRoutes);
});

describe("POST /api/businesses", () => {
  it("creates the company AND its Libro in one call", async () => {
    const response = await call(app.url, "/api/businesses", {
      method: "POST",
      userId: h.state.user.id,
      body: payload(FREE_RUC),
    });

    expect(response.status).toBe(201);

    const [input] = h.calls.completeOnboarding[0];
    // The tenant the user typed...
    expect(input.business.ruc).toBe(FREE_RUC);
    expect(input.business.businessName).toBe("CENCOSUD RETAIL PERU S.A.");
    // ...its Libro (the piece that used to be missing)...
    expect(input.libro.libroName).toBe("Wong");
    expect(input.libro.businessType).toBe("local_fisico");
    expect(input.libro.urlSlug).toBe("wong");
    // ...and the notifications inbox, which defaults to the caller's address.
    expect(input.libro.notificationEmail).toBe(h.state.user.email);
    // The "lugar" carries the name the user gave the book, not "Casa Matriz".
    expect(input.establishment.name).toBe("Wong");
    expect(input.establishment.identificationCode).toBe("SUC-001");
    // A first company also becomes the caller's active one.
    expect(input.makeActive).toBe(true);
    expect(input.existingBusinessId).toBeNull();
  });

  it("answers 201 with the Libro so the UI can show the public URL", async () => {
    const response = await call(app.url, "/api/businesses", {
      method: "POST",
      userId: h.state.user.id,
      body: payload(FREE_RUC),
    });

    expect(response.body.business.id).toBe("b-new");
    expect(response.body.libroConfig.urlSlug).toBe("wong");
    expect(response.body.book.bookType).toBe("reclamos");
  });

  it("does not steal the active company of a login that already has one", async () => {
    h.state.user = accountUser({ businessId: "b-existing", onboardingCompleted: true });

    const response = await call(app.url, "/api/businesses", {
      method: "POST",
      userId: h.state.user.id,
      body: payload(FREE_RUC),
    });

    expect(response.status).toBe(201);
    // An additional RUC only joins the switcher: Mi Perfil keeps pointing at the
    // company the customer is actually working on.
    expect(h.calls.completeOnboarding[0][0].makeActive).toBe(false);
  });

  it("derives a free public URL when the derived one is taken", async () => {
    h.state.slugOwners = { wong: { id: "cfg-other", businessId: "b-other" } };

    const response = await call(app.url, "/api/businesses", {
      method: "POST",
      userId: h.state.user.id,
      body: payload(FREE_RUC),
    });

    expect(response.status).toBe(201);
    expect(h.calls.completeOnboarding[0][0].libro.urlSlug).toBe("wong-2");
  });

  it("refuses a public URL explicitly requested by someone else", async () => {
    h.state.slugOwners = { "mi-url": { id: "cfg-other", businessId: "b-other" } };

    const response = await call(app.url, "/api/businesses", {
      method: "POST",
      userId: h.state.user.id,
      body: payload(FREE_RUC, { urlSlug: "mi-url" }),
    });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("slug_taken");
    expect(h.calls.completeOnboarding).toBeUndefined();
  });

  it("keeps the public URL the form asked for when it is free", async () => {
    const response = await call(app.url, "/api/businesses", {
      method: "POST",
      userId: h.state.user.id,
      body: payload(FREE_RUC, { urlSlug: "wong-peru" }),
    });

    expect(response.status).toBe(201);
    expect(h.calls.completeOnboarding[0][0].libro.urlSlug).toBe("wong-peru");
  });

  it("never trusts plan fields sent by the client", async () => {
    const response = await call(app.url, "/api/businesses", {
      method: "POST",
      userId: h.state.user.id,
      body: {
        ...payload(FREE_RUC),
        subscriptionPlan: "corporativo",
        subscriptionStatus: "active",
        isActive: false,
      },
    });

    expect(response.status).toBe(201);
    const [input] = h.calls.completeOnboarding[0];
    expect(input.business.subscriptionPlan).toBe("gratis");
    expect(input.business.subscriptionStatus).toBe("trialing");
    expect(input.business.isActive).toBeUndefined();
  });

  it("requires the name of the book", async () => {
    const response = await call(app.url, "/api/businesses", {
      method: "POST",
      userId: h.state.user.id,
      body: payload(FREE_RUC, { libroName: "" }),
    });

    expect(response.status).toBe(400);
    expect(h.calls.completeOnboarding).toBeUndefined();
  });

  it("refuses two companies with the same RUC (no dead end)", async () => {
    h.state.businessByRuc = { id: "b-other", businessName: "Otra Empresa SAC" };

    const response = await call(app.url, "/api/businesses", {
      method: "POST",
      userId: h.state.user.id,
      body: payload(FREE_RUC),
    });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("ruc_already_registered");
    expect(response.body.businessName).toBe("Otra Empresa SAC");
    expect(h.calls.completeOnboarding).toBeUndefined();
  });

  it("does not create a company from an unconfirmed mailbox", async () => {
    h.state.user = accountUser({ isEmailVerified: false });

    const response = await call(app.url, "/api/businesses", {
      method: "POST",
      userId: h.state.user.id,
      body: payload(FREE_RUC),
    });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("email_not_verified");
    expect(h.calls.completeOnboarding).toBeUndefined();
  });

  it("reports a rolled-back write as a failure, not as success", async () => {
    h.state.completeError = new Error("connection reset");

    const response = await call(app.url, "/api/businesses", {
      method: "POST",
      userId: h.state.user.id,
      body: payload(FREE_RUC),
    });

    expect(response.status).toBe(500);
  });

  it("maps a unique-violation race on the public URL to slug_taken", async () => {
    h.state.completeError = Object.assign(new Error("duplicate key"), { code: "23505" });

    const response = await call(app.url, "/api/businesses", {
      method: "POST",
      userId: h.state.user.id,
      body: payload(FREE_RUC),
    });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("slug_taken");
  });
});
