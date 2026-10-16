import { describe, it, expect } from "vitest";

import { PLANS } from "@shared/plans";

import { normalizePeriod, resolvePlanCardState } from "./plan-card-state";

/**
 * The plan cards of "Plan y Cuotas".
 *
 * The bug these lock down: a customer on Básico mensual (janymil@gmail.com) saw
 * the annual column priced at S/ 89 but the Básico card still disabled with
 * "Plan activo", so there was no way to buy the SAME plan for the year. The tier
 * and the billing period have to be judged separately.
 */

const basico = PLANS.esencial;
const pro = PLANS.profesional;
const gratis = PLANS.gratis;

/** A bought Básico plan; the period is what each test varies. */
function card(overrides: Partial<Parameters<typeof resolvePlanCardState>[0]> = {}) {
  return resolvePlanCardState({
    plan: basico,
    storedPlanId: basico.id,
    storedPeriod: "monthly",
    selectedPeriod: "monthly",
    isTrialing: false,
    ...overrides,
  });
}

describe("resolvePlanCardState - the reported bug", () => {
  it("lets a monthly customer buy the same plan for the year", () => {
    const state = card({ selectedPeriod: "annual" });

    expect(state.disabled).toBe(false);
    expect(state.label).toBe("Cambiar a anual");
    // It is still their plan: the badge and the highlighted border stay.
    expect(state.isCurrentPlan).toBe(true);
    expect(state.isActive).toBe(false);
  });

  it("lets an annual customer move to the monthly period too", () => {
    const state = card({ storedPeriod: "annual", selectedPeriod: "monthly" });

    expect(state.disabled).toBe(false);
    expect(state.label).toBe("Cambiar a mensual");
  });

  it("only blocks the exact plan and period the customer already owns", () => {
    const state = card({ storedPeriod: "annual", selectedPeriod: "annual" });

    expect(state.disabled).toBe(true);
    expect(state.label).toBe("Plan activo");
    expect(state.isActive).toBe(true);
  });
});

describe("resolvePlanCardState - the other cards", () => {
  it("sells a different plan regardless of the selected period", () => {
    const monthly = card({ plan: pro, selectedPeriod: "monthly" });
    const annual = card({ plan: pro, selectedPeriod: "annual" });

    expect(monthly.label).toBe("Pagar y activar Pro");
    expect(annual.label).toBe("Pagar y activar Pro");
    expect(monthly.disabled).toBe(false);
    expect(annual.disabled).toBe(false);
    expect(monthly.isCurrentPlan).toBe(false);
  });

  it("never charges for Gratis", () => {
    const state = card({ plan: gratis, storedPlanId: gratis.id, storedPeriod: "monthly" });

    expect(state.disabled).toBe(true);
    expect(state.label).toBe("Gratis, no se paga");
  });

  it("shows Gratis as current when that is the stored plan", () => {
    const state = card({ plan: gratis, storedPlanId: gratis.id });

    expect(state.isCurrentPlan).toBe(true);
    expect(state.disabled).toBe(true);
  });

  it("marks nothing current during the trial, so every paid card is buyable", () => {
    const state = card({ isTrialing: true });

    expect(state.isCurrentPlan).toBe(false);
    expect(state.disabled).toBe(false);
    expect(state.label).toBe(`Pagar y activar ${basico.name}`);
  });

  it("treats an unexpected stored period as monthly instead of blocking", () => {
    // `plan_period` is free text in the database; a legacy row must not turn the
    // monthly card into a dead end.
    expect(normalizePeriod("")).toBe("monthly");
    expect(normalizePeriod(null)).toBe("monthly");
    expect(normalizePeriod(undefined)).toBe("monthly");
    expect(normalizePeriod("cada-mes")).toBe("monthly");
    expect(normalizePeriod("annual")).toBe("annual");

    expect(card({ storedPeriod: "", selectedPeriod: "annual" }).disabled).toBe(false);
  });
});
