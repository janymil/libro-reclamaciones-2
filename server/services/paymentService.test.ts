import { describe, it, expect } from "vitest";

import type { Business } from "@shared/schema";
import { applyPaidPeriod, buildPayerProfile, newPaymentReference } from "./paymentService";

/**
 * Billing arithmetic tests (Phase 2.7).
 *
 * `applyPaidPeriod` decides how long a paying customer gets, so it is the
 * highest-risk pure function of the payment flow: getting it wrong either gives
 * away free months or takes days away from someone who renewed early.
 */

const business = (overrides: Partial<Business> = {}): Business =>
  ({
    id: "b1",
    ruc: "12345678901",
    businessName: "Demo SAC",
    address: "Av. Siempreviva 742",
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
    ...overrides,
  }) as Business;

const NOW = new Date("2026-06-15T12:00:00.000Z");

/**
 * The payer profile is the part of the checkout Mercado Pago's antifraud engine
 * reads. It must carry what the customer already told us and nothing invented.
 */
describe("buildPayerProfile", () => {
  it("sends the account name plus the company RUC and phone", () => {
    expect(buildPayerProfile(business({ phone: "965403196" }), {
      userFirstName: "Ana",
      userLastName: "Sotomayor",
    })).toEqual({
      firstName: "Ana",
      lastName: "Sotomayor",
      identification: { type: "RUC", number: "12345678901" },
      phone: "965403196",
    });
  });

  it("leaves out what the panel does not know instead of inventing it", () => {
    const payer = buildPayerProfile(business({ phone: null }), { userFirstName: "Ana" });
    expect(payer.phone).toBeUndefined();
    expect(payer.lastName).toBeUndefined();
    expect(payer.identification).toEqual({ type: "RUC", number: "12345678901" });
  });
});

describe("applyPaidPeriod", () => {
  it("gives one month from today to an active business with no period yet", () => {
    const result = applyPaidPeriod(business(), "profesional", "monthly", NOW);
    expect(result.subscriptionPlan).toBe("profesional");
    expect(result.planPeriod).toBe("monthly");
    expect(result.subscriptionStatus).toBe("active");
    expect(result.currentPeriodEnd.toISOString()).toBe("2026-07-15T12:00:00.000Z");
  });

  it("gives a full year for the annual period", () => {
    const result = applyPaidPeriod(business(), "corporativo", "annual", NOW);
    expect(result.currentPeriodEnd.toISOString()).toBe("2027-06-15T12:00:00.000Z");
  });

  it("stacks a renewal on top of the remaining paid period (paying early never loses days)", () => {
    const existing = business({ currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z") });
    const result = applyPaidPeriod(existing, "profesional", "monthly", NOW);
    expect(result.currentPeriodEnd.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("starts the year after the month already paid when the same plan is switched to annual", () => {
    // The reported case: Básico mensual, and two weeks later the customer wants
    // the SAME plan for a year. The year must start when the remaining month
    // ends, not today - otherwise they lose the fortnight they already paid for.
    const twoWeeksIn = business({ currentPeriodEnd: new Date("2026-06-29T12:00:00.000Z") });

    const result = applyPaidPeriod(twoWeeksIn, "esencial", "annual", NOW);

    expect(result.subscriptionPlan).toBe("esencial");
    expect(result.planPeriod).toBe("annual");
    // 2026-06-29 (the paid month ends) + 12 months.
    expect(result.currentPeriodEnd.toISOString()).toBe("2027-06-29T12:00:00.000Z");
  });

  it("starts from today when the previous period already lapsed", () => {
    const lapsed = business({ currentPeriodEnd: new Date("2026-05-01T00:00:00.000Z") });
    const result = applyPaidPeriod(lapsed, "esencial", "monthly", NOW);
    expect(result.currentPeriodEnd.toISOString()).toBe("2026-07-15T12:00:00.000Z");
  });

  it("keeps the free trial running and starts the paid month when it ends", () => {
    const trialing = business({
      subscriptionStatus: "trialing",
      trialEndsAt: new Date("2026-06-20T00:00:00.000Z"),
    });
    const result = applyPaidPeriod(trialing, "profesional", "monthly", NOW);

    // Still trialing, and the month starts where the trial ends - the customer
    // keeps the 5 remaining free days they were promised.
    expect(result.subscriptionStatus).toBe("trialing");
    expect(result.currentPeriodEnd.toISOString()).toBe("2026-07-20T00:00:00.000Z");
  });

  it("activates the plan when the trial window has already passed", () => {
    const expiredTrial = business({
      subscriptionStatus: "trialing",
      trialEndsAt: new Date("2026-06-01T00:00:00.000Z"),
    });
    const result = applyPaidPeriod(expiredTrial, "profesional", "monthly", NOW);
    expect(result.subscriptionStatus).toBe("active");
    expect(result.currentPeriodEnd.toISOString()).toBe("2026-07-15T12:00:00.000Z");
  });

  it("prefers the paid period over the trial when both are in the future", () => {
    const both = business({
      subscriptionStatus: "trialing",
      trialEndsAt: new Date("2026-06-20T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-07-01T00:00:00.000Z"),
    });
    const result = applyPaidPeriod(both, "profesional", "annual", NOW);
    expect(result.currentPeriodEnd.toISOString()).toBe("2027-07-01T00:00:00.000Z");
  });

  it("handles a month-end rollover (Jan 31 + 1 month)", () => {
    const result = applyPaidPeriod(
      business(),
      "esencial",
      "monthly",
      new Date("2026-01-31T00:00:00.000Z"),
    );
    // JS rolls Feb 31 over to March 2/3 depending on the year; either way the
    // result must be a real date, not an Invalid Date.
    expect(Number.isNaN(result.currentPeriodEnd.getTime())).toBe(false);
    expect(result.currentPeriodEnd.getTime()).toBeGreaterThan(
      new Date("2026-02-27T00:00:00.000Z").getTime(),
    );
  });

  it("never mutates the business it is given", () => {
    const original = business({ currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z") });
    applyPaidPeriod(original, "corporativo", "annual", NOW);
    expect(original.currentPeriodEnd?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(original.subscriptionPlan).toBe("esencial");
  });
});

describe("newPaymentReference", () => {
  it("looks like LD-XXXXXX and avoids ambiguous characters", () => {
    const reference = newPaymentReference();
    expect(reference).toMatch(/^LD-[A-HJ-NP-Z2-9]{6}$/);
  });

  it("does not repeat across calls", () => {
    const seen = new Set(Array.from({ length: 50 }, () => newPaymentReference()));
    expect(seen.size).toBe(50);
  });
});
