import { db } from "../db";
import { eq, desc } from "drizzle-orm";
import {
  type ArcoRequest,
  type InsertArcoRequest,
  arcoRequests,
} from "@shared/schema";

/** Data access for the "arco" aggregate. */
export const arcoStorage = {
  async getArcoRequests(businessId: string): Promise<ArcoRequest[]> {
    return await db.select().from(arcoRequests)
      .where(eq(arcoRequests.businessId, businessId))
      .orderBy(desc(arcoRequests.createdAt));
  },

  async createArcoRequest(requestData: InsertArcoRequest): Promise<ArcoRequest> {
    const [request] = await db
      .insert(arcoRequests)
      .values(requestData)
      .returning();
    return request;
  },

  async updateArcoRequest(id: string, updates: Partial<InsertArcoRequest>): Promise<ArcoRequest> {
    const [request] = await db
      .update(arcoRequests)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(arcoRequests.id, id))
      .returning();
    return request;
  },
};
