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
  periodMonths,
  planAmountCents,
  providerSupportsRecurring,
  recurrenceForPeriod,
  referenceSuffix,
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

  it("is deterministic for a fixed byte sequence and prefixed with LV-", () => {
    const bytes = new Uint8Array([10, 20, 30, 40, 50, 60]);
    expect(referenceSuffix(bytes)).toBe(referenceSuffix(bytes));
    expect(buildPaymentReference(referenceSuffix(bytes))).toBe(`LV-${referenceSuffix(bytes)}`);
    expect(buildPaymentReference("ab12cd")).toBe("LV-AB12CD");
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
