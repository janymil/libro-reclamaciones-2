import { db } from "../db";
import { eq, and, desc, asc, count, gte, lte, or, isNotNull } from "drizzle-orm";
import {
  type Complaint,
  type InsertComplaint,
  type ComplaintAuditLog,
  complaints,
  complaintAuditLog,
} from "@shared/schema";
import type {
  ComplaintFilters,
  ComplaintStats,
} from "./types";
import { businessDayCalculator } from "../services/businessDayCalculator";

/** Data access for the "complaint" aggregate. */
export const complaintStorage = {
  async getComplaint(id: string): Promise<Complaint | undefined> {
    const [complaint] = await db.select().from(complaints).where(eq(complaints.id, id));
    return complaint;
  },

  /**
   * Locates a complaint from the public portal. The consumer must provide both
   * the correlative number and their document number so a third party cannot
   * enumerate other people's complaints.
   */

  async findComplaintByCorrelative(
    businessId: string,
    correlativeNumber: string,
    documentNumber: string
  ): Promise<Complaint | undefined> {
    const [complaint] = await db
      .select()
      .from(complaints)
      .where(and(
        eq(complaints.businessId, businessId),
        eq(complaints.correlativeNumber, correlativeNumber),
        eq(complaints.consumerDocumentNumber, documentNumber)
      ));
    return complaint;
  },

  async getComplaintsByBusiness(businessId: string, filters?: ComplaintFilters): Promise<Complaint[]> {
    const conditions = [eq(complaints.businessId, businessId)];

    if (filters) {
      if (filters.status) {
        conditions.push(eq(complaints.status, filters.status));
      }
      if (filters.type) {
        conditions.push(eq(complaints.complaintType, filters.type));
      }
      if (filters.priority) {
        conditions.push(eq(complaints.priority, filters.priority));
      }
      if (filters.assignedToUserId) {
        conditions.push(eq(complaints.assignedToUserId, filters.assignedToUserId));
      }
      if (filters.establishmentId) {
        conditions.push(eq(complaints.establishmentId, filters.establishmentId));
      }
      if (filters.dateFrom) {
        conditions.push(gte(complaints.submissionDate, filters.dateFrom));
      }
      if (filters.dateTo) {
        conditions.push(lte(complaints.submissionDate, filters.dateTo));
      }
    }

    return await db.select().from(complaints)
      .where(and(...conditions))
      .orderBy(desc(complaints.createdAt));
  },

  async getComplaintsByEstablishment(establishmentId: string): Promise<Complaint[]> {
    return await db.select().from(complaints)
      .where(eq(complaints.establishmentId, establishmentId))
      .orderBy(desc(complaints.createdAt));
  },

  async createComplaint(complaintData: InsertComplaint): Promise<Complaint> {
    const [complaint] = await db
      .insert(complaints)
      .values(complaintData)
      .returning();
    return complaint;
  },

  async updateComplaint(id: string, updates: Partial<InsertComplaint>): Promise<Complaint> {
    const [complaint] = await db
      .update(complaints)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(complaints.id, id))
      .returning();
    return complaint;
  },

  async getComplaintStats(businessId: string): Promise<ComplaintStats> {
    const totalResult = await db
      .select({ count: count() })
      .from(complaints)
      .where(eq(complaints.businessId, businessId));

    const statusCounts = await db
      .select({
        status: complaints.status,
        count: count(),
      })
      .from(complaints)
      .where(eq(complaints.businessId, businessId))
      .groupBy(complaints.status);

    const overdueCount = await db
      .select({ count: count() })
      .from(complaints)
      .where(and(
        eq(complaints.businessId, businessId),
        eq(complaints.isOverdue, true)
      ));

    const statusMap = statusCounts.reduce((acc, { status, count }) => {
      acc[status] = count;
      return acc;
    }, {} as Record<string, number>);

    const total = totalResult[0]?.count || 0;
    const overdue = overdueCount[0]?.count || 0;
    const resolved = statusMap['resolved'] || 0;

    // Answered complaints, used for the SLA and average-response metrics
    const answered = await db
      .select({
        submissionDate: complaints.submissionDate,
        responseDate: complaints.responseDate,
        dueDate: complaints.dueDate,
      })
      .from(complaints)
      .where(and(
        eq(complaints.businessId, businessId),
        isNotNull(complaints.responseDate)
      ));

    // SLA compliance = share of answered complaints answered within the legal
    // deadline (15 business days), i.e. response date on or before the due date.
    const answeredOnTime = answered.filter(
      complaint =>
        complaint.responseDate &&
        complaint.dueDate &&
        new Date(complaint.responseDate) <= new Date(complaint.dueDate)
    ).length;

    const slaCompliance = answered.length > 0
      ? (answeredOnTime / answered.length) * 100
      : 100;

    const avgResponseTime = answered.length > 0
      ? Math.round(
          (answered.reduce(
            (sum, complaint) =>
              sum + businessDayCalculator.getBusinessDaysBetween(
                complaint.submissionDate,
                complaint.responseDate as Date
              ),
            0
          ) / answered.length) * 10
        ) / 10
      : 0;

    return {
      total,
      new: statusMap['new'] || 0,
      inProgress: statusMap['in_progress'] || 0,
      responded: statusMap['responded'] || 0,
      resolved,
      overdue,
      avgResponseTime,
      slaCompliance: Math.round(slaCompliance),
    };
  },

  async getOverdueComplaints(businessId: string): Promise<Complaint[]> {
    return await db.select().from(complaints)
      .where(and(
        eq(complaints.businessId, businessId),
        or(
          eq(complaints.isOverdue, true),
          and(
            lte(complaints.dueDate, new Date()),
            or(
              eq(complaints.status, 'new'),
              eq(complaints.status, 'in_progress')
            )
          )
        )
      ))
      .orderBy(asc(complaints.dueDate));
  },

  async createAuditLog(auditLogData: Omit<ComplaintAuditLog, 'id' | 'createdAt'>): Promise<ComplaintAuditLog> {
    const [auditLog] = await db
      .insert(complaintAuditLog)
      .values(auditLogData)
      .returning();
    return auditLog;
  },

  async getAuditLogsByComplaint(complaintId: string): Promise<ComplaintAuditLog[]> {
    return await db.select().from(complaintAuditLog)
      .where(eq(complaintAuditLog.complaintId, complaintId))
      .orderBy(desc(complaintAuditLog.createdAt));
  },
};
