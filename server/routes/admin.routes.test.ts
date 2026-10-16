import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { startTestApp, call } from "../test/routeTestHarness";

/**
 * ADMIN PANEL SECURITY SUITE.
 *
 * The panel is cross-tenant by definition, so the tests that matter most are the
 * ones proving a CUSTOMER can never reach it: every endpoint must answer 403 to a
 * tenant `admin` (its role means "owns a business", not "runs the platform"), and
 * only the durable flag or the bootstrap allow-list may open it.
 *
 * Storage and the auth service are mocked; the REAL `requireAuth`,
 * `requireNonDemo` and `requirePlatformAdmin` middleware and the REAL handlers run.
 */

const A = "aaaa1111-1111-4111-8111-111111111111";
const B = "bbbb1111-1111-4111-8111-111111111111";

const h = vi.hoisted(() => {
  const calls: Record<string, any[][]> = {};
  const track = (name: string, args: any[]) => {
    (calls[name] ??= []).push(args);
  };
  const state: any = {
    usersById: {},
    businesses: [],
    users: [],
    payments: [],
    /** Configuración -> Datos de pago (the platform's own Yape / bank accounts). */
    paymentSettings: undefined as any,
    /** Configuración -> Operación / Identidad (alerts, identity, flags). */
    platformSettings: undefined as any,
    /** Planes -> price overrides, keyed by plan id. */
    planPricing: {} as Record<string, any>,
    discountCodes: [] as any[],
    audit: [] as any[],
  };
  return { calls, track, state };
});

