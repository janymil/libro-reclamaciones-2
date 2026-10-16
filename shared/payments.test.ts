import { describe, it, expect } from "vitest";

import {
  PAYMENT_METHODS,
  PAYMENT_PROVIDERS,
  PAYMENT_STATUS_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  availablePaymentProviders,
  buildPaymentReference,
  centsToSoles,
  computePeriodEnd,
  estimateNetCents,
  getPaymentProvider,
  isPaymentProviderId,
  isPaymentSettled,
  isPaymentStatus,
  isPaymentSuccessful,
  isPlanPeriod,
  isSubscriptionLive,
  isSubscriptionStatus,
  isPubliclyReachableBaseUrl,
  periodMonths,
  planAmountCents,
  PLAN_REFERENCE_CODES,
  providerSupportsRecurring,
  recurrenceForPeriod,
  referenceSuffix,
  resolvePlanFromAmount,
  resolvePlanFromCode,
  solesToCents,
} from "./payments";

/**
 * Regression tests for the Peruvian payment catalog and the money helpers.
 *
 * Money is stored in integer céntimos, so the conversion round-trips must be
 * exact and the period arithmetic must survive month ends (Jan 31 -> Feb 28).
 */

describe("money conversion (integer céntimos, never floats)", () => {
  it("converts the catalogue prices exactly", () => {
    expect(solesToCents(15)).toBe(1500);
    expect(solesToCents(29)).toBe(2900);
    expect(solesToCents(89)).toBe(8900);
    expect(solesToCents(189)).toBe(18900);
  });

  it("rounds away float noise instead of truncating", () => {
    // 3199.9999999999995 must become 320000, not 319999.
    expect(solesToCents(3199.9999999999995)).toBe(320000);
    expect(solesToCents(0.1 + 0.2)).toBe(30);
  });

  it("round-trips cents -> soles -> cents", () => {
    expect(centsToSoles(1500)).toBe(15);
    expect(solesToCents(centsToSoles(9937))).toBe(9937);
  });
});

describe("planAmountCents", () => {
  it("uses the monthly price for a monthly period", () => {
    expect(planAmountCents("esencial", "monthly")).toBe(1500);
    expect(planAmountCents("profesional", "monthly")).toBe(2900);
    expect(planAmountCents("corporativo", "monthly")).toBe(6900);
  });

  it("uses the annual price (about 50% off vs 12 months) for an annual period", () => {
    const annual = planAmountCents("profesional", "annual");
    expect(annual).toBe(18900);
    expect(annual).toBeLessThan(planAmountCents("profesional", "monthly") * 12);
  });

  it("falls back to Gratis instead of throwing on an unknown plan id", () => {
    expect(planAmountCents("plan-inventado", "monthly")).toBe(0);
  });

  it("prices the free plan at exactly zero, monthly and annual", () => {
    expect(planAmountCents("gratis", "monthly")).toBe(0);
    expect(planAmountCents("gratis", "annual")).toBe(0);
  });
});

describe("provider catalog", () => {
  it("only offers fully wired providers in the checkout screen", () => {
    const available = availablePaymentProviders().map((provider) => provider.id);
    expect(available).toEqual(["mercadopago", "manual"]);
    expect(available).not.toContain("culqi");
    expect(available).not.toContain("niubiz");
    expect(available).not.toContain("izipay");
  });

  it("always documents what a not-yet-wired provider is missing", () => {
    const notWired = PAYMENT_PROVIDERS.filter((provider) => !provider.available);
    expect(notWired.length).toBeGreaterThan(0);
    for (const provider of notWired) {
      expect(provider.requirement).toBeTruthy();
    }
  });

  it("documents the contract-only providers instead of pretending they work", () => {
    const niubiz = getPaymentProvider("niubiz");
    expect(niubiz?.selfServe).toBe(false);
    expect(niubiz?.available).toBe(false);
    expect(niubiz?.envKeys.length).toBeGreaterThan(0);
  });

  it("covers Yape and cards through Mercado Pago, the widest single integration", () => {
    const mercadopago = getPaymentProvider("mercadopago");
    expect(mercadopago?.methods).toContain("yape");
    expect(mercadopago?.methods).toContain("plin");
    expect(mercadopago?.methods).toContain("tarjeta");
  });

  it("rejects unknown ids and exposes every method it lists", () => {
    expect(isPaymentProviderId("mercadopago")).toBe(true);
    expect(isPaymentProviderId("stripe")).toBe(false);

    for (const provider of PAYMENT_PROVIDERS) {
      for (const method of provider.methods) {
        expect(PAYMENT_METHODS[method]).toBeDefined();
      }
    }
  });
});

