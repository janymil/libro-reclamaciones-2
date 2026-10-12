import { db } from "../db";
import { eq, and, desc } from "drizzle-orm";
import {
  type UserBusinessAccess,
  type InsertUserBusinessAccess,
  userBusinessAccess,
  businesses,
} from "@shared/schema";

/**
 * Multi-RUC access (Phase 2.7): the businesses one login may manage.
 *
 * users.businessId is the *active* business; this table records every granted
 * business so the header switcher can list them and the switch endpoint can
 * verify access.
 */
export const accessStorage = {
  async grantBusinessAccess(accessData: InsertUserBusinessAccess): Promise<UserBusinessAccess> {
    // Idempotent: re-granting existing access just refreshes the role
    const [existing] = await db
      .select()
      .from(userBusinessAccess)
      .where(and(
        eq(userBusinessAccess.userId, accessData.userId),
        eq(userBusinessAccess.businessId, accessData.businessId),
      ));

    if (existing) {
      if (accessData.role && accessData.role !== existing.role) {
        const [updated] = await db
          .update(userBusinessAccess)
          .set({ role: accessData.role })
          .where(eq(userBusinessAccess.id, existing.id))
          .returning();
        return updated;
      }
      return existing;
    }

    const [access] = await db
      .insert(userBusinessAccess)
      .values(accessData)
      .returning();
    return access;
  },

  async getUserBusinessAccess(userId: string): Promise<Array<UserBusinessAccess & { businessName: string; ruc: string }>> {
    return await db
      .select({
        id: userBusinessAccess.id,
        userId: userBusinessAccess.userId,
        businessId: userBusinessAccess.businessId,
        role: userBusinessAccess.role,
        createdAt: userBusinessAccess.createdAt,
        businessName: businesses.businessName,
        ruc: businesses.ruc,
      })
      .from(userBusinessAccess)
      .innerJoin(businesses, eq(businesses.id, userBusinessAccess.businessId))
      .where(eq(userBusinessAccess.userId, userId))
      .orderBy(desc(userBusinessAccess.createdAt));
  },

  async hasBusinessAccess(userId: string, businessId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: userBusinessAccess.id })
      .from(userBusinessAccess)
      .where(and(
        eq(userBusinessAccess.userId, userId),
        eq(userBusinessAccess.businessId, businessId),
      ));
    return Boolean(row);
  },
};
