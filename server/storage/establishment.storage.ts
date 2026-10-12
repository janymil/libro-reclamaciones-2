import { db } from "../db";
import { eq, and, asc } from "drizzle-orm";
import {
  type Establishment,
  type InsertEstablishment,
  establishments,
} from "@shared/schema";

/** Data access for the "establishment" aggregate. */
export const establishmentStorage = {
  async getEstablishment(id: string): Promise<Establishment | undefined> {
    const [establishment] = await db.select().from(establishments).where(eq(establishments.id, id));
    return establishment;
  },

  async getEstablishmentsByBusiness(businessId: string): Promise<Establishment[]> {
    return await db.select().from(establishments)
      .where(and(eq(establishments.businessId, businessId), eq(establishments.isActive, true)))
      .orderBy(asc(establishments.name));
  },

  async createEstablishment(establishmentData: InsertEstablishment): Promise<Establishment> {
    const [establishment] = await db
      .insert(establishments)
      .values(establishmentData)
      .returning();
    return establishment;
  },

  async updateEstablishment(id: string, updates: Partial<InsertEstablishment>): Promise<Establishment> {
    const [establishment] = await db
      .update(establishments)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(establishments.id, id))
      .returning();
    return establishment;
  },
};