describe("payment lifecycle", () => {
  it("treats only 'paid' as successful", () => {
    expect(isPaymentSuccessful("paid")).toBe(true);
    expect(isPaymentSuccessful("pending")).toBe(false);
    expect(isPaymentSuccessful("refunded")).toBe(false);
  });

  it("treats paid and refunded as settled (nothing more will happen)", () => {
    expect(isPaymentSettled("paid")).toBe(true);
    expect(isPaymentSettled("refunded")).toBe(true);
    expect(isPaymentSettled("pending")).toBe(false);
    expect(isPaymentSettled("expired")).toBe(false);
  });

  it("labels every status in Spanish for the UI", () => {
    for (const status of ["pending", "paid", "failed", "expired", "refunded"] as const) {
      expect(PAYMENT_STATUS_LABELS[status]).toBeTruthy();
    }
    expect(isPaymentStatus("paid")).toBe(true);
    expect(isPaymentStatus("inventado")).toBe(false);
  });
});

describe("reference generation", () => {
  it("never emits ambiguous characters (no O/0, no I/1)", () => {
    const suffix = referenceSuffix(new Uint8Array([0, 1, 2, 3, 4, 5, 31]));
    expect(suffix).toHaveLength(6);
    expect(suffix).toMatch(/^[A-HJ-NP-Z2-9]+$/);
  });

  it("is deterministic for a fixed byte sequence and prefixed with LD-", () => {
    const bytes = new Uint8Array([10, 20, 30, 40, 50, 60]);
    expect(referenceSuffix(bytes)).toBe(referenceSuffix(bytes));
    expect(buildPaymentReference(referenceSuffix(bytes))).toBe(`LD-${referenceSuffix(bytes)}`);
    expect(buildPaymentReference("ab12cd")).toBe("LD-AB12CD");
  });
});

describe("billing period arithmetic", () => {
  it("maps periods to months", () => {
    expect(periodMonths("monthly")).toBe(1);
    expect(periodMonths("annual")).toBe(12);
    expect(isPlanPeriod("annual")).toBe(true);
    expect(isPlanPeriod("weekly")).toBe(false);
  });

  it("adds one month, rolling over the year", () => {
    expect(computePeriodEnd(new Date("2026-01-15T00:00:00.000Z"), "monthly").toISOString())
      .toBe("2026-02-15T00:00:00.000Z");
    expect(computePeriodEnd(new Date("2026-12-01T00:00:00.000Z"), "monthly").toISOString())
      .toBe("2027-01-01T00:00:00.000Z");
  });

  it("adds one year for the annual plan", () => {
    expect(computePeriodEnd(new Date("2026-03-01T00:00:00.000Z"), "annual").toISOString())
      .toBe("2027-03-01T00:00:00.000Z");
  });

  it("does not mutate the start date", () => {
    const start = new Date("2026-05-10T00:00:00.000Z");
    computePeriodEnd(start, "annual");
    expect(start.toISOString()).toBe("2026-05-10T00:00:00.000Z");
  });
});

