import { describe, expect, it } from "vitest";

import {
  IGV_RATE_BPS,
  PRICES_INCLUDE_IGV_NOTE,
  formatIgvRate,
  igvBreakdown,
} from "./tax";

/**
 * The arithmetic the whole price list depends on.
 *
 * The invariant that matters is `subtotal + igv === total`, exactly, for every
 * price: SUNAT rejects a comprobante whose lines do not add up, and a customer
 * who paid S/ 25.00 must see S/ 25.00 as the total.
 */
describe("igvBreakdown", () => {
  it("splits a S/ 25.00 price into S/ 21.19 + S/ 3.81", () => {
    expect(igvBreakdown(2500)).toEqual({
      totalCents: 2500,
      subtotalCents: 2119,
      igvCents: 381,
      rateBps: 1800,
    });
  });

  it("splits the S/ 89 annual plan exactly", () => {
    expect(igvBreakdown(8900)).toEqual({
      totalCents: 8900,
      subtotalCents: 7542,
      igvCents: 1358,
      rateBps: 1800,
    });
  });

  it("keeps the parts adding up to the total for every price up to S/ 1,000", () => {
    for (let cents = 1; cents <= 100_000; cents += 7) {
      const split = igvBreakdown(cents);
      expect(split.subtotalCents + split.igvCents).toBe(cents);
      expect(split.subtotalCents).toBeGreaterThanOrEqual(0);
      expect(split.igvCents).toBeGreaterThanOrEqual(0);
    }
  });

  it("rounds the base once and lets the IGV absorb the céntimo", () => {
    // 10.00 / 1.18 = 8.4745... -> base 8.47, IGV 1.53 (not 1.52 + 8.48)
    expect(igvBreakdown(1000)).toMatchObject({ subtotalCents: 847, igvCents: 153 });
  });

  it("treats zero and negative amounts as zero", () => {
    expect(igvBreakdown(0)).toMatchObject({ subtotalCents: 0, igvCents: 0, totalCents: 0 });
    expect(igvBreakdown(-100)).toMatchObject({ subtotalCents: 0, igvCents: 0, totalCents: 0 });
  });

  it("supports a different rate (the 8% restaurant regime) without changing the total", () => {
    const split = igvBreakdown(2500, 800);
    expect(split.totalCents).toBe(2500);
    expect(split.subtotalCents + split.igvCents).toBe(2500);
    expect(split.subtotalCents).toBe(2315);
    expect(split.igvCents).toBe(185);
  });

  it("handles a zero rate as a pass-through", () => {
    expect(igvBreakdown(2500, 0)).toMatchObject({ subtotalCents: 2500, igvCents: 0 });
  });
});

describe("labels", () => {
  it("prints the standard rate", () => {
    expect(IGV_RATE_BPS).toBe(1800);
    expect(formatIgvRate()).toBe("18%");
  });

  it("states that prices already contain the tax", () => {
    expect(PRICES_INCLUDE_IGV_NOTE).toContain("IGV (18%) incluido");
  });
});