vi.mock("../storage", () => ({
  storage: {
    getAllBusinesses: async () => h.state.businesses,
    getAllUsers: async () => h.state.users,
    listPlatformAdmins: async () => h.state.users.filter((user: any) => user.isPlatformAdmin),
    listAllPayments: async () => h.state.payments,
    listPendingManualPayments: async () => [],
    listAllSubscriptions: async () => [],
    getUsersByBusinessIds: async () => h.state.users.filter((user: any) => user.businessId === A),
    getPaymentsByBusiness: async () =>
      h.state.payments.filter((payment: any) => payment.businessId === A),
    getSubscriptionsByBusiness: async () => [],
    getEstablishmentsByBusiness: async () => [],
    getComplaintsByBusiness: async () => [],
    getApiKeysByBusiness: async () => [],
    getBusinessById: async (id: string) => h.state.businesses.find((b: any) => b.id === id),
    updateBusiness: async (id: string, updates: any) => {
      h.track("updateBusiness", [id, updates]);
      return { ...h.state.businesses[0], ...updates };
    },
    purgeBusiness: async (id: string) => {
      h.track("purgeBusiness", [id]);
    },
    getUserByEmail: async (email: string) =>
      h.state.users.find((user: any) => user.email === email),
    getUser: async (id: string) => h.state.users.find((user: any) => user.id === id),
    setPlatformAdmin: async (id: string, value: boolean) => {
      h.track("setPlatformAdmin", [id, value]);
      const user = h.state.users.find((u: any) => u.id === id);
      if (user) user.isPlatformAdmin = value;
      return user;
    },
    getPlatformPaymentSettings: async () => h.state.paymentSettings,
    savePlatformPaymentSettings: async (data: any, updatedByUserId?: string | null) => {
      h.track("savePlatformPaymentSettings", [data, updatedByUserId]);
      h.state.paymentSettings = {
        id: 1,
        ...data,
        updatedByUserId: updatedByUserId ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return h.state.paymentSettings;
    },
    getPlatformSettings: async () => h.state.platformSettings,
    savePlatformSettings: async (data: any, updatedByUserId?: string | null) => {
      h.track("savePlatformSettings", [data, updatedByUserId]);
      h.state.platformSettings = {
        id: 1,
        alertEmail: null,
        legalName: null,
        commercialName: null,
        ruc: null,
        fiscalAddress: null,
        contactEmail: null,
        contactPhone: null,
        website: null,
        trialDays: null,
        allowFreePlanChange: false,
        ...(h.state.platformSettings ?? {}),
        ...data,
        updatedByUserId: updatedByUserId ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return h.state.platformSettings;
    },
    listPlanPricing: async () => Object.values(h.state.planPricing),
    savePlanPricing: async (input: any) => {
      h.track("savePlanPricing", [input]);
      const row = { ...input, createdAt: new Date(), updatedAt: new Date() };
      h.state.planPricing[input.planId] = row;
      return row;
    },
    resetPlanPricing: async (planId: string) => {
      h.track("resetPlanPricing", [planId]);
      const existed = Boolean(h.state.planPricing[planId]);
      delete h.state.planPricing[planId];
      return existed;
    },
    listDiscountCodes: async () => h.state.discountCodes,
    getDiscountCode: async (id: string) => h.state.discountCodes.find((row: any) => row.id === id),
    getDiscountCodeByCode: async (code: string) =>
      h.state.discountCodes.find((row: any) => row.code === code),
    createDiscountCode: async (data: any) => {
      h.track("createDiscountCode", [data]);
      const row = {
        id: `code-${h.state.discountCodes.length + 1}`,
        description: null,
        planIds: [],
        maxRedemptions: null,
        redemptionCount: 0,
        startsAt: null,
        expiresAt: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      h.state.discountCodes.push(row);
      return row;
    },
    updateDiscountCode: async (id: string, updates: any) => {
      h.track("updateDiscountCode", [id, updates]);
      const row = h.state.discountCodes.find((code: any) => code.id === id);
      if (!row) return undefined;
      Object.assign(row, updates);
      return row;
    },
    deleteDiscountCode: async (id: string) => {
      h.track("deleteDiscountCode", [id]);
      const row = h.state.discountCodes.find((code: any) => code.id === id);
      if (!row || row.redemptionCount > 0) return false;
      h.state.discountCodes = h.state.discountCodes.filter((code: any) => code.id !== id);
      return true;
    },
    redeemDiscountCode: async (id: string) => {
      const row = h.state.discountCodes.find((code: any) => code.id === id);
      if (!row) return false;
      if (row.maxRedemptions !== null && row.redemptionCount >= row.maxRedemptions) return false;
      row.redemptionCount += 1;
      return true;
    },
    recordPlatformConfigChange: async (data: any) => {
      h.track("recordPlatformConfigChange", [data]);
      h.state.audit.push({ id: `audit-${h.state.audit.length + 1}`, createdAt: new Date(), ...data });
    },
    listPlatformConfigChanges: async (limit = 50) => h.state.audit.slice(0, limit),
  },
}));

vi.mock("../services/authService", () => ({
  authService: { validateSessionUser: async (userId: string) => h.state.usersById[userId] ?? null },
}));

vi.mock("../services/emailService", () => ({
  emailService: {
    sendPlatformAlert: async () => {},
    sendPaymentReceipt: async () => {},
    testConnection: async () => h.state.smtpReachable !== false,
    sendTestEmail: async (email: string, firstName?: string) => {
      h.track("sendTestEmail", [email, firstName]);
    },
  },
}));

import { registerAdminRoutes } from "./admin.routes";
import { clearPlanPricingCache } from "../services/pricingService";
import { clearPlatformSettingsCache } from "../services/platformSettingsService";

const baseUser = {
  firstName: "Test",
  lastName: "User",
  role: "admin",
  isActive: true,
  isDemo: false,
  isPlatformAdmin: false,
};

const users = {
  /** A customer: `admin` of their OWN business - the role must not open the panel. */
  customer: { ...baseUser, id: "cccc1111-1111-4111-8111-111111111111", email: "cliente@example.com", businessId: A },
  /** Platform staff through the durable flag. */
  operator: { ...baseUser, id: "dddd1111-1111-4111-8111-111111111111", email: "ops@librodigital.pe", businessId: null, isPlatformAdmin: true },
  /** No flag, but listed in PLATFORM_ADMIN_EMAILS: the bootstrap door. */
  bootstrap: { ...baseUser, id: "eeee1111-1111-4111-8111-111111111111", email: "owner@librodigital.pe", businessId: null },
  demo: { ...baseUser, id: "ffff1111-1111-4111-8111-111111111111", email: "demo@librodigital.pe", businessId: B, isDemo: true },
};

let app: { url: string; close: () => Promise<void> };

beforeEach(async () => {
  for (const key of Object.keys(h.calls)) delete h.calls[key];

  h.state.usersById = Object.fromEntries(Object.values(users).map((user) => [user.id, user]));
  h.state.users = Object.values(users).map((user) => ({ ...user }));
  h.state.businesses = [
    {
      id: A,
      ruc: "20111111111",
      businessName: "Tenant A",
      subscriptionPlan: "gratis",
      subscriptionStatus: "trialing",
      planPeriod: "monthly",
      currentPeriodEnd: null,
      trialEndsAt: null,
      isActive: true,
      establishmentCount: 1,
      userCount: 1,
    },
  ];
  h.state.payments = [
    {
      id: "pay-1",
      businessId: A,
      reference: "LD-PAGADA",
      provider: "manual",
      method: "transferencia",
      planId: "esencial",
      period: "monthly",
      amountCents: 1500,
      currency: "PEN",
      status: "paid",
      paidAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      failureReason: null,
      redirectUrl: null,
      raw: null,
    },
  ];

  process.env.PLATFORM_ADMIN_EMAILS = "owner@librodigital.pe";
  h.state.paymentSettings = undefined;
  delete process.env.PAYMENTS_MANUAL_INSTRUCTIONS;
  h.state.platformSettings = undefined;
  h.state.planPricing = {};
  h.state.discountCodes = [];
  h.state.audit = [];
  h.state.smtpReachable = true;
  delete process.env.PAYMENTS_ALERT_EMAIL;
  delete process.env.PAYMENTS_ALLOW_FREE_PLAN_CHANGE;
  // The settings services cache an absent row for 30s; without this every test after
  // the first would read the previous one's (empty) snapshot.
  clearPlatformSettingsCache();
  clearPlanPricingCache();

  app = await startTestApp((expressApp) => {
    registerAdminRoutes(expressApp);
  });
});

afterEach(async () => {
  await app.close();
  delete process.env.PLATFORM_ADMIN_EMAILS;
});

const PANEL_PATHS = [
  "/api/admin/overview",
  "/api/admin/customers",
  "/api/admin/payments",
  "/api/admin/operators",
];

describe("the panel is operator-only", () => {
  it("answers 403 to a customer on every endpoint", async () => {
    for (const path of PANEL_PATHS) {
      const res = await call(app.url, path, { userId: users.customer.id });
      expect(res.status, `${path} must be closed to a customer`).toBe(403);
    }
  });

  it("answers 401 to an anonymous caller", async () => {
    const res = await call(app.url, "/api/admin/customers", { userId: null });
    expect(res.status).toBe(401);
  });

  it("lets a flagged operator read the overview", async () => {
    const res = await call(app.url, "/api/admin/overview", { userId: users.operator.id });

    expect(res.status).toBe(200);
    expect(res.body.customers).toBe(1);
    expect(res.body.operators).toBe(1);
    expect(res.body.collectedTotalCents).toBe(1500);
  });

  it("accepts the bootstrap allow-list when the flag is not set yet", async () => {
    const res = await call(app.url, "/api/admin/customers", { userId: users.bootstrap.id });

    expect(res.status).toBe(200);
    expect(res.body[0].business.ruc).toBe("20111111111");
    expect(res.body[0].paidCents).toBe(1500);
  });
});

describe("PATCH /api/admin/customers/:id - assigning a subscription", () => {
  it("writes the plan, the period and the renewal date onto the business", async () => {
    const res = await call(app.url, `/api/admin/customers/${A}`, {
      method: "PATCH",
      userId: users.operator.id,
      body: {
        subscriptionPlan: "profesional",
        planPeriod: "annual",
        subscriptionStatus: "active",
        currentPeriodEnd: "2027-01-15T00:00:00.000Z",
      },
    });

    expect(res.status).toBe(200);
    const [businessId, updates] = h.calls.updateBusiness[0];
    expect(businessId).toBe(A);
    expect(updates.subscriptionPlan).toBe("profesional");
    expect(updates.planPeriod).toBe("annual");
    expect(updates.subscriptionStatus).toBe("active");
    expect(new Date(updates.currentPeriodEnd).toISOString()).toBe("2027-01-15T00:00:00.000Z");
  });

  it("refuses an unknown plan and an unknown field", async () => {
    const badPlan = await call(app.url, `/api/admin/customers/${A}`, {
      method: "PATCH",
      userId: users.operator.id,
      body: { subscriptionPlan: "plan-inventado" },
    });
    expect(badPlan.status).toBe(400);

    const badField = await call(app.url, `/api/admin/customers/${A}`, {
      method: "PATCH",
      userId: users.operator.id,
      body: { role: "superadmin" },
    });
    expect(badField.status).toBe(400);
    expect(h.calls.updateBusiness).toBeUndefined();
  });

  it("is refused for a customer", async () => {
    const res = await call(app.url, `/api/admin/customers/${A}`, {
      method: "PATCH",
      userId: users.customer.id,
      body: { subscriptionPlan: "corporativo" },
    });

    expect(res.status).toBe(403);
    expect(h.calls.updateBusiness).toBeUndefined();
  });
});

describe("DELETE /api/admin/customers/:id - wiping a tenant", () => {
  it("requires the exact RUC before destroying anything", async () => {
    const missing = await call(app.url, `/api/admin/customers/${A}`, {
      method: "DELETE",
      userId: users.operator.id,
      body: {},
    });
    expect(missing.status).toBe(400);

    const wrong = await call(app.url, `/api/admin/customers/${A}`, {
      method: "DELETE",
      userId: users.operator.id,
      body: { confirmRuc: "20999999999" },
    });
    expect(wrong.status).toBe(400);
    expect(h.calls.purgeBusiness).toBeUndefined();

    const ok = await call(app.url, `/api/admin/customers/${A}`, {
      method: "DELETE",
      userId: users.operator.id,
      body: { confirmRuc: "20111111111" },
    });
    expect(ok.status).toBe(200);
    expect(h.calls.purgeBusiness[0][0]).toBe(A);
  });

  it("is refused for a customer", async () => {
    const res = await call(app.url, `/api/admin/customers/${A}`, {
      method: "DELETE",
      userId: users.customer.id,
      body: { confirmRuc: "20111111111" },
    });

    expect(res.status).toBe(403);
    expect(h.calls.purgeBusiness).toBeUndefined();
  });
});

describe("the console's own tools", () => {
  it("gives an operator a customer's full record", async () => {
    const res = await call(app.url, `/api/admin/customers/${A}`, { userId: users.operator.id });

    expect(res.status).toBe(200);
    expect(res.body.business.ruc).toBe("20111111111");
    expect(res.body.logins.length).toBeGreaterThan(0);
    expect(res.body.complaints.total).toBe(0);
    expect(res.body.apiKeys.total).toBe(0);
  });

  it("is closed to a customer on every console tool", async () => {
    for (const path of [
      `/api/admin/customers/${A}`,
      "/api/admin/subscriptions",
      "/api/admin/platform",
      "/api/admin/payment-settings",
      "/api/admin/platform-settings",
      "/api/admin/plan-pricing",
      "/api/admin/discount-codes",
      "/api/admin/config-history",
    ]) {
      const res = await call(app.url, path, { userId: users.customer.id });
      expect(res.status, `${path} must be closed to a customer`).toBe(403);
    }
  });

  it("keeps every console write closed to a customer too", async () => {
    for (const request of [
      { path: "/api/admin/platform-settings", method: "PUT", body: { ruc: "20601234567" } },
      { path: "/api/admin/plan-pricing", method: "PUT", body: { prices: [], trialDays: 30 } },
      { path: "/api/admin/discount-codes", method: "POST", body: { code: "X", kind: "percent", value: 10 } },
      { path: "/api/admin/discount-codes/code-1", method: "DELETE" },
      { path: "/api/admin/email-test", method: "POST" },
    ]) {
      const res = await call(app.url, request.path, {
        method: request.method,
        userId: users.customer.id,
        body: request.body,
      });
      expect(res.status, `${request.method} ${request.path} must be closed`).toBe(403);
    }

    expect(h.calls.savePlatformSettings).toBeUndefined();
    expect(h.calls.savePlanPricing).toBeUndefined();
    expect(h.calls.createDiscountCode).toBeUndefined();
    expect(h.calls.sendTestEmail).toBeUndefined();
  });

  it("refuses a customer trying to change where the money is sent", async () => {
    const res = await call(app.url, "/api/admin/payment-settings", {
      method: "PUT",
      userId: users.customer.id,
      body: { yapeNumber: "999 111 222" },
    });

    expect(res.status).toBe(403);
    expect(h.calls.savePlatformPaymentSettings).toBeUndefined();
  });

  it("summarises the platform for an operator", async () => {
    const res = await call(app.url, "/api/admin/platform", { userId: users.operator.id });

    expect(res.status).toBe(200);
    expect(res.body.checks.length).toBeGreaterThan(0);
    expect(res.body.totals.customers).toBe(1);
    expect(res.body.adminPath).toBeTruthy();
  });

  it("never echoes the Mercado Pago token, only its prefix", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-9999-super-secret";
    try {
      const res = await call(app.url, "/api/admin/platform", { userId: users.operator.id });

      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain("super-secret");
      const credential = res.body.checks.find((check: any) => check.id === "mp_credentials");
      expect(credential.detail).toBe("APP_USR-…");
    } finally {
      delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    }
  });
});

describe("operator management", () => {
  it("never promotes the public demo login", async () => {
    const res = await call(app.url, "/api/admin/operators", {
      method: "POST",
      userId: users.operator.id,
      body: { email: users.demo.email },
    });

    expect(res.status).toBe(403);
    expect(h.calls.setPlatformAdmin).toBeUndefined();
  });

  it("promotes an existing login by email", async () => {
    const res = await call(app.url, "/api/admin/operators", {
      method: "POST",
      userId: users.operator.id,
      body: { email: users.bootstrap.email },
    });

    expect(res.status).toBe(200);
    expect(h.calls.setPlatformAdmin[0]).toEqual([users.bootstrap.id, true]);
  });

  it("refuses to revoke the last operator (nobody could manage customers)", async () => {
    const res = await call(app.url, `/api/admin/operators/${users.operator.id}`, {
      method: "DELETE",
      userId: users.operator.id,
    });

    expect(res.status).toBe(409);
    expect(h.calls.setPlatformAdmin).toBeUndefined();
  });

  it("revokes a second operator", async () => {
    h.state.users = h.state.users.map((user: any) =>
      user.id === users.bootstrap.id ? { ...user, isPlatformAdmin: true } : user,
    );

    const res = await call(app.url, `/api/admin/operators/${users.bootstrap.id}`, {
      method: "DELETE",
      userId: users.operator.id,
    });

    expect(res.status).toBe(200);
    expect(h.calls.setPlatformAdmin[0]).toEqual([users.bootstrap.id, false]);
  });
});

/**
 * Configuración → Datos de pago: the platform's own Yape number and bank accounts.
 *
 * These are the details a paying customer is told to send money to, so the API has
 * to be closed to tenants (tested above) and has to store exactly what it was
 * given - a truncated number or a half-saved account is a payment that arrives
 * somewhere nobody is looking.
 */
describe("the payment settings (Configuración)", () => {
  const details = {
    holderName: "LibroDigital S.A.C.",
    holderRuc: "20601234567",
    yapeNumber: "999 888 777",
    plinNumber: "",
    voucherEmail: "Pagos@LibroDigital.pe",
    voucherWhatsapp: null,
    bankAccounts: [
      {
        bank: "BCP",
        accountType: "corriente",
        accountNumber: "193-1234567-0-12",
        cci: "002-193-001234567012-15",
        currency: "PEN",
      },
    ],
    notes: "  Atendemos de 9am a 6pm.  ",
  };

  it("starts empty, so the screen can say nothing is configured yet", async () => {
    const res = await call(app.url, "/api/admin/payment-settings", {
      userId: users.operator.id,
    });

    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(false);
    expect(res.body.hasDetails).toBe(false);
    expect(res.body.envFallbackConfigured).toBe(false);
    expect(res.body.settings.bankAccounts).toEqual([]);
  });

  it("stores the details and normalizes them", async () => {
    const res = await call(app.url, "/api/admin/payment-settings", {
      method: "PUT",
      userId: users.operator.id,
      body: details,
    });

    expect(res.status).toBe(200);
    expect(res.body.hasDetails).toBe(true);
    expect(res.body.updatedByEmail).toBe(users.operator.email);

    const [saved, operatorId] = h.calls.savePlatformPaymentSettings[0];
    expect(operatorId).toBe(users.operator.id);
    // Trimmed, blanks removed, e-mail lowercased - the message is built from this.
    expect(saved.holderName).toBe("LibroDigital S.A.C.");
    expect(saved.plinNumber).toBeNull();
    expect(saved.voucherEmail).toBe("pagos@librodigital.pe");
    expect(saved.notes).toBe("Atendemos de 9am a 6pm.");
    expect(saved.bankAccounts).toHaveLength(1);
    expect(saved.bankAccounts[0].accountNumber).toBe("193-1234567-0-12");
  });

  it("refuses a bank account row that cannot be paid into, naming the row", async () => {
    const res = await call(app.url, "/api/admin/payment-settings", {
      method: "PUT",
      userId: users.operator.id,
      body: { ...details, bankAccounts: [...details.bankAccounts, { bank: "BBVA" }] },
    });

    // Silently dropping the row would mean saving a record the operator did not
    // write; refusing it and saying which row is the only honest answer.
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("cuenta 2");
    expect(h.calls.savePlatformPaymentSettings).toBeUndefined();
  });

  it("rejects a malformed RUC or e-mail instead of storing it", async () => {
    for (const body of [{ holderRuc: "123" }, { voucherEmail: "no-es-un-correo" }]) {


      const res = await call(app.url, "/api/admin/payment-settings", {
        method: "PUT",
        userId: users.operator.id,
        body,
      });

      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(h.calls.savePlatformPaymentSettings).toBeUndefined();
  });

  it("refuses unknown fields, so a stray key never silently becomes a column", async () => {
    const res = await call(app.url, "/api/admin/payment-settings", {
      method: "PUT",
      userId: users.operator.id,
      body: { yapeNumber: "999 888 777", isPlatformAdmin: true },
    });

    expect(res.status).toBe(400);
    expect(h.calls.savePlatformPaymentSettings).toBeUndefined();
  });

  it("reports which text a customer reads today, on Plataforma", async () => {
    const before = await call(app.url, "/api/admin/platform", { userId: users.operator.id });
    const checkBefore = before.body.checks.find((check: any) => check.id === "manual_instructions");
    expect(checkBefore.ok).toBe(false);
    expect(checkBefore.detail).toBeNull();

    await call(app.url, "/api/admin/payment-settings", {
      method: "PUT",
      userId: users.operator.id,
      body: details,
    });

    const after = await call(app.url, "/api/admin/platform", { userId: users.operator.id });
    const checkAfter = after.body.checks.find((check: any) => check.id === "manual_instructions");
    expect(checkAfter.ok).toBe(true);
    expect(checkAfter.detail).toBe("Configuración (panel)");
  });
});


/**
 * Configuración → Operación / Identidad.
 *
 * Alerts, the platform's own identity and the flag that activates a plan without
 * money. The tests that matter: the dangerous flag is off until somebody turns it on,
 * and every save is written to the change history with the operator's name on it.
 */
describe("the platform settings (Configuración)", () => {
  const identity = {
    legalName: "LibroDigital S.A.C.",
    commercialName: "LibroDigital.pe",
    ruc: "20601234567",
    fiscalAddress: "Av. Siempre Viva 742, Lima",
    contactEmail: "hola@librodigital.pe",
    contactPhone: "+51 999 888 777",
    website: "https://librodigital.pe",
    alertEmail: "alertas@librodigital.pe",
    allowFreePlanChange: false,
  };

  it("starts empty, with nothing dangerous enabled", async () => {
    const res = await call(app.url, "/api/admin/platform-settings", { userId: users.operator.id });

    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(false);
    expect(res.body.stored.allowFreePlanChange).toBe(false);
    expect(res.body.effective.allowFreePlanChange).toBe(false);
    // No alert mailbox anywhere: the console must be able to say so.
    expect(res.body.effective.alertEmail).toBe("");
    expect(res.body.effective.alertEmailSource).toBe("none");
  });

  it("stores the identity and the alert mailbox, and records the change", async () => {
    const res = await call(app.url, "/api/admin/platform-settings", {
      method: "PUT",
      userId: users.operator.id,
      body: identity,
    });

    expect(res.status).toBe(200);
    expect(res.body.stored.ruc).toBe("20601234567");
    expect(res.body.effective.alertEmail).toBe("alertas@librodigital.pe");
    expect(res.body.effective.alertEmailSource).toBe("panel");
    expect(res.body.identity.legalName).toBe("LibroDigital S.A.C.");

    const [, operatorId] = h.calls.savePlatformSettings[0];
    expect(operatorId).toBe(users.operator.id);
    const audit = h.calls.recordPlatformConfigChange[0][0];
    expect(audit.email).toBe(users.operator.email);
    expect(audit.area).toBe("operacion");
    expect(audit.summary).toContain("correo de alertas");
  });

  it("reports an env-configured alert mailbox as the source while the panel is empty", async () => {
    process.env.PAYMENTS_ALERT_EMAIL = "ops@librodigital.pe";

    const res = await call(app.url, "/api/admin/platform-settings", { userId: users.operator.id });

    expect(res.body.effective.alertEmail).toBe("ops@librodigital.pe");
    expect(res.body.effective.alertEmailSource).toBe("env");
  });

  it("shouts in the history when the free-plan-change flag is turned on", async () => {
    const res = await call(app.url, "/api/admin/platform-settings", {
      method: "PUT",
      userId: users.operator.id,
      body: { ...identity, allowFreePlanChange: true },
    });

    expect(res.status).toBe(200);
    expect(res.body.stored.allowFreePlanChange).toBe(true);
    expect(h.calls.recordPlatformConfigChange[0][0].summary).toContain("SIN pago ACTIVADO");
  });

  it("rejects a malformed RUC, website or e-mail", async () => {
    for (const body of [{ ruc: "123" }, { website: "librodigital" }, { alertEmail: "no-es-correo" }]) {
      const res = await call(app.url, "/api/admin/platform-settings", {
        method: "PUT",
        userId: users.operator.id,
        body,
      });

      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(h.calls.savePlatformSettings).toBeUndefined();
  });

  it("refuses unknown fields", async () => {
    const res = await call(app.url, "/api/admin/platform-settings", {
      method: "PUT",
      userId: users.operator.id,
      body: { ruc: "20601234567", isPlatformAdmin: true },
    });

    expect(res.status).toBe(400);
    expect(h.calls.savePlatformSettings).toBeUndefined();
  });

  it("sends the SMTP test to the operator's own address, never to one from the body", async () => {
    const res = await call(app.url, "/api/admin/email-test", {
      method: "POST",
      userId: users.operator.id,
      body: { to: "victima@example.com" },
    });

    expect(res.status).toBe(200);
    expect(h.calls.sendTestEmail[0][0]).toBe(users.operator.email);
  });

  it("reports an unreachable SMTP instead of pretending it worked", async () => {
    h.state.smtpReachable = false;

    const res = await call(app.url, "/api/admin/email-test", {
      method: "POST",
      userId: users.operator.id,
    });

    expect(res.status).toBe(502);
    expect(res.body.ok).toBe(false);
    expect(h.calls.sendTestEmail).toBeUndefined();
  });

/**
 * Planes: the price list and the trial length.
 *
 * These are the numbers a customer pays, so the tests check the two ways they can go
 * wrong: a price that does not reach the database, and a paid plan that ends up free.
 */
describe("the price list (Planes)", () => {
  it("ships the catalogue prices until an operator changes something", async () => {
    const res = await call(app.url, "/api/admin/plan-pricing", { userId: users.operator.id });

    expect(res.status).toBe(200);
    const professional = res.body.plans.find((plan: any) => plan.planId === "profesional");
    expect(professional.monthlyCents).toBe(2900);
    expect(professional.annualCents).toBe(18900);
    expect(professional.isOverride).toBe(false);
    expect(res.body.trialDays).toBe(15);
    expect(res.body.trialDaysIsOverride).toBe(false);
  });

  it("saves a price change together with the trial length, and records both", async () => {
    const res = await call(app.url, "/api/admin/plan-pricing", {
      method: "PUT",
      userId: users.operator.id,
      body: {
        prices: [{ planId: "profesional", monthlyCents: 3500, annualCents: 22900 }],
        trialDays: 30,
      },
    });

    expect(res.status).toBe(200);
    const professional = res.body.plans.find((plan: any) => plan.planId === "profesional");
    expect(professional.monthlyCents).toBe(3500);
    expect(professional.isOverride).toBe(true);
    expect(res.body.trialDays).toBe(30);
    expect(res.body.trialDaysIsOverride).toBe(true);

    const saved = h.calls.savePlanPricing[0][0];
    expect(saved.monthlyCents).toBe(3500);
    const audit = h.calls.recordPlatformConfigChange[0][0];
    expect(audit.area).toBe("planes");
    expect(audit.summary).toContain("mensual S/ 29.00 → S/ 35.00");
    expect(audit.summary).toContain("prueba gratuita 15 → 30 días");
  });

  it("drops the override when the price goes back to the catalogue value", async () => {
    h.state.planPricing = {
      profesional: {
        planId: "profesional",
        monthlyCents: 3500,
        annualCents: 22900,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };
    clearPlanPricingCache();

    const res = await call(app.url, "/api/admin/plan-pricing", {
      method: "PUT",
      userId: users.operator.id,
      body: {
        prices: [{ planId: "profesional", monthlyCents: 2900, annualCents: 18900 }],
        trialDays: 15,
      },
    });

    expect(res.status).toBe(200);
    expect(h.calls.resetPlanPricing[0][0]).toBe("profesional");
    expect(res.body.plans.find((plan: any) => plan.planId === "profesional").isOverride).toBe(false);
  });

  it("refuses to sell a paid plan for nothing", async () => {
    const res = await call(app.url, "/api/admin/plan-pricing", {
      method: "PUT",
      userId: users.operator.id,
      body: {
        prices: [{ planId: "corporativo", monthlyCents: 0, annualCents: 0 }],
        trialDays: 15,
      },
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/S\/ 0\.00/);
    expect(h.calls.savePlanPricing).toBeUndefined();
  });

  it("refuses a zero-day trial and an unknown plan", async () => {
    const zeroTrial = await call(app.url, "/api/admin/plan-pricing", {
      method: "PUT",
      userId: users.operator.id,
      body: { prices: [{ planId: "esencial", monthlyCents: 1500, annualCents: 8900 }], trialDays: 0 },
    });
    expect(zeroTrial.status).toBe(400);

    const unknownPlan = await call(app.url, "/api/admin/plan-pricing", {
      method: "PUT",
      userId: users.operator.id,
      body: { prices: [{ planId: "gratis", monthlyCents: 100, annualCents: 100 }], trialDays: 15 },
    });
    expect(unknownPlan.status).toBe(400);
    expect(unknownPlan.body.message).toMatch(/no tiene precio que cambiar/);
  });
});

});

/**
 * Descuentos: promo codes an operator creates and a customer types.
 *
 * The two things worth protecting: a code cannot be duplicated (two different offers
 * under one name is a support nightmare), and a code somebody already used cannot be
 * deleted out from under the payments that reference it.
 */
describe("discount codes (Descuentos)", () => {
  const newCode = {
    code: "pro-10",
    description: "Lanzamiento",
    kind: "percent",
    value: 10,
    maxRedemptions: 5,
  };

  it("creates a code, normalized, and records it", async () => {
    const res = await call(app.url, "/api/admin/discount-codes", {
      method: "POST",
      userId: users.operator.id,
      body: newCode,
    });

    expect(res.status).toBe(201);
    expect(res.body.code.code).toBe("PRO10");
    expect(res.body.code.label).toBe("−10%");
    expect(res.body.code.state).toBe("activo");
    expect(res.body.code.redemptionCount).toBe(0);

    const saved = h.calls.createDiscountCode[0][0];
    expect(saved.code).toBe("PRO10");
    expect(saved.createdByUserId).toBe(users.operator.id);
    expect(h.calls.recordPlatformConfigChange[0][0].area).toBe("descuentos");
  });

  it("refuses a duplicate code however it is typed", async () => {
    await call(app.url, "/api/admin/discount-codes", {
      method: "POST",
      userId: users.operator.id,
      body: newCode,
    });
    const res = await call(app.url, "/api/admin/discount-codes", {
      method: "POST",
      userId: users.operator.id,
      body: { ...newCode, code: "PRO 10" },
    });

    expect(res.status).toBe(409);
    expect(h.calls.createDiscountCode).toHaveLength(1);
  });

  it("rejects a percentage above 100 and a zero value", async () => {
    for (const body of [
      { ...newCode, value: 150 },
      { ...newCode, value: 0 },
      { ...newCode, code: "X" },
    ]) {
      const res = await call(app.url, "/api/admin/discount-codes", {
        method: "POST",
        userId: users.operator.id,
        body,
      });

      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(h.calls.createDiscountCode).toBeUndefined();
  });

  it("lists the codes with their state, and deactivates one", async () => {
    await call(app.url, "/api/admin/discount-codes", {
      method: "POST",
      userId: users.operator.id,
      body: newCode,
    });
    const id = h.state.discountCodes[0].id;

    const patched = await call(app.url, `/api/admin/discount-codes/${id}`, {
      method: "PATCH",
      userId: users.operator.id,
      body: { isActive: false },
    });
    expect(patched.status).toBe(200);
    expect(patched.body.code.state).toBe("inactivo");

    const listed = await call(app.url, "/api/admin/discount-codes", { userId: users.operator.id });
    expect(listed.body.codes).toHaveLength(1);
    expect(listed.body.codes[0].state).toBe("inactivo");
  });

  it("shows a code as agotado once its redemptions are used up", async () => {
    await call(app.url, "/api/admin/discount-codes", {
      method: "POST",
      userId: users.operator.id,
      body: { ...newCode, maxRedemptions: 1 },
    });
    h.state.discountCodes[0].redemptionCount = 1;

    const res = await call(app.url, "/api/admin/discount-codes", { userId: users.operator.id });
    expect(res.body.codes[0].state).toBe("agotado");
  });

  it("deletes an unused code but refuses to delete one that was redeemed", async () => {
    await call(app.url, "/api/admin/discount-codes", {
      method: "POST",
      userId: users.operator.id,
      body: newCode,
    });
    const id = h.state.discountCodes[0].id;

    // Used three times: the payments that used it point at this row, so deleting it
    // would erase the explanation of a discount somebody was actually given.
    h.state.discountCodes[0].redemptionCount = 3;
    const used = await call(app.url, `/api/admin/discount-codes/${id}`, {
      method: "DELETE",
      userId: users.operator.id,
    });
    expect(used.status).toBe(409);
    expect(used.body.message).toMatch(/ya se usó/);
    expect(h.state.discountCodes).toHaveLength(1);

    h.state.discountCodes[0].redemptionCount = 0;
    const deleted = await call(app.url, `/api/admin/discount-codes/${id}`, {
      method: "DELETE",
      userId: users.operator.id,
    });
    expect(deleted.status).toBe(200);
    expect(h.state.discountCodes).toHaveLength(0);
  });
});

/**
 * The change history: the reason the console is allowed to expose dangerous settings.
 */
describe("the console's change history", () => {
  it("lists what was changed, by whom", async () => {
    await call(app.url, "/api/admin/platform-settings", {
      method: "PUT",
      userId: users.operator.id,
      body: { alertEmail: "alertas@librodigital.pe", allowFreePlanChange: true },
    });

    const res = await call(app.url, "/api/admin/config-history", { userId: users.operator.id });

    expect(res.status).toBe(200);
    expect(res.body.changes.length).toBeGreaterThan(0);
    expect(res.body.changes[0].email).toBe(users.operator.email);
    expect(res.body.changes[0].summary).toContain("SIN pago ACTIVADO");
  });

  it("is empty on a fresh console", async () => {
    const res = await call(app.url, "/api/admin/config-history", { userId: users.operator.id });

    expect(res.status).toBe(200);
    expect(res.body.changes).toEqual([]);
  });
});

