import { and, desc, eq, isNull, or, sql } from "drizzle-orm";

import { discountCodes, type DiscountCode, type InsertDiscountCode } from "@shared/schema";

import { db } from "../db";

/**
 * Discount codes (Phase 2.7, step 4).
 *
 * The rule that matters is `redeemDiscountCode`: counting a scarce thing with a
 * read-then-write loses redemptions under concurrency (two checkouts paying at the
 * same time both see "4 used, 1 left"), so the increment is a single conditional
 * UPDATE that returns no row when the cap is already reached. The caller treats
 * "no row" as "the code is exhausted", never as a database error.
 */
export const discountStorage = {
  async listDiscountCodes(limit = 200): Promise<DiscountCode[]> {
    return await db
      .select()
      .from(discountCodes)
      .orderBy(desc(discountCodes.createdAt))
      .limit(limit);
  },

  async getDiscountCode(id: string): Promise<DiscountCode | undefined> {
    const [row] = await db.select().from(discountCodes).where(eq(discountCodes.id, id));
    return row;
  },

  /** Lookup for a customer-typed code (already normalized to uppercase A-Z0-9). */
  async getDiscountCodeByCode(code: string): Promise<DiscountCode | undefined> {
    const [row] = await db.select().from(discountCodes).where(eq(discountCodes.code, code));
    return row;
  },

  async createDiscountCode(data: InsertDiscountCode): Promise<DiscountCode> {
    const [row] = await db.insert(discountCodes).values(data).returning();
    return row;
  },

  async updateDiscountCode(
    id: string,
    updates: Partial<InsertDiscountCode>,
  ): Promise<DiscountCode | undefined> {
    const [row] = await db
      .update(discountCodes)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(discountCodes.id, id))
      .returning();
    return row;
  },

  /**
   * Deletes a code that was never used. A code that has redemptions is kept: it is
   * part of the billing history (the payments that used it point at it).
   */
  async deleteDiscountCode(id: string): Promise<boolean> {
    const rows = await db
      .delete(discountCodes)
      .where(and(eq(discountCodes.id, id), eq(discountCodes.redemptionCount, 0)))
      .returning();
    return rows.length > 0;
  },

  /**
   * Counts one redemption, atomically and only while the cap allows it.
   *
   * Returns false when the code is already exhausted, which is the answer the
   * caller needs - the payment is already `paid` at that point, so this is a
   * bookkeeping decision, never a reason to fail a customer's payment.
   */
  async redeemDiscountCode(id: string): Promise<boolean> {
    const rows = await db
      .update(discountCodes)
      .set({ redemptionCount: sql`${discountCodes.redemptionCount} + 1`, updatedAt: new Date() })
      .where(
        and(
          eq(discountCodes.id, id),
          or(
            isNull(discountCodes.maxRedemptions),
            sql`${discountCodes.redemptionCount} < ${discountCodes.maxRedemptions}`,
          ),
        ),
      )
      .returning();
    return rows.length > 0;
  },
};
