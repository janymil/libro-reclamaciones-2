import { db } from "../db";
import { eq, and, asc } from "drizzle-orm";
import {
  type ComplianceTracking,
  type InsertComplianceTracking,
  type DataProcessingActivity,
  type InsertDataProcessingActivity,
  complianceTracking,
  dataProcessingActivities,
} from "@shared/schema";

/** Data access for the "compliance" aggregate. */
export const complianceStorage = {
  async getComplianceTracking(businessId: string): Promise<ComplianceTracking[]> {
    return await db.select().from(complianceTracking)
      .where(eq(complianceTracking.businessId, businessId))
      .orderBy(asc(complianceTracking.dueDate));
  },

  async createComplianceTracking(trackingData: InsertComplianceTracking): Promise<ComplianceTracking> {
    const [tracking] = await db
      .insert(complianceTracking)
      .values(trackingData)
      .returning();
    return tracking;
  },

  async updateComplianceTracking(id: string, updates: Partial<InsertComplianceTracking>): Promise<ComplianceTracking> {
    const [tracking] = await db
      .update(complianceTracking)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(complianceTracking.id, id))
      .returning();
    return tracking;
  },

  async getDataProcessingActivities(businessId: string): Promise<DataProcessingActivity[]> {
    return await db.select().from(dataProcessingActivities)
      .where(and(
        eq(dataProcessingActivities.businessId, businessId),
        eq(dataProcessingActivities.isActive, true)
      ))
      .orderBy(asc(dataProcessingActivities.activityName));
  },

  async createDataProcessingActivity(activityData: InsertDataProcessingActivity): Promise<DataProcessingActivity> {
    const [activity] = await db
      .insert(dataProcessingActivities)
      .values(activityData)
      .returning();
    return activity;
  },

  async updateDataProcessingActivity(id: string, updates: Partial<InsertDataProcessingActivity>): Promise<DataProcessingActivity> {
    const [activity] = await db
      .update(dataProcessingActivities)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(dataProcessingActivities.id, id))
      .returning();
    return activity;
  },
};
