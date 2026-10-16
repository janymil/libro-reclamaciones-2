import { describe, it, expect } from "vitest";

import {
  MAX_DISCOUNT_PERCENT,
  MIN_CHARGEABLE_CENTS,
  discountAmountOffCents,
  evaluateDiscount,
  normalizeDiscountCode,
  type DiscountRule,
} from "./discounts";

/**
 * Discount arithmetic. The two things that must never happen: charging MORE than
 * the customer was promised, and activating a plan on a payment of S/ 0.00.
 */

const rule = (overrides: Partial<DiscountRule> = {}): DiscountRule => ({
  code: "PRO10",
  kind: "percent",
  value: 10,
  planIds: [],
  maxRedemptions: null,
  redemptionCount: 0,
  expiresAt: null,
  isActive: true,
  ...overrides,
});

describe("normalizeDiscountCode", () => {
  it("accepts what a customer actually types", () => {
    expect(normalizeDiscountCode(" pro10 ")).toBe("PRO10");
    expect(normalizeDiscountCode("pro-10")).toBe("PRO10");
    expect(normalizeDiscountCode("Verano 2026!")).toBe("VERANO2026");
  });

  it("returns an empty string for anything that is not a code", () => {
    expect(normalizeDiscountCode(undefined)).toBe("");
    expect(normalizeDiscountCode(null)).toBe("");
    expect(normalizeDiscountCode(42)).toBe("");
    expect(normalizeDiscountCode("  ---  ")).toBe("");
  });
});

describe("discountAmountOffCents", () => {
  it("takes the percentage off, rounded up so we never overcharge", () => {
    expect(discountAmountOffCents({ kind: "percent", value: 10 }, 2900)).toBe(290);
    // 15% of 999 = 149.85 -> 150 off, so the customer pays 849.
    expect(discountAmountOffCents({ kind: "percent", value: 15 }, 999)).toBe(150);
  });

  it("treats a fixed discount as céntimos and never exceeds the price", () => {
    expect(discountAmountOffCents({ kind: "fixed", value: 1000 }, 2900)).toBe(1000);
    expect(discountAmountOffCents({ kind: "fixed", value: 9900 }, 2900)).toBe(2900);
  });

  it("clamps a percentage above 100 and ignores nonsense input", () => {
    expect(discountAmountOffCents({ kind: "percent", value: 500 }, 2900)).toBe(2900);
    expect(discountAmountOffCents({ kind: "percent", value: 10 }, 0)).toBe(0);
    expect(discountAmountOffCents({ kind: "percent", value: 10 }, Number.NaN)).toBe(0);
  });
});

describe("evaluateDiscount", () => {
  it("accepts an active code and reports what would be charged", () => {
    const result = evaluateDiscount(rule(), { planId: "profesional", amountCents: 2900 });

    expect(result.ok).toBe(true);
    expect(result.label).toBe("−10%");
    expect(result.amountOffCents).toBe(290);
    expect(result.finalAmountCents).toBe(2610);
  });

  it("refuses an inactive code", () => {
    const result = evaluateDiscount(rule({ isActive: false }), {
      planId: "profesional",
      amountCents: 2900,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/ya no está activo/i);
    expect(result.finalAmountCents).toBe(2900);
  });

  it("refuses an expired code, but accepts one that expires in the future", () => {
    const now = new Date("2026-06-01T12:00:00Z");

    const expired = evaluateDiscount(rule({ expiresAt: new Date("2026-05-31T23:59:59Z") }), {
      planId: "profesional",
      amountCents: 2900,
      now,
    });
    expect(expired.ok).toBe(false);
    expect(expired.reason).toMatch(/venció/i);

    const live = evaluateDiscount(rule({ expiresAt: new Date("2026-06-02T00:00:00Z") }), {
      planId: "profesional",
      amountCents: 2900,
      now,
    });
    expect(live.ok).toBe(true);
  });

  it("refuses a code scoped to another plan, and applies to every plan when empty", () => {
    expect(
      evaluateDiscount(rule({ planIds: ["corporativo"] }), {
        planId: "esencial",
        amountCents: 1500,
      }).reason,
    ).toMatch(/no aplica al plan/i);

    expect(
      evaluateDiscount(rule({ planIds: [] }), { planId: "corporativo", amountCents: 6900 }).ok,
    ).toBe(true);
  });

  it("allows the last redemption and rejects the one after it", () => {
    expect(
      evaluateDiscount(rule({ maxRedemptions: 5, redemptionCount: 4 }), {
        planId: "profesional",
        amountCents: 2900,
      }).ok,
    ).toBe(true);

    const exhausted = evaluateDiscount(rule({ maxRedemptions: 5, redemptionCount: 5 }), {
      planId: "profesional",
      amountCents: 2900,
    });
    expect(exhausted.ok).toBe(false);
    expect(exhausted.reason).toMatch(/agotó sus usos/i);
  });

  it("never lets a payment fall below the minimum chargeable amount", () => {
    // 100% off a S/ 29.00 plan would leave S/ 0.00 pending: nothing can charge it.
    const free = evaluateDiscount(rule({ value: MAX_DISCOUNT_PERCENT }), {
      planId: "profesional",
      amountCents: 2900,
    });

    expect(free.ok).toBe(false);
    expect(free.reason).toMatch(/mínimo cobrable/i);

    // A code that leaves exactly S/ 1.00 is accepted.
    const almost = evaluateDiscount(rule({ kind: "fixed", value: 2800 }), {
      planId: "profesional",
      amountCents: 2900,
    });
    expect(almost.ok).toBe(true);
    expect(almost.finalAmountCents).toBe(MIN_CHARGEABLE_CENTS);
  });

  it("refuses a code that changes nothing", () => {
    // A huge fixed discount is capped at the price, so it is refused by the minimum.
    expect(
      evaluateDiscount(rule({ kind: "fixed", value: 5000 }), {
        planId: "profesional",
        amountCents: 2900,
      }).ok,
    ).toBe(false);

    const zero = evaluateDiscount(rule({ kind: "percent", value: 0 }), {
      planId: "profesional",
      amountCents: 2900,
    });
    expect(zero.ok).toBe(false);
    expect(zero.reason).toMatch(/no descuenta nada/i);
  });

  it("refuses to discount a free plan", () => {
    const result = evaluateDiscount(rule(), { planId: "gratis", amountCents: 0 });

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/gratuito/i);
  });
});
