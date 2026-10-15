import { db } from "../db";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  type BusinessAccessRequest,
  type InsertBusinessAccessRequest,
  businessAccessRequests,
  businesses,
} from "@shared/schema";

/** A request joined with the tenant it is about (names for the UI). */
export interface AccessRequestWithBusiness extends BusinessAccessRequest {
  businessName: string;
  ruc: string;
}

/**
 * "Solicitar acceso a esta empresa" (duplicate-RUC escape hatch).
 *
 * Replaces the bare 409 an administrator used to get when the RUC it needed was
 * already registered by someone else.
 */
export const accessRequestStorage = {
  async createAccessRequest(
    requestData: InsertBusinessAccessRequest,
  ): Promise<BusinessAccessRequest> {
    const [request] = await db
      .insert(businessAccessRequests)
      .values(requestData)
      .returning();
    return request;
  },

  async getAccessRequest(id: string): Promise<AccessRequestWithBusiness | undefined> {
    const [request] = await db
      .select({
        id: businessAccessRequests.id,
        businessId: businessAccessRequests.businessId,
        requesterUserId: businessAccessRequests.requesterUserId,
        requesterEmail: businessAccessRequests.requesterEmail,
        requesterName: businessAccessRequests.requesterName,
        message: businessAccessRequests.message,
        status: businessAccessRequests.status,
        decidedByUserId: businessAccessRequests.decidedByUserId,
        decidedAt: businessAccessRequests.decidedAt,
        createdAt: businessAccessRequests.createdAt,
        updatedAt: businessAccessRequests.updatedAt,
        businessName: businesses.businessName,
        ruc: businesses.ruc,
      })
      .from(businessAccessRequests)
      .innerJoin(businesses, eq(businesses.id, businessAccessRequests.businessId))
      .where(eq(businessAccessRequests.id, id));
    return request;
  },

  /** The open request of this login for this tenant, if any (idempotent re-send). */
  async getPendingAccessRequest(
    businessId: string,
    requesterUserId: string,
  ): Promise<BusinessAccessRequest | undefined> {
    const [request] = await db
      .select()
      .from(businessAccessRequests)
      .where(and(
        eq(businessAccessRequests.businessId, businessId),
        eq(businessAccessRequests.requesterUserId, requesterUserId),
        eq(businessAccessRequests.status, "pending"),
      ));
    return request;
  },

  /** Incoming requests for the tenants this login administers. */
  async getAccessRequestsByBusinessIds(
    businessIds: string[],
  ): Promise<AccessRequestWithBusiness[]> {
    if (businessIds.length === 0) {
      return [];
    }

    return await db
      .select({
        id: businessAccessRequests.id,
        businessId: businessAccessRequests.businessId,
        requesterUserId: businessAccessRequests.requesterUserId,
        requesterEmail: businessAccessRequests.requesterEmail,
        requesterName: businessAccessRequests.requesterName,
        message: businessAccessRequests.message,
        status: businessAccessRequests.status,
        decidedByUserId: businessAccessRequests.decidedByUserId,
        decidedAt: businessAccessRequests.decidedAt,
        createdAt: businessAccessRequests.createdAt,
        updatedAt: businessAccessRequests.updatedAt,
        businessName: businesses.businessName,
        ruc: businesses.ruc,
      })
      .from(businessAccessRequests)
      .innerJoin(businesses, eq(businesses.id, businessAccessRequests.businessId))
      .where(inArray(businessAccessRequests.businessId, businessIds))
      .orderBy(desc(businessAccessRequests.createdAt));
  },

  /** Requests this login sent (so the UI can show their state). */
  async getAccessRequestsByRequester(
    requesterUserId: string,
  ): Promise<AccessRequestWithBusiness[]> {
    return await db
      .select({
        id: businessAccessRequests.id,
        businessId: businessAccessRequests.businessId,
        requesterUserId: businessAccessRequests.requesterUserId,
        requesterEmail: businessAccessRequests.requesterEmail,
        requesterName: businessAccessRequests.requesterName,
        message: businessAccessRequests.message,
        status: businessAccessRequests.status,
        decidedByUserId: businessAccessRequests.decidedByUserId,
        decidedAt: businessAccessRequests.decidedAt,
        createdAt: businessAccessRequests.createdAt,
        updatedAt: businessAccessRequests.updatedAt,
        businessName: businesses.businessName,
        ruc: businesses.ruc,
      })
      .from(businessAccessRequests)
      .innerJoin(businesses, eq(businesses.id, businessAccessRequests.businessId))
      .where(eq(businessAccessRequests.requesterUserId, requesterUserId))
      .orderBy(desc(businessAccessRequests.createdAt));
  },

  /**
   * Records the decision. Status changes are guarded in SQL (`status =
   * 'pending'`), so two administrators clicking at the same time cannot both win
   * and grant/deny twice.
   */
  async decideAccessRequest(
    id: string,
    decision: { status: "approved" | "rejected"; decidedByUserId: string },
  ): Promise<BusinessAccessRequest | undefined> {
    const [request] = await db
      .update(businessAccessRequests)
      .set({
        status: decision.status,
        decidedByUserId: decision.decidedByUserId,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(businessAccessRequests.id, id),
        eq(businessAccessRequests.status, "pending"),
      ))
      .returning();
    return request;
  },
};
