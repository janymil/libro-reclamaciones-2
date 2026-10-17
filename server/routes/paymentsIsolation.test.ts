import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { startTestApp, call } from "../test/routeTestHarness";
import { clearPlatformSettingsCache } from "../services/platformSettingsService";

/**
 * PAYMENT ROUTES SECURITY SUITE (Phase 2.7).
 *
 * Storage and the auth service are mocked; the REAL `requireAuth` /
 * `requireNonDemo` / `requireAdmin` middleware and the REAL route handlers all
 * execute, so every assertion reflects the production chain:
 *   auth -> role check -> tenant check -> payment service -> storage.
 *
 * The provider HTTP calls are stubbed with `fetch`, which lets the webhook path
 * (notification -> authoritative status -> settle -> activate plan) be tested
 * end to end without any credentials.
 *
 * The token fixture is `APP_USR-…` on purpose: the gateway reads the credential
 * prefix to decide whether the recurring rail is usable, and sandbox `TEST-…`
 * tokens cannot create preapprovals. These tests exercise the production flow.
 */

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const h = vi.hoisted(() => {
  const calls: Record<string, any[][]> = {};
  const track = (name: string, args: any[]) => {
    (calls[name] ??= []).push(args);
  };

  const state: any = {
    usersById: {},
    payments: {},
    paymentsByReference: {},
    subscriptions: {},
    subscriptionsByReference: {},
    businessById: {},
    nextId: 1,
    /** Configuración → where the company collects a transfer / Yape. */
    paymentSettings: undefined as any,
    /** Simulates an unreadable settings table (e.g. the migration not applied). */
    paymentSettingsError: undefined as any,
    /** Discount codes an operator created (Configuración → Descuentos). */
    discounts: [] as any[],
  };

  const storageMock: any = {
    getPayment: async (id: string) => {
      track("getPayment", [id]);
      return state.payments[id];
    },
    getPaymentByReference: async (reference: string) => {
      track("getPaymentByReference", [reference]);
      const id = state.paymentsByReference[reference];
      return id ? state.payments[id] : undefined;
    },
    getPaymentByProviderRef: async (provider: string, providerRef: string) => {
      track("getPaymentByProviderRef", [provider, providerRef]);
      return Object.values(state.payments).find(
        (payment: any) => payment.provider === provider && payment.providerRef === providerRef,
      );
    },
    getPaymentsByBusiness: async (businessId: string) => {
      track("getPaymentsByBusiness", [businessId]);
      return Object.values(state.payments).filter((payment: any) => payment.businessId === businessId);
    },
    /** Operator queue: the pending transfers of EVERY tenant. */
    listPendingManualPayments: async () => {
      track("listPendingManualPayments", []);
      return Object.values(state.payments).filter(
        (payment: any) => payment.provider === "manual" && payment.status === "pending",
      );
    },
    /**
     * Configuración → Datos de pago. Lives in the mocked storage because the whole
     * point of the feature is that the checkout reads it from there; a test can set
     * `h.state.paymentSettings` to prove what the customer is told, or
     * `h.state.paymentSettingsError` to simulate an unreadable table.
     */
    getPlatformPaymentSettings: async () => {
      if (state.paymentSettingsError) {
        throw state.paymentSettingsError;
      }
      return state.paymentSettings;
    },
    // ---- Price list and discounts (Phase 2.7, step 4) --------------------------
    /** No overrides in these tests: the catalogue prices apply. */
    listPlanPricing: async () => [],
    getDiscountCodeByCode: async (code: string) =>
      state.discounts.find((row: any) => row.code === code),
    redeemDiscountCode: async (id: string) => {
      track("redeemDiscountCode", [id]);
      const row = state.discounts.find((discount: any) => discount.id === id);
      if (!row) return false;
      if (row.maxRedemptions !== null && row.redemptionCount >= row.maxRedemptions) return false;
      row.redemptionCount += 1;
      return true;
    },
    getPlatformSettings: async () => undefined,
    createPayment: async (data: any) => {
      track("createPayment", [data]);
      const id = `pay-${state.nextId++}`;
      const row = {
        id,
        status: "pending",
        providerRef: null,
        redirectUrl: null,
        failureReason: null,
        raw: null,
        paidAt: null,
        confirmedByUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      state.payments[id] = row;
      state.paymentsByReference[row.reference] = id;
      return row;
    },
    updatePayment: async (id: string, updates: any) => {
      track("updatePayment", [id, updates]);
      const row = state.payments[id];
      if (!row) {
        return undefined;
      }
      Object.assign(row, updates, { updatedAt: new Date() });
      return row;
    },
    getBusiness: async (id: string) => {
      track("getBusiness", [id]);
      return state.businessById[id];
    },
    getBusinessById: async (id: string) => {
      track("getBusinessById", [id]);
      return state.businessById[id];
    },
    getUser: async (id: string) => {
      track("getUser", [id]);
      return state.usersById[id];
    },
    /** The receipt/recovery email resolves the account owner from the tenant. */
    getUsersByBusinessIds: async (ids: string[]) => {
      track("getUsersByBusinessIds", [ids]);
      return Object.values(state.usersById).filter((user: any) => ids.includes(user.businessId));
    },
    updateBusiness: async (id: string, updates: any) => {
      track("updateBusiness", [id, updates]);
      const row = state.businessById[id];
      if (!row) {
        return undefined;
      }
      Object.assign(row, updates);
      return row;
    },
    // Used only by the adoption path: matching a payer to an account.
    getUserByEmail: async (email: string) => {
      track("getUserByEmail", [email]);
      return Object.values(state.usersById).find(
        (user: any) => String(user.email).toLowerCase() === email.trim().toLowerCase(),
      );
    },

    // Not used by the payment routes, but the auth chain resolves the user.
    getUserBusinessAccess: async () => [],
    getAllUsers: async () => [],
    getEstablishmentsByBusiness: async () => [],
    countComplaintsSince: async () => 0,

    // ---- Recurring agreements -------------------------------------------------
    createSubscription: async (data: any) => {
      track("createSubscription", [data]);
      const id = `sub-${state.nextId++}`;
      const row = {
        id,
        status: "pending",
        providerRef: null,
        initPoint: null,
        nextPaymentAt: null,
        startedAt: null,
        cancelledAt: null,
        raw: null,
        currency: "PEN",
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      state.subscriptions[id] = row;
      state.subscriptionsByReference[row.reference] = id;
      return row;
    },
    getSubscription: async (id: string) => {
      track("getSubscription", [id]);
      return state.subscriptions[id];
    },
    getSubscriptionByProviderRef: async (provider: string, providerRef: string) => {
      track("getSubscriptionByProviderRef", [provider, providerRef]);
      return Object.values(state.subscriptions).find(
        (subscription: any) =>
          subscription.provider === provider && subscription.providerRef === providerRef,
      );
    },
    getSubscriptionByReference: async (reference: string) => {
      track("getSubscriptionByReference", [reference]);
      const id = state.subscriptionsByReference[reference];
      return id ? state.subscriptions[id] : undefined;
    },
    getLatestSubscriptionByBusiness: async (businessId: string) => {
      track("getLatestSubscriptionByBusiness", [businessId]);
      const owned = Object.values(state.subscriptions).filter(
        (subscription: any) => subscription.businessId === businessId,
      );
      return owned.length > 0 ? owned[owned.length - 1] : undefined;
    },
    getSubscriptionsByBusiness: async (businessId: string) => {
      track("getSubscriptionsByBusiness", [businessId]);
      return Object.values(state.subscriptions).filter(
        (subscription: any) => subscription.businessId === businessId,
      );
    },
    updateSubscription: async (id: string, updates: any) => {
      track("updateSubscription", [id, updates]);
      const row = state.subscriptions[id];
      if (!row) {
        return undefined;
      }
      Object.assign(row, updates, { updatedAt: new Date() });
      return row;
    },
  };

  const authMock: any = {
    validateSessionUser: async (userId: string) => state.usersById[userId] ?? null,
    logoutUser: async () => {},
  };

  return { calls, state, storageMock, authMock };
});

/** Captures the operational alerts instead of sending them. */
const emailMock = vi.hoisted(() => ({
  alerts: [] as Array<{ email: string; subject: string; details: string[] }>,
  receipts: [] as Array<Record<string, any>>,
  /** Every "finish your payment" message (automatic or sent by an operator). */
  recoveries: [] as Array<Record<string, any>>,
}));

vi.mock("../storage", () => ({ storage: h.storageMock }));
vi.mock("../services/authService", () => ({ authService: h.authMock }));
vi.mock("../services/emailService", () => ({
  emailService: {
    sendPlatformAlert: async (email: string, subject: string, details: string[]) => {
      emailMock.alerts.push({ email, subject, details });
    },
    sendPaymentReceipt: async (params: Record<string, any>) => {
      emailMock.receipts.push(params);
    },
    sendPaymentRecovery: async (params: Record<string, any>) => {
      emailMock.recoveries.push(params);
    },
  },
}));

import { registerPaymentsRoutes } from "./payments.routes";
import { clearPaymentAlertCache } from "../services/paymentService";

function tenantBusiness(id: string, name: string) {
  return {
    id,
    ruc: id === A ? "20111111111" : "20222222222",
    businessName: name,
    commercialName: name,
    phone: "999888777",
    address: "Av. Siempre Viva 123",
    distrito: "Lima",
    provincia: "Lima",
    departamento: "Lima",
    website: null,
    isActive: true,
    subscriptionPlan: "esencial",
    subscriptionStatus: "active",
    trialEndsAt: null,
    planPeriod: "monthly",
    currentPeriodEnd: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const users = {
  adminA: { id: "aaaaaaaa-1111-4111-8111-111111111111", email: "admin.a@example.com", firstName: "Admin", lastName: "A", role: "admin", businessId: A, isActive: true, isDemo: false },
  staffA: { id: "aaaaaaaa-2222-4222-8222-222222222222", email: "staff.a@example.com", firstName: "Staff", lastName: "A", role: "user", businessId: A, isActive: true, isDemo: false },
  adminB: { id: "bbbbbbbb-1111-4111-8111-111111111111", email: "admin.b@example.com", firstName: "Admin", lastName: "B", role: "admin", businessId: B, isActive: true, isDemo: false },
  demoAdmin: { id: "dddddddd-1111-4111-8111-111111111111", email: "demo@librodigital.pe", firstName: "Usuario", lastName: "Demo", role: "admin", businessId: A, isActive: true, isDemo: true },
  /**
   * Platform staff (LibroDigital team). Deliberately attached to tenant B, while
   * the seeded payments belong to tenant A, to prove reconciliation works across
   * tenants and that the allow-list - not `role` - is what grants the right.
   */
  platformOps: { id: "ffffffff-1111-4111-8111-111111111111", email: "ops@librodigital.pe", firstName: "Ops", lastName: "Libro", role: "admin", businessId: B, isActive: true, isDemo: false },
};

let app: { url: string; close: () => Promise<void> };

beforeEach(async () => {
  for (const key of Object.keys(h.calls)) delete h.calls[key];

  h.state.usersById = Object.fromEntries(Object.values(users).map((user) => [user.id, user]));
  h.state.businessById = { [A]: tenantBusiness(A, "Tenant A"), [B]: tenantBusiness(B, "Tenant B") };
  h.state.payments = {};
  h.state.paymentsByReference = {};
  h.state.subscriptions = {};
  h.state.subscriptionsByReference = {};
  h.state.nextId = 1;
  h.state.paymentSettings = undefined;
  h.state.paymentSettingsError = undefined;
  h.state.discounts = [];
  clearPlatformSettingsCache();

  delete process.env.MERCADOPAGO_ACCESS_TOKEN;
  delete process.env.APP_URL;
  delete process.env.PAYMENTS_ALERT_EMAIL;
  // Confirming a transfer is platform-staff only; only `platformOps` is on it.
  process.env.PLATFORM_ADMIN_EMAILS = "ops@librodigital.pe";
  emailMock.alerts.length = 0;
  emailMock.receipts.length = 0;
  emailMock.recoveries.length = 0;
  clearPaymentAlertCache();

  app = await startTestApp((expressApp) => {
    registerPaymentsRoutes(expressApp);
  });
});

afterEach(async () => {
  await app.close();
  vi.unstubAllGlobals();
  delete process.env.MERCADOPAGO_ACCESS_TOKEN;
  delete process.env.PAYMENTS_ALERT_EMAIL;
  delete process.env.PLATFORM_ADMIN_EMAILS;
});

/** Seeds a payment row directly, as the checkout would have left it. */
function seedPayment(overrides: Record<string, any> = {}) {
  const id = `seed-${h.state.nextId++}`;
  const row = {
    id,
    businessId: A,
    userId: users.adminA.id,
    provider: "manual",
    method: "transferencia",
    providerRef: `LD-SEED${id}`,
    reference: `LD-SEED${id}`,
    planId: "profesional",
    period: "monthly",
    amountCents: 2900,
    currency: "PEN",
    status: "pending",
    redirectUrl: null,
    failureReason: null,
    raw: null,
    paidAt: null,
    confirmedByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  h.state.payments[row.id] = row;
  h.state.paymentsByReference[row.reference] = row.id;
  return row;
}

describe("POST /api/payments/checkout - authorization", () => {
  it("rejects anonymous callers", async () => {
    const res = await call(app.url, "/api/payments/checkout", {
      method: "POST",
      userId: null,
      body: { plan: "profesional", period: "monthly", provider: "manual" },
    });

    expect(res.status).toBe(401);
    expect(h.calls.createPayment).toBeUndefined();
  });

  it("rejects staff (buying a plan is an admin decision)", async () => {
    const res = await call(app.url, "/api/payments/checkout", {
      method: "POST",
      userId: users.staffA.id,
      body: { plan: "profesional", period: "monthly", provider: "manual" },
    });

    expect(res.status).toBe(403);
    expect(h.calls.createPayment).toBeUndefined();
  });

  it("rejects the publicly shared demo account even though it is an admin", async () => {
    const res = await call(app.url, "/api/payments/checkout", {
      method: "POST",
      userId: users.demoAdmin.id,
      body: { plan: "profesional", period: "monthly", provider: "manual" },
    });

    expect(res.status).toBe(403);
    expect(h.calls.createPayment).toBeUndefined();
  });
});

describe("POST /api/payments/checkout - input hardening", () => {
  it("rejects an unknown plan without touching the database", async () => {
    const res = await call(app.url, "/api/payments/checkout", {
      method: "POST",
      userId: users.adminA.id,
      body: { plan: "plan-gratis-para-todos", period: "monthly", provider: "manual" },
    });

    expect(res.status).toBe(400);
    expect(h.calls.createPayment).toBeUndefined();
  });

  it("rejects a provider that is not in the Peruvian catalog", async () => {
    const res = await call(app.url, "/api/payments/checkout", {
      method: "POST",
      userId: users.adminA.id,
      body: { plan: "profesional", period: "monthly", provider: "stripe" },
    });

    expect(res.status).toBe(400);
    expect(h.calls.createPayment).toBeUndefined();
  });

  it("rejects a catalogued-but-not-wired provider with a clear message", async () => {
    const res = await call(app.url, "/api/payments/checkout", {
      method: "POST",
      userId: users.adminA.id,
      body: { plan: "profesional", period: "monthly", provider: "niubiz" },
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("payment_provider_unavailable");
    expect(h.calls.createPayment).toBeUndefined();
  });

  it("rejects an invalid billing period", async () => {
    const res = await call(app.url, "/api/payments/checkout", {
      method: "POST",
      userId: users.adminA.id,
      body: { plan: "profesional", period: "cada-dos-semanas", provider: "manual" },
    });

    expect(res.status).toBe(400);
  });

  it("refuses to open a checkout for the free plan", async () => {
    const res = await call(app.url, "/api/payments/checkout", {
      method: "POST",
      userId: users.adminA.id,
      body: { plan: "gratis", period: "monthly", provider: "manual" },
    });

    // Nothing to charge: no gateway error, just a clear answer.
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("plan_is_free");
    expect(h.calls.createPayment).toBeUndefined();
    expect(h.calls.createSubscription).toBeUndefined();
  });

  it("ignores a client-supplied amount and uses the catalogue price", async () => {
    const res = await call(app.url, "/api/payments/checkout", {
      method: "POST",
      userId: users.adminA.id,
      body: { plan: "profesional", period: "monthly", provider: "manual", amountCents: 1 },
    });

    expect(res.status).toBe(201);
    const created = h.calls.createPayment[0][0];
    expect(created.amountCents).toBe(2900);
    expect(created.businessId).toBe(A);
    // The server refuses to let the client pre-set the outcome.
    expect(created.status).toBe("pending");
    expect(created.paidAt).toBeUndefined();
  });

  it("prices the annual period from the catalogue too", async () => {
    const res = await call(app.url, "/api/payments/checkout", {
      method: "POST",
      userId: users.adminA.id,
      body: { plan: "corporativo", period: "annual", provider: "manual" },
    });

    expect(res.status).toBe(201);
    expect(h.calls.createPayment[0][0].amountCents).toBe(42900);
    expect(h.calls.createPayment[0][0].period).toBe("annual");
  });
});

describe("POST /api/payments/checkout - the manual (bank transfer) path", () => {
  it("returns bank instructions instead of a redirect, with the reference and amount", async () => {
    const res = await call(app.url, "/api/payments/checkout", {
      method: "POST",
      userId: users.adminA.id,
      body: { plan: "profesional", period: "monthly", provider: "manual" },
    });

    expect(res.status).toBe(201);
    // Nothing to redirect to: the customer pays offline.
    expect(res.body.redirectUrl).toBeNull();
    // The reference is what reconciles the bank statement with our ledger.
    expect(res.body.payment.reference).toMatch(/^LD-[A-HJ-NP-Z2-9]{6}$/);
    expect(res.body.instructions).toContain(res.body.payment.reference);
    expect(res.body.instructions).toContain("S/ 29.00");
    // The plan is NOT applied: only the confirmed payment applies it.
    expect(h.calls.updateBusiness).toBeUndefined();
  });

  it("uses the details an operator saved in Configuración", async () => {
    h.state.paymentSettings = {
      id: 1,
      holderName: "LibroDigital S.A.C.",
      holderRuc: "20601234567",
      yapeNumber: "999 888 777",
      plinNumber: null,
      voucherEmail: "pagos@librodigital.pe",
      voucherWhatsapp: null,
      bankAccounts: [
        {
          bank: "BCP",
          accountType: "corriente",
          accountNumber: "193-1234567-0-12",
          cci: "002-193-001234567012-15",
          currency: "PEN",
          holder: null,
        },
      ],
      notes: null,
      updatedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const res = await call(app.url, "/api/payments/checkout", {
      method: "POST",
      userId: users.adminA.id,
      body: { plan: "profesional", period: "monthly", provider: "manual" },
    });

    expect(res.status).toBe(201);
    expect(res.body.instructions).toContain("Yape al 999 888 777");
    expect(res.body.instructions).toContain("193-1234567-0-12");
    expect(res.body.instructions).toContain("CCI 002-193-001234567012-15");
    expect(res.body.instructions).toContain("pagos@librodigital.pe");
    // Still ours, still the reference of the payment that was just created.
    expect(res.body.instructions).toContain(res.body.payment.reference);
  });

  it("still lets the customer pay when the settings cannot be read", async () => {
    // The settings table is missing (migration not applied) or the read failed: the
    // operator must hear about it, but a customer who decided to pay must not be
    // blocked - they get the fallback text instead.
    h.state.paymentSettingsError = new Error("relation \"platform_payment_settings\" does not exist");
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const res = await call(app.url, "/api/payments/checkout", {
        method: "POST",
        userId: users.adminA.id,
        body: { plan: "esencial", period: "monthly", provider: "manual" },
      });

      expect(res.status).toBe(201);
      expect(res.body.instructions).toContain(res.body.payment.reference);
      expect(logged).toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });

  it("never returns the provider payload to the browser", async () => {
    await call(app.url, "/api/payments/checkout", {
      method: "POST",
      userId: users.adminA.id,
      body: { plan: "esencial", period: "monthly", provider: "manual" },
    });

    const seeded = seedPayment({ raw: { secret_internal: "no-debe-salir" } });
    const res = await call(app.url, "/api/payments", { userId: users.adminA.id });

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("no-debe-salir");
    expect(res.body.find((p: any) => p.id === seeded.id)).toBeDefined();
  });
});

describe("GET /api/payments - tenant isolation", () => {
  it("returns only the caller's business payments", async () => {

/**
 * Discount codes at checkout (Phase 2.7, step 4).
 *
 * The customer types a code; the server decides what it is worth. These tests pin the
 * two rules that make it safe: the discount is applied by the server to the server's
 * own price (never to a number the browser sent), and it is counted only when the
 * money is actually confirmed.
 */
describe("POST /api/payments/checkout - discount codes", () => {
  const percentCode = () => {
    const row = {
      id: "code-1",
      code: "PRO10",
      description: null,
      kind: "percent",
      value: 10,
      planIds: [],
      maxRedemptions: null,
      redemptionCount: 0,
      startsAt: null,
      expiresAt: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    h.state.discounts.push(row);
    return row;
  };

  it("charges the discounted amount and books the code with the payment", async () => {
    percentCode();

    const res = await call(app.url, "/api/payments/checkout", {
      method: "POST",
      userId: users.adminA.id,
      body: {
        plan: "profesional",
        period: "monthly",
        provider: "manual",
        discountCode: "pro 10",
      },
    });

    expect(res.status).toBe(201);
    const created = h.calls.createPayment[0][0];
    // S/ 29.00 - 10% = S/ 26.10, and the ledger explains why.
    expect(created.amountCents).toBe(2610);
    expect(created.discountCode).toBe("PRO10");
    expect(created.discountCents).toBe(290);
    expect(created.discountCodeId).toBe("code-1");
    expect(res.body.payment.amountCents).toBe(2610);
  });

  it("refuses an unknown code with a reason, not a gateway error", async () => {
    const res = await call(app.url, "/api/payments/checkout", {
      method: "POST",
      userId: users.adminA.id,
      body: { plan: "profesional", period: "monthly", provider: "manual", discountCode: "NOEXISTE" },
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("discount_rejected");
    expect(res.body.message).toMatch(/no existe/i);
    expect(h.calls.createPayment).toBeUndefined();
  });

  it("refuses a code scoped to another plan", async () => {
    h.state.discounts.push({
      ...percentCode(),
      planIds: ["corporativo"],
    });

    const res = await call(app.url, "/api/payments/checkout", {
      method: "POST",
      userId: users.adminA.id,
      body: { plan: "esencial", period: "monthly", provider: "manual", discountCode: "PRO10" },
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("discount_rejected");
    expect(res.body.message).toMatch(/no aplica al plan/i);
  });

  it("never lets a code discount a recurring agreement", async () => {
    percentCode();

    // A recurring charge at a discounted amount would follow the customer forever.
    const res = await call(app.url, "/api/payments/checkout", {
      method: "POST",
      userId: users.adminA.id,
      body: {
        plan: "profesional",
        period: "monthly",
        provider: "mercadopago",
        mode: "auto",
        discountCode: "PRO10",
      },
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("discount_rejected");
    expect(res.body.message).toMatch(/pago único/i);
    expect(h.calls.createSubscription).toBeUndefined();
  });

  it("counts the redemption only when the payment is confirmed", async () => {
    const code = percentCode();

    const checkout = await call(app.url, "/api/payments/checkout", {
      method: "POST",
      userId: users.adminA.id,
      body: { plan: "profesional", period: "monthly", provider: "manual", discountCode: "PRO10" },
    });
    const paymentId = checkout.body.payment.id;

    // Pending: an abandoned checkout must not burn the code.
    expect(code.redemptionCount).toBe(0);

    const confirmed = await call(app.url, `/api/payments/${paymentId}/confirm`, {
      method: "POST",
      userId: users.platformOps.id,
    });

    expect(confirmed.status).toBe(200);
    expect(h.calls.redeemDiscountCode[0][0]).toBe("code-1");
    expect(code.redemptionCount).toBe(1);
  });
});

describe("POST /api/payments/discount - the preview the dialog shows", () => {
  it("explains what a valid code does before anybody pays", async () => {
    h.state.discounts.push({
      id: "code-1",
      code: "VERANO",
      description: null,
      kind: "fixed",
      value: 500,
      planIds: [],
      maxRedemptions: null,
      redemptionCount: 0,
      startsAt: null,
      expiresAt: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await call(app.url, "/api/payments/discount", {
      method: "POST",
      userId: users.adminA.id,
      body: { plan: "profesional", period: "monthly", code: "verano" },
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.listAmountCents).toBe(2900);
    expect(res.body.amountOffCents).toBe(500);
    expect(res.body.finalAmountCents).toBe(2400);
  });

  it("answers 'no' with the reason instead of failing", async () => {
    const res = await call(app.url, "/api/payments/discount", {
      method: "POST",
      userId: users.adminA.id,
      body: { plan: "profesional", period: "monthly", code: "NADA" },
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.reason).toMatch(/no existe/i);
    expect(res.body.finalAmountCents).toBe(2900);
  });
});

    const mine = seedPayment({ businessId: A, reference: "LD-MINE01" });
    const theirs = seedPayment({ businessId: B, reference: "LD-THEIRS" });

    const res = await call(app.url, "/api/payments", { userId: users.adminA.id });

    expect(res.status).toBe(200);
    expect(res.body.map((p: any) => p.reference)).toContain(mine.reference);
    expect(res.body.map((p: any) => p.reference)).not.toContain(theirs.reference);
    expect(h.calls.getPaymentsByBusiness[0][0]).toBe(A);
  });

  it("rejects anonymous callers", async () => {
    const res = await call(app.url, "/api/payments", { userId: null });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/payments/:id/confirm - the bank transfer arrives", () => {
  it("activates the plan when platform staff confirm their transfer", async () => {
    const payment = seedPayment();

    // `platformOps` belongs to tenant B and the payment to tenant A: the team
    // reconciles any customer's transfer, which is why there is no tenant filter.
    const res = await call(app.url, `/api/payments/${payment.id}/confirm`, {
      method: "POST",
      userId: users.platformOps.id,
    });

    expect(res.status).toBe(200);
    expect(res.body.payment.status).toBe("paid");
    expect(res.body.payment.confirmedByUserId).toBeUndefined(); // internal field

    const [businessId, updates] = h.calls.updateBusiness[0];
    expect(businessId).toBe(A);
    expect(updates.subscriptionPlan).toBe("profesional");
    expect(updates.subscriptionStatus).toBe("active");
    expect(new Date(updates.currentPeriodEnd).getTime()).toBeGreaterThan(Date.now());
  });

  it("is idempotent: confirming twice does not add a second period", async () => {
    const payment = seedPayment();

    await call(app.url, `/api/payments/${payment.id}/confirm`, {
      method: "POST",
      userId: users.platformOps.id,
    });
    await call(app.url, `/api/payments/${payment.id}/confirm`, {
      method: "POST",
      userId: users.platformOps.id,
    });

    expect(h.calls.updateBusiness).toHaveLength(1);
  });

  it("a customer cannot confirm their OWN transfer (the free-plan hole)", async () => {
    const payment = seedPayment();

    // The customer is `admin` of their own business, so the endpoint must not be
    // guarded by a role: otherwise they could grant themselves a paid plan by
    // clicking "confirm" without ever paying.
    const res = await call(app.url, `/api/payments/${payment.id}/confirm`, {
      method: "POST",
      userId: users.adminA.id,
    });

    expect(res.status).toBe(403);
    expect(h.calls.updateBusiness).toBeUndefined();
    expect(h.state.payments[payment.id].status).toBe("pending");
    expect(h.state.payments[payment.id].paidAt).toBeNull();
  });

  it("a customer cannot confirm another tenant's payment either", async () => {
    const theirs = seedPayment({ businessId: B, reference: "LD-OTRO01" });

    const res = await call(app.url, `/api/payments/${theirs.id}/confirm`, {
      method: "POST",
      userId: users.adminA.id,
    });

    expect(res.status).toBe(403);
    expect(h.calls.updateBusiness).toBeUndefined();
    expect(h.state.payments[theirs.id].status).toBe("pending");
  });

  it("only the platform team can confirm: a staff login is refused too", async () => {
    const payment = seedPayment();

    const res = await call(app.url, `/api/payments/${payment.id}/confirm`, {
      method: "POST",
      userId: users.staffA.id,
    });

    expect(res.status).toBe(403);
    expect(h.calls.updateBusiness).toBeUndefined();
  });

  it("refuses to hand-confirm an automatically collected payment", async () => {
    const payment = seedPayment({ provider: "mercadopago", providerRef: "999", method: null });

    const res = await call(app.url, `/api/payments/${payment.id}/confirm`, {
      method: "POST",
      userId: users.platformOps.id,
    });

    expect(res.status).toBe(400);
    expect(h.state.payments[payment.id].status).toBe("pending");
    expect(h.calls.updateBusiness).toBeUndefined();
  });
});

describe("GET /api/payments/pending-manual - the operator's queue", () => {
  it("shows platform staff the pending transfer of every tenant, with its business", async () => {
    const mine = seedPayment();
    seedPayment({ businessId: B, reference: "LD-OTRO02" });
    seedPayment({ status: "paid", reference: "LD-PAGADO" });

    const res = await call(app.url, "/api/payments/pending-manual", {
      userId: users.platformOps.id,
    });

    expect(res.status).toBe(200);
    const references = res.body.map((row: any) => row.payment.reference);
    expect(references).toContain(mine.reference);
    // The team reconciles the money in its own Yape/bank, so it needs every
    // customer, not only the tenant it happens to belong to.
    expect(references).toContain("LD-OTRO02");
    expect(references).not.toContain("LD-PAGADO");
    expect(res.body[0].businessName).toBeTruthy();
  });

  it("is refused for a customer, even for their own pending transfer", async () => {
    seedPayment();

    const res = await call(app.url, "/api/payments/pending-manual", {
      userId: users.adminA.id,
    });

    expect(res.status).toBe(403);
  });
});

describe("POST /api/payments/webhook/:provider", () => {

  it("accepts an unauthenticated notification and ignores it when the provider has no credentials", async () => {
    const res = await call(app.url, "/api/payments/webhook/mercadopago", {
      method: "POST",
      userId: null,
      body: { type: "payment", data: { id: "555" } },
    });

    // 200 so the provider stops retrying; nothing was activated.
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, handled: false });
    expect(h.calls.updateBusiness).toBeUndefined();
  });

  it("answers 200 for an unknown provider instead of leaking a 404", async () => {
    const res = await call(app.url, "/api/payments/webhook/banco-fantasma", {
      method: "POST",
      userId: null,
      body: { type: "payment", data: { id: "1" } },
    });

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });

  it("activates the plan only after confirming the status with the provider API", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-TEST-TOKEN";
    const payment = seedPayment({
      provider: "mercadopago",
      method: null,
      providerRef: "555",
      amountCents: 2900,
      planId: "profesional",
    });

    const { providerCalls } = stubProvider({
      id: 555,
      status: "approved",
      transaction_amount: 29,
      external_reference: payment.reference,
      payment_method_id: "yape",
    });

    const res = await call(app.url, "/api/payments/webhook/mercadopago", {
      method: "POST",
      userId: null,
      body: { type: "payment", data: { id: "555" } },
    });

    expect(res.status).toBe(200);
    expect(res.body.handled).toBe(true);
    expect(res.body.status).toBe("paid");
    // The webhook body alone is never trusted: the provider was asked directly.
    expect(providerCalls).toHaveLength(1);
    expect(providerCalls[0]).toContain("/v1/payments/555");
    expect(h.state.payments[payment.id].status).toBe("paid");
    expect(h.calls.updateBusiness[0][1].subscriptionPlan).toBe("profesional");
  });

  it("rejects a notification that under-reports the amount (tamper attempt)", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-TEST-TOKEN";
    const payment = seedPayment({
      provider: "mercadopago",
      method: null,
      providerRef: "777",
      amountCents: 2900,
    });

    stubProvider({
      id: 777,
      status: "approved",
      transaction_amount: 1, // S/ 1,00 instead of S/ 29,00
      external_reference: payment.reference,
    });

    const res = await call(app.url, "/api/payments/webhook/mercadopago", {
      method: "POST",
      userId: null,
      body: { type: "payment", data: { id: "777" } },
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("failed");
    expect(h.state.payments[payment.id].status).toBe("failed");
    expect(h.calls.updateBusiness).toBeUndefined();
  });

  it("ignores a payment id that belongs to no known order", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-TEST-TOKEN";
    const { providerCalls } = stubProvider({ id: 12345, status: "approved", transaction_amount: 29 });

    const res = await call(app.url, "/api/payments/webhook/mercadopago", {
      method: "POST",
      userId: null,
      body: { type: "payment", data: { id: "12345" } },
    });

    expect(res.status).toBe(200);
    expect(res.body.handled).toBe(false);
    // The provider IS asked once: its `external_reference` is the only way to
    // tell whether this is an unknown renewal of a subscription we know.
    expect(providerCalls).toHaveLength(1);
    // But nothing was settled and no plan was granted.
    expect(h.calls.createPayment).toBeUndefined();
    expect(h.calls.updatePayment).toBeUndefined();
    expect(h.calls.updateBusiness).toBeUndefined();
  });

  it("ignores event types that are not payments", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-TEST-TOKEN";
    const { providerCalls } = stubProvider({ id: 1, status: "approved", transaction_amount: 29 });

    const res = await call(app.url, "/api/payments/webhook/mercadopago", {
      method: "POST",
      userId: null,
      body: { type: "merchant_order", data: { id: "1" } },
    });

    expect(res.status).toBe(200);
    expect(res.body.handled).toBe(false);
    expect(providerCalls).toHaveLength(0);
  });

  it("asks the provider to retry when its API cannot be reached", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-TEST-TOKEN";
    seedPayment({ provider: "mercadopago", method: null, providerRef: "888" });

    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
      if (String(input).startsWith("https://api.mercadopago.com")) {
        throw new Error("network down");
      }
      return realFetch(input, init);
    }));

    const res = await call(app.url, "/api/payments/webhook/mercadopago", {
      method: "POST",
      userId: null,
      body: { type: "payment", data: { id: "888" } },
    });

    // 5xx: we could not confirm, so a retry is exactly what we want.
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Recurring subscriptions: the SaaS rail
// ---------------------------------------------------------------------------

/**
 * Stubs ONLY the provider API, delegating everything else to the real fetch
 * (the test harness itself talks over HTTP, so a blanket stub would break it).
 */
function stubProvider(payload: unknown) {
  const realFetch = globalThis.fetch;
  const providerCalls: string[] = [];
  const fetchMock = vi.fn(async (input: any, init?: any) => {
    const url = String(input);
    if (url.startsWith("https://api.mercadopago.com")) {
      providerCalls.push(url);
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return realFetch(input, init);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, providerCalls };
}

/**
 * Stubs the provider API per endpoint, because a subscription notification makes
 * three different calls (invoice, agreement, underlying payment) that each need
 * their own answer.
 */
function stubProviderByPath(map: {
  preapproval?: unknown;
  authorizedPayment?: unknown;
  payment?: unknown;
  preference?: unknown;
}) {
  const realFetch = globalThis.fetch;
  const providerCalls: string[] = [];
  const fetchMock = vi.fn(async (input: any, init?: any) => {
    const url = String(input);
    if (url.startsWith("https://api.mercadopago.com")) {
      providerCalls.push(url);

      let payload: unknown = {};
      if (url.includes("/authorized_payments/")) {
        payload = map.authorizedPayment ?? {};
      } else if (url.includes("/preapproval/") || url.endsWith("/preapproval")) {
        payload = map.preapproval ?? {};
      } else if (url.includes("/checkout/preferences")) {
        payload = map.preference ?? {};
      } else if (url.includes("/v1/payments/")) {
        payload = map.payment ?? {};
      }

      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return realFetch(input, init);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, providerCalls };
}

/** Seeds a recurring agreement, as the checkout would have left it. */
function seedSubscription(overrides: Record<string, any> = {}) {
  const id = `seed-sub-${h.state.nextId++}`;
  const row = {
    id,
    businessId: A,
    userId: users.adminA.id,
    provider: "mercadopago",
    providerRef: `pre-${id}`,
    reference: `LD-SUB${h.state.nextId}`,
    planId: "profesional",
    period: "monthly",
    amountCents: 2900,
    currency: "PEN",
    payerEmail: "admin.a@example.com",
    status: "pending",
    initPoint: "https://www.mercadopago.com.pe/subscriptions/checkout?preapproval_id=1",
    nextPaymentAt: null,
    startedAt: null,
    cancelledAt: null,
    raw: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  h.state.subscriptions[row.id] = row;
  h.state.subscriptionsByReference[row.reference] = row.id;
  return row;
}

describe("POST /api/payments/checkout - recurring subscriptions", () => {
  it("creates a subscription (not a one-off charge) when the provider can recur", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-TEST-TOKEN";

    const { providerCalls } = stubProvider({
      id: "pre-1",
      status: "pending",
      init_point: "https://www.mercadopago.com.pe/subscriptions/checkout?preapproval_id=1",
      auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: 29, currency_id: "PEN" },
    });

    const res = await call(app.url, "/api/payments/checkout", {
      method: "POST",
      userId: users.adminA.id,
      body: { plan: "profesional", period: "monthly", provider: "mercadopago" },
    });

    expect(res.status).toBe(201);
    expect(res.body.mode).toBe("subscription");
    expect(res.body.redirectUrl).toContain("subscriptions/checkout");
    // It asked for a recurring agreement, not a one-time preference.
    expect(providerCalls.some((url) => url.endsWith("/preapproval"))).toBe(true);
    expect(providerCalls.some((url) => url.includes("checkout/preferences"))).toBe(false);

    const created = h.calls.createSubscription[0][0];
    expect(created.planId).toBe("profesional");
    expect(created.period).toBe("monthly");
    expect(created.amountCents).toBe(2900);
    // Nothing is charged yet and no plan is granted: only a row to track.
    expect(h.calls.createPayment).toBeUndefined();
    expect(h.calls.updateBusiness).toBeUndefined();
  });

  it("prices an annual subscription from the catalogue", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-TEST-TOKEN";
    stubProvider({
      id: "pre-2",
      status: "pending",
      init_point: "https://mp/init",
      auto_recurring: { frequency: 12, frequency_type: "months", transaction_amount: 429 },
    });

    const res = await call(app.url, "/api/payments/checkout", {
      method: "POST",
      userId: users.adminA.id,
      body: { plan: "corporativo", period: "annual", provider: "mercadopago" },
    });

    expect(res.status).toBe(201);
    expect(h.calls.createSubscription[0][0].amountCents).toBe(42900);
    expect(h.calls.createSubscription[0][0].period).toBe("annual");
  });

  it("still allows a deliberate one-off payment", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-TEST-TOKEN";
    stubProvider({
      id: "pref-1",
      init_point: "https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id=1",
    });

    const res = await call(app.url, "/api/payments/checkout", {
      method: "POST",
      userId: users.adminA.id,
      body: { plan: "esencial", period: "monthly", provider: "mercadopago", mode: "one_time" },
    });

    expect(res.status).toBe(201);
    expect(res.body.mode).toBe("payment");
    expect(h.calls.createPayment).toBeDefined();
    expect(h.calls.createSubscription).toBeUndefined();
  });

  it("reports a clear error when the provider has no credentials", async () => {
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;

    const res = await call(app.url, "/api/payments/checkout", {
      method: "POST",
      userId: users.adminA.id,
      body: { plan: "profesional", period: "monthly", provider: "mercadopago" },
    });

    expect(res.status).toBe(502);
    expect(h.calls.updateBusiness).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Changing plan, or only the billing period of the same plan
// ---------------------------------------------------------------------------

/**
 * The server side of a card that used to be impossible to click.
 *
 * A customer on Básico *mensual* who wanted Básico *anual* found the card
 * disabled ("Plan activo"), so nothing here was ever exercised. Once the card
 * became clickable (client/src/lib/plan-card-state.ts), the old month-to-month
 * agreement had to be stopped as well: otherwise the customer pays for the
 * monthly plan AND the annual one at the same time.
 */
describe("POST /api/payments/checkout - changing plan or period", () => {
  it("stops the previous automatic charge when the same plan is bought for another period", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-TEST-TOKEN";
    const previous = seedSubscription({
      planId: "esencial",
      period: "monthly",
      status: "authorized",
      providerRef: "pre-old",
    });
    const { providerCalls } = stubProviderByPath({
      preapproval: { id: "pre-new", status: "pending", init_point: "https://mp/init-new" },
    });

    const res = await call(app.url, "/api/payments/checkout", {
      method: "POST",
      userId: users.adminA.id,
      body: { plan: "esencial", period: "annual", provider: "mercadopago" },
    });

    expect(res.status).toBe(201);
    expect(res.body.mode).toBe("subscription");
    // The annual agreement the customer just asked for...
    expect(h.calls.createSubscription.at(-1)![0].period).toBe("annual");
    // ...and the month-to-month one they are leaving, stopped at the provider.
    expect(providerCalls.some((url) => url.endsWith("/preapproval/pre-old"))).toBe(true);
    expect(h.state.subscriptions[previous.id].status).toBe("cancelled");
  });

  it("also stops it when the customer moves up to another plan", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-TEST-TOKEN";
    const previous = seedSubscription({
      planId: "esencial",
      period: "monthly",
      status: "authorized",
      providerRef: "pre-old",
    });
    const { providerCalls } = stubProviderByPath({
      preapproval: { id: "pre-new", status: "pending", init_point: "https://mp/init-new" },
    });

    await call(app.url, "/api/payments/checkout", {
      method: "POST",
      userId: users.adminA.id,
      body: { plan: "profesional", period: "monthly", provider: "mercadopago" },
    });

    expect(providerCalls.some((url) => url.endsWith("/preapproval/pre-old"))).toBe(true);
    expect(h.state.subscriptions[previous.id].status).toBe("cancelled");
  });

  it("leaves the agreement alone when the exact plan and period is bought again", async () => {
    // A deliberate early renewal: `applyPaidPeriod` stacks the new period on top,
    // so cancelling the agreement here would take away the customer's auto-renewal.
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-TEST-TOKEN";
    const previous = seedSubscription({
      planId: "esencial",
      period: "monthly",
      status: "authorized",
      providerRef: "pre-old",
    });
    const { providerCalls } = stubProviderByPath({
      preapproval: { id: "pre-new", status: "pending", init_point: "https://mp/init-new" },
    });

    const res = await call(app.url, "/api/payments/checkout", {
      method: "POST",
      userId: users.adminA.id,
      body: { plan: "esencial", period: "monthly", provider: "mercadopago" },
    });

    expect(res.status).toBe(201);
    expect(providerCalls.some((url) => url.endsWith("/preapproval/pre-old"))).toBe(false);
    expect(h.state.subscriptions[previous.id].status).toBe("authorized");
    // The only write is the new row keeping its provider id / init point.
    const cancellations = h.calls.updateSubscription.filter(([, updates]) => updates.status === "cancelled");
    expect(cancellations).toHaveLength(0);
  });

  it("never ends a running trial by cancelling the agreement it replaces", async () => {
    // A customer who authorises an automatic charge during the trial keeps the
    // remaining free days; changing plan inside that window must not consume them.
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-TEST-TOKEN";
    h.state.businessById[A].subscriptionStatus = "trialing";
    h.state.businessById[A].trialEndsAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    seedSubscription({
      planId: "esencial",
      period: "monthly",
      status: "authorized",
      providerRef: "pre-old",
    });
    stubProviderByPath({
      preapproval: { id: "pre-new", status: "pending", init_point: "https://mp/init-new" },
    });

    const res = await call(app.url, "/api/payments/checkout", {
      method: "POST",
      userId: users.adminA.id,
      body: { plan: "esencial", period: "annual", provider: "mercadopago" },
    });

    expect(res.status).toBe(201);
    expect(h.state.businessById[A].subscriptionStatus).toBe("trialing");
  });
});


describe("subscription webhooks", () => {
  const authorizedPreapproval = {
    id: "pre-1",
    status: "authorized",
    external_reference: "LD-SUB1",
    init_point: "https://mp/init",
    auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: 29, currency_id: "PEN" },
  };

  it("activates the plan when the customer authorises the recurring charge", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-TEST-TOKEN";
    const subscription = seedSubscription({ reference: "LD-SUB1", providerRef: "pre-1" });
    stubProviderByPath({ preapproval: authorizedPreapproval });

    const res = await call(app.url, "/api/payments/webhook/mercadopago", {
      method: "POST",
      userId: null,
      body: { type: "subscription_preapproval", data: { id: "pre-1" } },
    });

    expect(res.status).toBe(200);
    expect(res.body.handled).toBe(true);
    expect(res.body.status).toBe("authorized");
    expect(h.state.subscriptions[subscription.id].status).toBe("authorized");

    const [, updates] = h.calls.updateBusiness[0];
    expect(updates.subscriptionPlan).toBe("profesional");
    // The agreement event must NOT move the period end: that is the charge's job,
    // otherwise one payment would be credited twice.
    expect(updates.currentPeriodEnd).toBeUndefined();
  });

  it("books the first charge and extends the paid period", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-TEST-TOKEN";
    const subscription = seedSubscription({ reference: "LD-SUB1", providerRef: "pre-1" });
    stubProviderByPath({
      authorizedPayment: { id: "inv-1", preapproval_id: "pre-1", status: "processed", payment: { id: 555 } },
      preapproval: authorizedPreapproval,
      payment: { id: 555, status: "approved", transaction_amount: 29, external_reference: "LD-SUB1" },
    });

    const res = await call(app.url, "/api/payments/webhook/mercadopago", {
      method: "POST",
      userId: null,
      body: { type: "subscription_authorized_payment", data: { id: "inv-1" } },
    });

    expect(res.status).toBe(200);
    expect(res.body.handled).toBe(true);
    expect(res.body.status).toBe("paid");

    const created = h.calls.createPayment[0][0];
    expect(created.subscriptionId).toBe(subscription.id);
    expect(created.amountCents).toBe(2900);
    expect(created.providerRef).toBe("555");

    // The plan is running and the access window moved forward.
    const businessUpdate = h.calls.updateBusiness.at(-1)!;
    expect(businessUpdate[1].subscriptionPlan).toBe("profesional");
    expect(new Date(businessUpdate[1].currentPeriodEnd).getTime()).toBeGreaterThan(Date.now());
  });

  it("does not extend the period twice when the same charge is notified again", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-TEST-TOKEN";
    seedSubscription({ reference: "LD-SUB1", providerRef: "pre-1" });
    stubProviderByPath({
      authorizedPayment: { id: "inv-1", preapproval_id: "pre-1", status: "processed", payment: { id: 555 } },
      preapproval: authorizedPreapproval,
      payment: { id: 555, status: "approved", transaction_amount: 29, external_reference: "LD-SUB1" },
    });

    const send = () => call(app.url, "/api/payments/webhook/mercadopago", {
      method: "POST",
      userId: null,
      body: { type: "subscription_authorized_payment", data: { id: "inv-1" } },
    });

    await send();
    const periodEnds = h.calls.updateBusiness
      .map(([, updates]) => updates.currentPeriodEnd)
      .filter(Boolean);
    await send();

    const periodEndsAgain = h.calls.updateBusiness
      .map(([, updates]) => updates.currentPeriodEnd)
      .filter(Boolean);

    // Still one row, and still exactly one period extension.
    expect(Object.keys(h.state.payments)).toHaveLength(1);
    expect(h.calls.createPayment).toHaveLength(1);
    expect(periodEndsAgain).toHaveLength(periodEnds.length);
  });

  it("links a renewal notified only on the payment topic, through external_reference", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-TEST-TOKEN";
    const subscription = seedSubscription({ reference: "LD-SUB1", providerRef: "pre-1" });
    stubProviderByPath({
      payment: { id: 777, status: "approved", transaction_amount: 29, external_reference: "LD-SUB1" },
    });

    const res = await call(app.url, "/api/payments/webhook/mercadopago", {
      method: "POST",
      userId: null,
      body: { type: "payment", data: { id: "777" } },
    });

    expect(res.status).toBe(200);
    expect(res.body.handled).toBe(true);
    expect(h.calls.createPayment[0][0].subscriptionId).toBe(subscription.id);
    expect(h.calls.updateBusiness.at(-1)![1].subscriptionPlan).toBe("profesional");
  });

  it("marks the subscription paused (past_due) without touching the plan", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-TEST-TOKEN";
    const subscription = seedSubscription({ reference: "LD-SUB1", providerRef: "pre-1" });
    stubProviderByPath({ preapproval: { ...authorizedPreapproval, status: "paused" } });

    const res = await call(app.url, "/api/payments/webhook/mercadopago", {
      method: "POST",
      userId: null,
      body: { type: "subscription_preapproval", data: { id: "pre-1" } },
    });

    expect(res.body.status).toBe("paused");
    expect(h.state.subscriptions[subscription.id].status).toBe("paused");
    const [, updates] = h.calls.updateBusiness[0];
    expect(updates.subscriptionStatus).toBe("past_due");
    // A payment failure must not silently downgrade the customer.
    expect(updates.subscriptionPlan).toBeUndefined();
  });
});

describe("subscription endpoints", () => {
  it("does not let /api/payments/:id swallow the literal subscription path", async () => {
    seedSubscription({ providerRef: "pre-1" });

    const res = await call(app.url, "/api/payments/subscription", { userId: users.adminA.id });

    expect(res.status).toBe(200);
    expect(res.body.subscription).toBeTruthy();
    // It was handled by the subscription route, not by the payment-by-id one.
    expect(h.calls.getPayment).toBeUndefined();
  });

  it("only shows the caller's own agreement", async () => {
    const mine = seedSubscription({ reference: "LD-MINE1" });
    const theirs = seedSubscription({ businessId: B, reference: "LD-OTRO1" });

    const res = await call(app.url, "/api/payments/subscription", { userId: users.adminA.id });

    expect(res.body.subscription.id).toBe(mine.id);
    expect(res.body.subscription.reference).not.toBe(theirs.reference);
    expect(h.calls.getLatestSubscriptionByBusiness[0][0]).toBe(A);
  });

  it("answers with null when the business never subscribed", async () => {
    const res = await call(app.url, "/api/payments/subscription", { userId: users.adminA.id });

    expect(res.status).toBe(200);
    expect(res.body.subscription).toBeNull();
  });

  it("rejects anonymous callers", async () => {
    const res = await call(app.url, "/api/payments/subscription", { userId: null });
    expect(res.status).toBe(401);
  });

  it("stops future charges and reports the cancellation", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-TEST-TOKEN";
    const subscription = seedSubscription({
      reference: "LD-SUB1",
      providerRef: "pre-1",
      status: "authorized",
    });
    const { providerCalls } = stubProviderByPath({ preapproval: { id: "pre-1", status: "cancelled" } });

    const res = await call(app.url, "/api/payments/subscription/cancel", {
      method: "POST",
      userId: users.adminA.id,
    });

    expect(res.status).toBe(200);
    expect(res.body.subscription.status).toBe("cancelled");
    expect(h.state.subscriptions[subscription.id].status).toBe("cancelled");
    // The provider was actually told to stop charging.
    expect(providerCalls.some((url) => url.includes("/preapproval/pre-1"))).toBe(true);
    // The plan is NOT ripped away: the paid period still has to run out.
    const [, updates] = h.calls.updateBusiness[0];
    expect(updates.subscriptionStatus).toBe("canceled");
    expect(updates.subscriptionPlan).toBeUndefined();
    expect(updates.currentPeriodEnd).toBeUndefined();
  });

  it("only lets an admin cancel", async () => {
    seedSubscription({ status: "authorized" });

    const res = await call(app.url, "/api/payments/subscription/cancel", {
      method: "POST",
      userId: users.staffA.id,
    });

    expect(res.status).toBe(403);
    expect(h.calls.updateSubscription).toBeUndefined();
  });

  it("refuses to cancel from the shared demo account", async () => {
    seedSubscription({ status: "authorized" });

    const res = await call(app.url, "/api/payments/subscription/cancel", {
      method: "POST",
      userId: users.demoAdmin.id,
    });

    expect(res.status).toBe(403);
    expect(h.calls.updateSubscription).toBeUndefined();
  });

  it("is idempotent: cancelling twice does not call the provider again", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-TEST-TOKEN";
    seedSubscription({ providerRef: "pre-1", status: "cancelled" });
    const { providerCalls } = stubProviderByPath({ preapproval: { id: "pre-1", status: "cancelled" } });

    const res = await call(app.url, "/api/payments/subscription/cancel", {
      method: "POST",
      userId: users.adminA.id,
    });

    expect(res.status).toBe(200);
    expect(providerCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Subscriptions bought through a Mercado Pago plan link (mpago.la/...)
// ---------------------------------------------------------------------------

/**
 * A plan created in the panel is paid through its own public link, so Mercado
 * Pago - not this app - creates the subscription. These tests are the guarantee
 * that such a payment is not silently dropped.
 */
describe("subscriptions bought outside the app (panel plan link)", () => {
  const planPreapproval = {
    id: "pre-plan-1",
    status: "authorized",
    external_reference: "LD-PROFESIONAL-A",
    payer_email: "admin.a@example.com",
    preapproval_plan_id: "plan-abc",
    auto_recurring: {
      frequency: 12,
      frequency_type: "months",
      transaction_amount: 189,
      currency_id: "PEN",
    },
  };

  const notify = (body: unknown) =>
    call(app.url, "/api/payments/webhook/mercadopago", { method: "POST", userId: null, body });

  it("adopts it for the account that owns the payer email and activates the plan", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-TEST-TOKEN";
    stubProviderByPath({ preapproval: planPreapproval });

    const res = await notify({ type: "subscription_preapproval", data: { id: "pre-plan-1" } });

    expect(res.status).toBe(200);
    expect(res.body.handled).toBe(true);
    expect(res.body.status).toBe("authorized");

    const created = h.calls.createSubscription[0][0];
    expect(created.businessId).toBe(A);
    expect(created.providerRef).toBe("pre-plan-1");
    expect(created.planId).toBe("profesional");
    expect(created.period).toBe("annual");
    expect(created.amountCents).toBe(18900);

    // The customer actually gets what they paid for.
    expect(h.calls.updateBusiness[0][1].subscriptionPlan).toBe("profesional");
  });

  it("recognises the plan from the price when the panel code is missing", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-TEST-TOKEN";
    stubProviderByPath({
      preapproval: { ...planPreapproval, external_reference: "algo-inesperado" },
    });

    await notify({ type: "subscription_preapproval", data: { id: "pre-plan-1" } });

    expect(h.calls.createSubscription[0][0].planId).toBe("profesional");
    expect(h.calls.createSubscription[0][0].period).toBe("annual");
  });

  it("adopts it only once, however many notifications arrive", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-TEST-TOKEN";
    stubProviderByPath({ preapproval: planPreapproval });

    await notify({ type: "subscription_preapproval", data: { id: "pre-plan-1" } });
    await notify({ type: "subscription_preapproval", data: { id: "pre-plan-1" } });

    expect(h.calls.createSubscription).toHaveLength(1);
  });

  it("refuses to guess when the purchase is not identifiable", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-TEST-TOKEN";
    stubProviderByPath({
      preapproval: {
        ...planPreapproval,
        external_reference: "sin-codigo",
        auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: 12.34 },
      },
    });

    const res = await notify({ type: "subscription_preapproval", data: { id: "pre-plan-1" } });

    expect(res.body.handled).toBe(false);
    expect(h.calls.createSubscription).toBeUndefined();
    expect(h.calls.updateBusiness).toBeUndefined();
  });

  it("alerts the operator when the payer email belongs to no account", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-TEST-TOKEN";
    process.env.PAYMENTS_ALERT_EMAIL = "ops@librodigital.pe";
    stubProviderByPath({
      preapproval: { ...planPreapproval, payer_email: "desconocido@gmail.com" },
    });

    const res = await notify({ type: "subscription_preapproval", data: { id: "pre-plan-1" } });

    // Nothing can be activated automatically, but a human is told.
    expect(res.body.handled).toBe(false);
    expect(h.calls.createSubscription).toBeUndefined();
    expect(h.calls.updateBusiness).toBeUndefined();
    expect(emailMock.alerts).toHaveLength(1);
    expect(emailMock.alerts[0].email).toBe("ops@librodigital.pe");
    expect(emailMock.alerts[0].details.join("\n")).toContain("desconocido@gmail.com");
  });

  it("does not alert twice for the same stray subscription", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-TEST-TOKEN";
    process.env.PAYMENTS_ALERT_EMAIL = "ops@librodigital.pe";
    stubProviderByPath({
      preapproval: { ...planPreapproval, payer_email: "desconocido@gmail.com" },
    });

    await notify({ type: "subscription_preapproval", data: { id: "pre-plan-1" } });
    await notify({ type: "subscription_preapproval", data: { id: "pre-plan-1" } });

    expect(emailMock.alerts).toHaveLength(1);
  });

  it("books the first charge of an adopted subscription", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-TEST-TOKEN";
    stubProviderByPath({
      authorizedPayment: {
        id: "inv-plan-1",
        preapproval_id: "pre-plan-1",
        status: "processed",
        payment: { id: 909 },
      },
      preapproval: planPreapproval,
      payment: { id: 909, status: "approved", transaction_amount: 189, external_reference: "LD-PROFESIONAL-A" },
    });

    const res = await notify({ type: "subscription_authorized_payment", data: { id: "inv-plan-1" } });

    expect(res.status).toBe(200);
    expect(res.body.handled).toBe(true);
    expect(res.body.status).toBe("paid");

    // Adopted and paid in one go: a year of access from the panel link.
    const created = h.calls.createSubscription[0][0];
    expect(created.businessId).toBe(A);
    expect(h.calls.updatePayment.at(-1)![1].status).toBe("paid");
    expect(h.calls.updateBusiness.at(-1)![1].subscriptionPlan).toBe("profesional");
  });
});

/**
 * PAYMENT RECOVERY (Phase 2.7, step 5).
 *
 * A declined card must not end the story: the customer receives the same checkout
 * link plus the transfer/Yape details, and an operator can resend it or pair a
 * later transfer with the order the attempt left behind.
 */
describe("a declined payment - the way back to the customer", () => {
  const settings = {
    holderName: "LibroDigital S.A.C.",
    holderRuc: "20123456789",
    yapeNumber: "999888777",
    plinNumber: null,
    voucherEmail: "pagos@librodigital.pe",
    voucherWhatsapp: null,
    bankAccounts: [
      {
        bank: "BCP",
        accountType: "corriente",
        accountNumber: "193-1234567",
        cci: "002-193-1234567",
        currency: "PEN",
        holder: null,
      },
    ],
    notes: null,
  };

  it("emails the original checkout link and the transfer data, and records why it failed", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-TEST-TOKEN";
    const payment = seedPayment({
      provider: "mercadopago",
      method: null,
      providerRef: "pref-123",
      reference: "LD-RECOV1",
      redirectUrl: "https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id=pref-123",
      amountCents: 500,
      planId: "esencial",
    });
    h.state.paymentSettings = settings;

    stubProvider({
      id: 184624883994,
      status: "rejected",
      status_detail: "cc_rejected_high_risk",
      transaction_amount: 5,
      external_reference: payment.reference,
    });

    const res = await call(app.url, "/api/payments/webhook/mercadopago", {
      method: "POST",
      userId: null,
      body: { type: "payment", data: { id: "184624883994" } },
    });

    expect(res.status).toBe(200);
    // Matched by our own reference even though the row stores the preference id.
    expect(res.body.handled).toBe(true);
    expect(res.body.status).toBe("failed");
    expect(h.state.payments[payment.id].failureReason).toContain("riesgo alto");

    await vi.waitFor(() => expect(emailMock.recoveries).toHaveLength(1));
    const sent = emailMock.recoveries[0];
    expect(sent.email).toBe(users.adminA.email);
    // The SAME link the customer was sent to the first time.
    expect(sent.checkoutUrl).toBe(payment.redirectUrl);
    expect(sent.reference).toBe("LD-RECOV1");
    expect(sent.amountLabel).toBe("S/ 5.00");
    // And the offline alternative, carrying the same reference.
    expect(sent.transferInstructions).toContain("Yape al 999888777");
    expect(sent.transferInstructions).toContain("193-1234567");
    expect(sent.transferInstructions).toContain("LD-RECOV1");
    // Always a second way in, even if the provider link expires.
    expect(sent.resumeUrl).toContain("/suscribir?plan=esencial&periodo=monthly");
    expect(h.state.payments[payment.id].recoveryEmailCount).toBe(1);
    expect(h.state.payments[payment.id].recoveryEmailSentAt).toBeTruthy();
  });

  it("sends it once, however many times the provider retries the notification", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-TEST-TOKEN";
    const payment = seedPayment({
      provider: "mercadopago",
      method: null,
      providerRef: "pref-456",
      reference: "LD-RECOV2",
      amountCents: 500,
      planId: "esencial",
    });

    stubProvider({
      id: 999,
      status: "rejected",
      status_detail: "cc_rejected_high_risk",
      transaction_amount: 5,
      external_reference: payment.reference,
    });

    const notify = () =>
      call(app.url, "/api/payments/webhook/mercadopago", {
        method: "POST",
        userId: null,
        body: { type: "payment", data: { id: "999" } },
      });

    await notify();
    await vi.waitFor(() => expect(emailMock.recoveries).toHaveLength(1));

    await notify();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(emailMock.recoveries).toHaveLength(1);
    expect(h.state.payments[payment.id].recoveryEmailCount).toBe(1);
  });

  it("does not email when the customer has no address (and says so to the operator)", async () => {
    const payment = seedPayment({ status: "failed", userId: null });

    const res = await call(app.url, `/api/payments/${payment.id}/payment-link`, {
      method: "POST",
      userId: users.platformOps.id,
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("correo");
    expect(emailMock.recoveries).toHaveLength(0);
  });

  it("lets platform staff resend the link, and refuses a customer", async () => {
    const payment = seedPayment({
      status: "failed",
      reference: "LD-RECOV3",
      redirectUrl: "https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id=pref-789",
      amountCents: 500,
      planId: "esencial",
    });

    const refused = await call(app.url, `/api/payments/${payment.id}/payment-link`, {
      method: "POST",
      userId: users.adminA.id,
    });
    expect(refused.status).toBe(403);
    expect(emailMock.recoveries).toHaveLength(0);

    const ok = await call(app.url, `/api/payments/${payment.id}/payment-link`, {
      method: "POST",
      userId: users.platformOps.id,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.sentTo).toBe(users.adminA.email);
    expect(emailMock.recoveries).toHaveLength(1);
    // An operator resend is deliberate: it still counts.
    expect(h.state.payments[payment.id].recoveryEmailCount).toBe(1);
  });

  it("pairs a later transfer with the order the card attempt left behind", async () => {
    const payment = seedPayment({
      provider: "mercadopago",
      method: null,
      providerRef: "pref-pair",
      reference: "LD-PAIR01",
      status: "failed",
      amountCents: 500,
      planId: "esencial",
      failureReason: "El proveedor de pagos marcó la operación como de riesgo alto.",
    });

    const res = await call(app.url, `/api/payments/${payment.id}/confirm-offline`, {
      method: "POST",
      userId: users.platformOps.id,
      body: { method: "transferencia", note: "Operación BCP 123456" },
    });

    expect(res.status).toBe(200);
    expect(res.body.payment.status).toBe("paid");

    const row = h.state.payments[payment.id];
    // Where the order started is kept; how the money arrived is added.
    expect(row.provider).toBe("mercadopago");
    expect(row.method).toBe("transferencia");
    expect(row.confirmedByUserId).toBe(users.platformOps.id);
    expect(row.failureReason).toBeNull();
    expect(row.raw.manualConfirmation.note).toBe("Operación BCP 123456");
    expect(row.paidAt).toBeTruthy();
    // Same entitlement path as a provider-approved charge.
    expect(h.calls.updateBusiness.at(-1)![1].subscriptionPlan).toBe("esencial");
    expect(emailMock.receipts).toHaveLength(1);
  });

  it("refuses to mark a card charge as received by hand", async () => {
    const payment = seedPayment({ provider: "mercadopago", method: null, status: "failed" });

    const res = await call(app.url, `/api/payments/${payment.id}/confirm-offline`, {
      method: "POST",
      userId: users.platformOps.id,
      body: { method: "tarjeta" },
    });

    expect(res.status).toBe(400);
    expect(h.state.payments[payment.id].status).toBe("failed");
    expect(h.calls.updateBusiness).toBeUndefined();
  });

  it("keeps the confirmation for platform staff only", async () => {
    const payment = seedPayment({ provider: "mercadopago", method: null, status: "failed" });

    const res = await call(app.url, `/api/payments/${payment.id}/confirm-offline`, {
      method: "POST",
      userId: users.adminA.id,
      body: { method: "yape" },
    });

    expect(res.status).toBe(403);
    expect(h.state.payments[payment.id].status).toBe("failed");
    expect(h.calls.updateBusiness).toBeUndefined();
  });
});

/** Money that arrived with no order behind it: the console records it. */
describe("POST /api/payments/manual - a payment with no checkout", () => {
  it("records it, credits the plan and emails the receipt to the account owner", async () => {
    const res = await call(app.url, "/api/payments/manual", {
      method: "POST",
      userId: users.platformOps.id,
      body: {
        businessId: A,
        planId: "profesional",
        period: "monthly",
        method: "yape",
        amountCents: 2900,
        note: "Yape 998877",
      },
    });

    expect(res.status).toBe(201);
    expect(res.body.payment.status).toBe("paid");
    expect(res.body.payment.provider).toBe("manual");
    expect(h.calls.createPayment[0][0]).toMatchObject({
      businessId: A,
      planId: "profesional",
      amountCents: 2900,
      method: "yape",
      // The receipt goes to the account owner, not to the operator who typed it.
      userId: users.adminA.id,
    });
    expect(h.calls.updateBusiness.at(-1)![1].subscriptionPlan).toBe("profesional");
    expect(emailMock.receipts).toHaveLength(1);
  });

  it("refuses a customer, and the publicly shared demo account", async () => {
    for (const userId of [users.adminA.id, users.demoAdmin.id]) {
      const res = await call(app.url, "/api/payments/manual", {
        method: "POST",
        userId,
        body: { businessId: A, planId: "profesional", period: "monthly", method: "yape" },
      });
      expect(res.status).toBe(403);
    }
    expect(h.calls.createPayment).toBeUndefined();
  });

  it("rejects a card as the method (the provider owns that record)", async () => {
    const res = await call(app.url, "/api/payments/manual", {
      method: "POST",
      userId: users.platformOps.id,
      body: { businessId: A, planId: "profesional", period: "monthly", method: "tarjeta" },
    });

    expect(res.status).toBe(400);
    expect(h.calls.createPayment).toBeUndefined();
  });
});

