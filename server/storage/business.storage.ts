import { db } from "../db";
import { eq, asc, count } from "drizzle-orm";
import {
  type Business,
  type InsertBusiness,
  users,
  businesses,
  establishments,
} from "@shared/schema";
import type {
  BusinessWithStats,
} from "./types";

/** Data access for the "business" aggregate. */
export const businessStorage = {
  async getBusiness(id: string): Promise<Business | undefined> {
    const [business] = await db.select().from(businesses).where(eq(businesses.id, id));
    return business;
  },

  async getBusinessByRuc(ruc: string): Promise<Business | undefined> {
    const [business] = await db.select().from(businesses).where(eq(businesses.ruc, ruc));
    return business;
  },

  async createBusiness(businessData: InsertBusiness): Promise<Business> {
    const [business] = await db
      .insert(businesses)
      .values(businessData)
      .returning();
    return business;
  },

  async updateBusiness(id: string, updates: Partial<InsertBusiness>): Promise<Business> {
    const [business] = await db
      .update(businesses)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(businesses.id, id))
      .returning();
    return business;
  },

  async getAllBusinesses(): Promise<BusinessWithStats[]> {
    const allBusinesses = await db
      .select()
      .from(businesses)
      .orderBy(asc(businesses.businessName));

    const establishmentCounts = await db
      .select({ businessId: establishments.businessId, count: count() })
      .from(establishments)
      .groupBy(establishments.businessId);

    const userCounts = await db
      .select({ businessId: users.businessId, count: count() })
      .from(users)
      .groupBy(users.businessId);

    const establishmentMap = new Map<string, number>(
      establishmentCounts.map((row): [string, number] => [row.businessId, row.count])
    );
    const userMap = new Map<string, number>(
      userCounts.map((row): [string, number] => [row.businessId ?? '', row.count])
    );

    return allBusinesses.map(business => ({
      ...business,
      establishmentCount: establishmentMap.get(business.id) ?? 0,
      userCount: userMap.get(business.id) ?? 0,
    }));
  },

  async getBusinessById(id: string): Promise<Business | undefined> {
    return this.getBusiness(id);
  },
};
