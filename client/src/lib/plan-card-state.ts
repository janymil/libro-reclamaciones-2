/**
 * What the "Plan y Cuotas" screen shows on each plan card.
 *
 * The subtlety this exists for: a plan and its BILLING PERIOD are two separate
 * decisions. The card used to be marked current - and its button disabled - as
 * soon as `storedPlanId === plan.id`, so a customer on Básico *mensual* could
 * never buy Básico *anual*: with the annual price on screen, the very same card
 * still read "Plan activo" and there was no clickable way to switch. The tier
 * and the period are now judged separately:
 *
 *   * the "Plan actual" badge and the highlighted border follow the TIER;
 *   * the button follows the TIER **and** the PERIOD - only the exact
 *     plan+period the customer already has is a no-op.
 *
 * Kept as a pure function (no React) so every combination - both periods, the
 * free plan, the trial, a legacy stored period - is unit-tested without a
 * browser: this is a billing surface, and a wrong label here means a customer
 * either cannot pay for what they want or is charged for what they already have.
 */

import type { PlanDefinition } from "@shared/plans";
import type { PlanPeriod } from "@shared/payments";

export interface PlanCardStateInput {
  /** The card's plan (catalogue id and name, for the button text). */
  plan: Pick<PlanDefinition, "id" | "name">;
  /** The catalogue id the business is actually on, as the API normalises it. */
  storedPlanId: string;
  /** The billing period the business actually bought (`monthly` | `annual`). */
  storedPeriod: string | null | undefined;
  /** The period currently selected in the Mensual / Anual toggle. */
  selectedPeriod: PlanPeriod;
  /** True while the free trial runs: it unlocks Pro, so no card is "current". */
  isTrialing: boolean;
}

export interface PlanCardState {
  /** Same tier as the stored plan: the card is highlighted and badged. */
  isCurrentPlan: boolean;
  /** Same tier AND same period: there is nothing left to buy on this card. */
  isActive: boolean;
  /** The action button cannot be clicked. */
  disabled: boolean;
  /** Button text, already in Spanish. */
  label: string;
}

/** The stored column is free text: anything unexpected reads as monthly. */
export function normalizePeriod(period: string | null | undefined): PlanPeriod {
  return period === "annual" ? "annual" : "monthly";
}

export function resolvePlanCardState({
  plan,
  storedPlanId,
  storedPeriod,
  selectedPeriod,
  isTrialing,
}: PlanCardStateInput): PlanCardState {
  const isFree = plan.id === "gratis";
  // During the trial the effective plan is Pro, so showing a paid card as
  // "current" would hide the fact that the customer has not bought anything yet.
  const isCurrentPlan = !isTrialing && plan.id === storedPlanId;
  const isActive = isCurrentPlan && normalizePeriod(storedPeriod) === selectedPeriod;

  if (isFree) {
    return { isCurrentPlan, isActive, disabled: true, label: "Gratis, no se paga" };
  }

  if (isActive) {
    return { isCurrentPlan, isActive, disabled: true, label: "Plan activo" };
  }

  if (isCurrentPlan) {
    // Same plan, other period: the way out of a monthly plan into the annual
    // price (or back), which is exactly what used to be impossible.
    return {
      isCurrentPlan,
      isActive,
      disabled: false,
      label: `Cambiar a ${selectedPeriod === "annual" ? "anual" : "mensual"}`,
    };
  }

  return { isCurrentPlan, isActive, disabled: false, label: `Pagar y activar ${plan.name}` };
}
