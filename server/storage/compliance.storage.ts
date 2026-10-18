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
import type { RnpdDeclaration } from "@shared/rnpd";

/** `compliance_tracking.compliance_type` used for the RNPD declaration. */
export const RNPD_COMPLIANCE_TYPE = "rnpd_registration";

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

  /**
   * Records what the business declares about the RNPD inscription.
   *
   * This is a *declaration*: the platform cannot check the State registry, so the
   * row stores the answer (and the SIPDP code when the client provides it). A
   * "not yet" answer is stored as `pending` on purpose — that is what makes the
   * obligation visible instead of silently unknown.
   */
  async setRnpdRegistration(
    businessId: string,
    declaration: RnpdDeclaration,
  ): Promise<ComplianceTracking> {
    const [existing] = await db
      .select()
      .from(complianceTracking)
      .where(and(
        eq(complianceTracking.businessId, businessId),
        eq(complianceTracking.complianceType, RNPD_COMPLIANCE_TYPE),
      ));

    const values = {
      status: declaration.registered ? "compliant" : "pending",
      completedDate: declaration.registered ? new Date() : null,
      notes: declaration.code?.trim()
        ? `Código del banco de datos: ${declaration.code.trim()}`
        : null,
    };

    if (existing) {
      const [updated] = await db
        .update(complianceTracking)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(complianceTracking.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(complianceTracking)
      .values({ businessId, complianceType: RNPD_COMPLIANCE_TYPE, ...values })
      .returning();
    return created;
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
