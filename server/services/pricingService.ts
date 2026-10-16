import { PLAN_LIST, TRIAL_DAYS, getPlan, isPlanId } from "@shared/plans";
import type { PlanDefinition } from "@shared/plans";
import type { PlanPeriod } from "@shared/payments";
import type { PlanPricing } from "@shared/schema";

import { storage } from "../storage";
import { recordPlatformChange, type ConsoleActor } from "./platformAuditService";
import { clearPlatformSettingsCache, getTrialDays } from "./platformSettingsService";

/**
 * The price list (Phase 2.7, step 4).
 *
 * `shared/plans.ts` answers "what does a plan include"; this service answers "what do
 * we charge for it today" and is the ONLY thing the server charges from. Both the
 * checkout and the public catalogue (`GET /api/plans`) are built from these values,
 * so the price a customer reads and the amount we charge cannot drift apart - which
 * is the failure mode that would make an operator distrust the whole console.
 *
 * A plan with no row in `plan_pricing` keeps the catalogue price, so an empty table
 * is a valid, intentional state ("as shipped") and not "prices are missing".
 *
 * Reads are cached (`CACHE_TTL_MS`) because a checkout reads prices more than once;
 * writes invalidate it immediately.
 */

const CACHE_TTL_MS = 30_000;

/** The paid plans an operator may reprice (the free plan is always free). */
export const REPRICEABLE_PLAN_IDS = PLAN_LIST.filter((plan) => plan.priceMonthly > 0).map(
  (plan) => plan.id,
);

export interface PlanPriceView {
  planId: string;
  name: string;
  /** What we charge now, in céntimos. */
  monthlyCents: number;
  annualCents: number;
  /** What the code ships with (shown for reference in the console). */
  catalogueMonthlyCents: number;
  catalogueAnnualCents: number;
  /** True when the console overrode the catalogue price. */
  isOverride: boolean;
}

export interface PlanPricingView {
  plans: PlanPriceView[];
  trialDays: number;
  trialDaysIsOverride: boolean;
}

let cache: { at: number; rows: PlanPricing[] } | null = null;

/** Drops the cache. Called after a write and by tests. */
export function clearPlanPricingCache(): void {
  cache = null;
}

async function loadOverrides(): Promise<PlanPricing[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.rows;
  }
  let rows: PlanPricing[] = [];
  try {
    rows = await storage.listPlanPricing();
  } catch (error) {
    // A missing pricing table must not stop a checkout: log it and charge the
    // catalogue price, exactly as a fresh database does.
    console.error(
      '[payments] no se pudo leer plan_pricing (¿migración 0009 sin aplicar?). ' +
        'Se usa el precio del catálogo.',
      error,
    );
    return [];
  }
  cache = { at: Date.now(), rows };
  return rows;
}

/** Catalogue price in céntimos, from `shared/plans.ts` (soles -> céntimos). */
export function catalogueAmountCents(planId: string, period: PlanPeriod): number {
  const plan = getPlan(planId);
  const soles = period === 'annual' ? plan.priceAnnual : plan.priceMonthly;
  return Math.round(soles * 100);
}

/**
 * What we charge for a plan/period right now.
 *
 * The free plan stays free: an override can never turn it into a paid one, and a
 * `0` override is ignored rather than honoured, because a zero-amount checkout can
 * never be collected.
 */
export async function effectivePlanAmountCents(
  planId: string,
  period: PlanPeriod,
): Promise<number> {
  const catalogue = catalogueAmountCents(planId, period);
  if (catalogue <= 0) {
    return catalogue;
  }
  const override = (await loadOverrides()).find((row) => row.planId === planId);
  if (!override) {
    return catalogue;
  }
  const value = period === 'annual' ? override.annualCents : override.monthlyCents;
  return Number.isFinite(value) && value > 0 ? value : catalogue;
}

/** The plan catalogue with the effective prices applied (the public `/api/plans`). */
export async function effectivePlans(): Promise<PlanDefinition[]> {
  const overrides = await loadOverrides();
  if (overrides.length === 0) {
    return PLAN_LIST;
  }

  return PLAN_LIST.map((plan) => {
    const override = overrides.find((row) => row.planId === plan.id);
    if (!override || plan.priceMonthly <= 0) {
      return plan;
    }
    return {
      ...plan,
      priceMonthly: override.monthlyCents / 100,
      priceAnnual: override.annualCents / 100,
    };
  });
}