describe("provider fee estimates", () => {
  it("keeps the whole amount for the manual (bank transfer) provider", () => {
    expect(estimateNetCents("manual", 2900)).toBe(2900);
  });

  it("keeps less than the gross amount for a card provider", () => {
    const net = estimateNetCents("culqi", 2900);
    expect(net).toBeGreaterThan(0);
    expect(net).toBeLessThan(2900);
  });

  it("never returns a negative net even for a tiny payment", () => {
    expect(estimateNetCents("niubiz", 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Recurring subscriptions
// ---------------------------------------------------------------------------

describe("recurrenceForPeriod", () => {
  it("asks for one charge a month on the monthly plan", () => {
    expect(recurrenceForPeriod("monthly")).toEqual({ frequency: 1, frequencyType: "months" });
  });

  it("expresses a year as 12 months, which is how the provider bills yearly", () => {
    expect(recurrenceForPeriod("annual")).toEqual({ frequency: 12, frequencyType: "months" });
  });
});

describe("recurring capability", () => {
  it("marks only Mercado Pago as able to charge automatically", () => {
    expect(providerSupportsRecurring("mercadopago")).toBe(true);
    expect(providerSupportsRecurring("manual")).toBe(false);
    expect(providerSupportsRecurring("culqi")).toBe(false);
  });

  it("answers false for a provider that does not exist instead of throwing", () => {
    expect(providerSupportsRecurring("stripe")).toBe(false);
  });

  it("declares the capability on every catalog entry", () => {
    for (const provider of PAYMENT_PROVIDERS) {
      expect(typeof provider.supportsRecurring).toBe("boolean");
    }
  });
});

describe("subscription lifecycle", () => {
  it("only lets an authorised agreement keep charging", () => {
    expect(isSubscriptionLive("authorized")).toBe(true);
    expect(isSubscriptionLive("pending")).toBe(false);
    expect(isSubscriptionLive("paused")).toBe(false);
    expect(isSubscriptionLive("cancelled")).toBe(false);
  });

  it("recognises the four states and rejects anything else", () => {
    for (const status of ["pending", "authorized", "paused", "cancelled"] as const) {
      expect(isSubscriptionStatus(status)).toBe(true);
      expect(SUBSCRIPTION_STATUS_LABELS[status]).toBeTruthy();
    }
    expect(isSubscriptionStatus("activa")).toBe(false);
  });

  it("says in plain Spanish that a live subscription renews by itself", () => {
    expect(SUBSCRIPTION_STATUS_LABELS.authorized).toContain("renueva");
  });
});

// ---------------------------------------------------------------------------
// Plans created in the Mercado Pago panel (public subscription links)
// ---------------------------------------------------------------------------

describe("resolvePlanFromCode - Mercado Pago panel plan codes", () => {
  it("maps the panel code of every paid plan to a plan and a period", () => {
    expect(resolvePlanFromCode("LD-ESENCIAL-M")).toEqual({ planId: "esencial", period: "monthly" });
    expect(resolvePlanFromCode("LD-ESENCIAL-A")).toEqual({ planId: "esencial", period: "annual" });
    expect(resolvePlanFromCode("LD-PROFESIONAL-M")).toEqual({ planId: "profesional", period: "monthly" });
    expect(resolvePlanFromCode("LD-PROFESIONAL-A")).toEqual({ planId: "profesional", period: "annual" });
    expect(resolvePlanFromCode("LD-CORPORATIVO-M")).toEqual({ planId: "corporativo", period: "monthly" });
    expect(resolvePlanFromCode("LD-CORPORATIVO-A")).toEqual({ planId: "corporativo", period: "annual" });
  });

  it("tolerates stray spaces and lower case, because the panel is typed by hand", () => {
    expect(resolvePlanFromCode("  LD-profesional-a ")).toEqual({
      planId: "profesional",
      period: "annual",
    });
  });

  it("still recognises codes written before the LibroVirtual -> LibroDigital rebrand", () => {
    // A plan configured in the Mercado Pago panel months ago carries the old
    // prefix; it must keep activating rather than being dropped on the floor.
    expect(resolvePlanFromCode("LV-PROFESIONAL-A")).toEqual({
      planId: "profesional",
      period: "annual",
    });
    expect(resolvePlanFromCode("lv-esencial-m")).toEqual({ planId: "esencial", period: "monthly" });
  });

  it("returns undefined for a reference the app does not know", () => {
    // An in-app subscription reference must NOT be mistaken for a plan code,
    // under either the current or the pre-rebrand prefix.
    expect(resolvePlanFromCode("LD-8F3A2B")).toBeUndefined();
    expect(resolvePlanFromCode("LV-8F3A2B")).toBeUndefined();
    expect(resolvePlanFromCode(undefined)).toBeUndefined();
    expect(resolvePlanFromCode(42)).toBeUndefined();
  });

  it("never claims the free plan, which is not sold in the panel", () => {
    const codes = Object.values(PLAN_REFERENCE_CODES).map((entry) => entry.planId);
    expect(codes).not.toContain("gratis");
  });
});

describe("resolvePlanFromAmount - when the panel code did not survive", () => {
  it("recognises a monthly purchase from its price", () => {
    expect(resolvePlanFromAmount(1500, "monthly")).toEqual({ planId: "esencial", period: "monthly" });
    expect(resolvePlanFromAmount(2900, "monthly")).toEqual({ planId: "profesional", period: "monthly" });
    expect(resolvePlanFromAmount(6900, "monthly")).toEqual({ planId: "corporativo", period: "monthly" });
  });

  it("recognises a yearly purchase from its price", () => {
    expect(resolvePlanFromAmount(8900, "annual")).toEqual({ planId: "esencial", period: "annual" });
    expect(resolvePlanFromAmount(18900, "annual")).toEqual({ planId: "profesional", period: "annual" });
    expect(resolvePlanFromAmount(42900, "annual")).toEqual({ planId: "corporativo", period: "annual" });
  });

  it("does not confuse a tier's yearly price with another tier's monthly price", () => {
    // Empresarial monthly is 69, and a Básico yearly launch offer would also be 69:
    // the period is what keeps them apart.
    expect(resolvePlanFromAmount(6900, "annual")).toBeUndefined();
    expect(resolvePlanFromAmount(8900, "monthly")).toBeUndefined();
  });

  it("refuses to guess for an amount that matches nothing", () => {
    expect(resolvePlanFromAmount(1234, "monthly")).toBeUndefined();
    expect(resolvePlanFromAmount(0, "monthly")).toBeUndefined();
    expect(resolvePlanFromAmount(-100, "monthly")).toBeUndefined();
    expect(resolvePlanFromAmount(Number.NaN, "monthly")).toBeUndefined();
  });
});

describe("isPubliclyReachableBaseUrl - can the provider call us back?", () => {
  it("accepts a real HTTPS domain", () => {
    expect(isPubliclyReachableBaseUrl("https://librodigital.pe")).toBe(true);
    expect(isPubliclyReachableBaseUrl("https://libro.midominio.com")).toBe(true);
  });

  it("rejects localhost, because Mercado Pago can never reach it", () => {
    // The exact value found in a local .env - the silent killer of webhooks.
    expect(isPubliclyReachableBaseUrl("http://localhost:5000")).toBe(false);
    expect(isPubliclyReachableBaseUrl("https://localhost:5000")).toBe(false);
    expect(isPubliclyReachableBaseUrl("http://127.0.0.1:5000")).toBe(false);
    expect(isPubliclyReachableBaseUrl("https://[::1]:5000")).toBe(false);
    expect(isPubliclyReachableBaseUrl("https://caja.local")).toBe(false);
  });

  it("rejects plain HTTP, which Mercado Pago does not deliver to", () => {
    expect(isPubliclyReachableBaseUrl("http://librodigital.pe")).toBe(false);
  });

  it("rejects junk instead of throwing", () => {
    expect(isPubliclyReachableBaseUrl("")).toBe(false);
    expect(isPubliclyReachableBaseUrl("localhost:5000")).toBe(false);
    expect(isPubliclyReachableBaseUrl("no-es-una-url")).toBe(false);
  });
});
