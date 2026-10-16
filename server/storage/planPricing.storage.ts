import { asc, eq } from "drizzle-orm";

import { planPricing, type PlanPricing } from "@shared/schema";

import { db } from "../db";

/**
 * Price overrides per paid plan (Phase 2.7, step 4).
 *
 * Only the *paid* plans can be overridden, and a missing row means "keep the price
 * from `shared/plans.ts`" - so an empty table is a working price list, which is what
 * a fresh database has.
 *
 * `savePlanPricing` upserts a whole set at once because that is how the console
 * saves it: one screen, one save, one audit entry.
 */

/** What a caller may write for one plan. */
export interface PlanPricingInput {
  planId: string;
  monthlyCents: number;
  annualCents: number;
  updatedByUserId?: string | null;
}

export const planPricingStorage = {
  async listPlanPricing(): Promise<PlanPricing[]> {
    return await db.select().from(planPricing).orderBy(asc(planPricing.planId));
  },

  async getPlanPricing(planId: string): Promise<PlanPricing | undefined> {
    const [row] = await db.select().from(planPricing).where(eq(planPricing.planId, planId));
    return row;
  },

  /** Upserts one plan's prices. */
  async savePlanPricing(input: PlanPricingInput): Promise<PlanPricing> {
    const { planId, monthlyCents, annualCents, updatedByUserId } = input;
    const [row] = await db
      .insert(planPricing)
      .values({ planId, monthlyCents, annualCents, updatedByUserId: updatedByUserId ?? null })
      .onConflictDoUpdate({
        target: planPricing.planId,
        set: {
          monthlyCents,
          annualCents,
          updatedByUserId: updatedByUserId ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  },

  /** Removes the override, so the plan goes back to the catalogue price. */
  async resetPlanPricing(planId: string): Promise<boolean> {
    const rows = await db.delete(planPricing).where(eq(planPricing.planId, planId)).returning();
    return rows.length > 0;
  },
};