/** The console's view of the price list: current, catalogue and whether overridden. */
export async function readPlanPricing(): Promise<PlanPricingView> {
  const rows = await storage.listPlanPricing();
  const trialDays = await getTrialDays();

  return {
    plans: REPRICEABLE_PLAN_IDS.map((planId) => {
      const plan = getPlan(planId);
      const override = rows.find((row) => row.planId === planId);
      const catalogueMonthlyCents = catalogueAmountCents(planId, 'monthly');
      const catalogueAnnualCents = catalogueAmountCents(planId, 'annual');

      return {
        planId,
        name: plan.name,
        monthlyCents: override?.monthlyCents ?? catalogueMonthlyCents,
        annualCents: override?.annualCents ?? catalogueAnnualCents,
        catalogueMonthlyCents,
        catalogueAnnualCents,
        isOverride: Boolean(override),
      };
    }),
    trialDays,
    trialDaysIsOverride: trialDays !== TRIAL_DAYS,
  };
}

/**
 * Saves the price list and the trial length, then records the change.
 *
 * A price equal to the catalogue price REMOVES the override (the row is deleted):
 * keeping a row that says "the same as the default" would make the table drift from
 * the code and turn "what did we change?" into a diff of two numbers.
 */
export async function savePlanPricing(
  input: {
    prices: { planId: string; monthlyCents: number; annualCents: number }[];
    trialDays: number;
  },
  actor: ConsoleActor,
): Promise<{ overrides: number; trialDays: number }> {
  const before = await readPlanPricing();
  let overrides = 0;

  for (const price of input.prices) {
    if (!isPlanId(price.planId) || !REPRICEABLE_PLAN_IDS.includes(price.planId)) {
      continue;
    }
    const isDefault =
      price.monthlyCents === catalogueAmountCents(price.planId, 'monthly') &&
      price.annualCents === catalogueAmountCents(price.planId, 'annual');

    if (isDefault) {
      await storage.resetPlanPricing(price.planId);
      continue;
    }

    await storage.savePlanPricing({
      planId: price.planId,
      monthlyCents: price.monthlyCents,
      annualCents: price.annualCents,
      updatedByUserId: actor.userId,
    });
    overrides += 1;
  }

  // The trial length is the same commercial decision, so it is saved here and stored
  // with the rest of the platform settings.
  await storage.savePlatformSettings({ trialDays: input.trialDays }, actor.userId);
  clearPlanPricingCache();
  clearPlatformSettingsCache();

  await recordPlatformChange(actor, 'planes', describePricingChange(before, input), {
    before: before.plans.map((plan) => ({
      planId: plan.planId,
      monthlyCents: plan.monthlyCents,
      annualCents: plan.annualCents,
    })),
    after: input.prices,
    trialDaysBefore: before.trialDays,
    trialDaysAfter: input.trialDays,
  });

  return { overrides, trialDays: input.trialDays };
}

/** The one-line history entry: only what actually moved. */
function describePricingChange(
  before: PlanPricingView,
  input: {
    prices: { planId: string; monthlyCents: number; annualCents: number }[];
    trialDays: number;
  },
): string {
  const parts: string[] = [];

  for (const price of input.prices) {
    const previous = before.plans.find((plan) => plan.planId === price.planId);
    if (!previous) {
      continue;
    }
    if (previous.monthlyCents !== price.monthlyCents) {
      parts.push(
        `${previous.name} mensual S/ ${(previous.monthlyCents / 100).toFixed(2)} → S/ ${(price.monthlyCents / 100).toFixed(2)}`,
      );
    }
    if (previous.annualCents !== price.annualCents) {
      parts.push(
        `${previous.name} anual S/ ${(previous.annualCents / 100).toFixed(2)} → S/ ${(price.annualCents / 100).toFixed(2)}`,
      );
    }
  }

  if (before.trialDays !== input.trialDays) {
    parts.push(`prueba gratuita ${before.trialDays} → ${input.trialDays} días`);
  }

  return parts.length > 0 ? `Precios: ${parts.join('; ')}` : 'Precios: sin cambios efectivos';
}
