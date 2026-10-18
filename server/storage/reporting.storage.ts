import { db } from "../db";
import { eq, and, desc, asc, count, gte, lte, lt, or } from "drizzle-orm";
import {
  businesses,
  complaints,
  establishments,
} from "@shared/schema";
import type { Complaint } from "@shared/schema";
import type {
  DashboardMetrics,
  ReportStats,
  MonthlyReport,
} from "./types";
import { complaintStorage } from "./complaint.storage";
import { startOfPeruMonth } from "@shared/peru-time";
import { buildMonthlyReports } from "@shared/monthly-reports";

/** Data access for the "reporting" aggregate. */
export const reportingStorage = {
  async getDashboardMetrics(businessId: string): Promise<DashboardMetrics> {
    const stats = await complaintStorage.getComplaintStats(businessId);
    const urgentComplaints = await db.select().from(complaints)
      .where(and(
        eq(complaints.businessId, businessId),
        eq(complaints.priority, 'urgent')
      ))
      .limit(10);

    // The dashboard shows the establishment NAME, never its UUID, so both lists
    // join `establishments` instead of leaving the client to guess.
    const recentComplaints = await db
      .select({ complaint: complaints, establishmentName: establishments.name })
      .from(complaints)
      .leftJoin(establishments, eq(complaints.establishmentId, establishments.id))
      .where(eq(complaints.businessId, businessId))
      .orderBy(desc(complaints.createdAt))
      .limit(5);

    // Get complaints due within 2 days for urgent alerts
    const urgentAlerts = await db
      .select({ complaint: complaints, establishmentName: establishments.name })
      .from(complaints)
      .leftJoin(establishments, eq(complaints.establishmentId, establishments.id))
      .where(and(
        eq(complaints.businessId, businessId),
        lte(complaints.dueDate, new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)),
        or(eq(complaints.status, 'new'), eq(complaints.status, 'in_progress'))
      ))
      .orderBy(asc(complaints.dueDate));

    const withEstablishment = (rows: Array<{ complaint: Complaint; establishmentName: string | null }>) =>
      rows.map(({ complaint, establishmentName }) => ({ ...complaint, establishmentName }));

    // Complaints resolved during the current month (Peru calendar month)
    const monthStart = startOfPeruMonth(new Date());

    const [resolvedThisMonthResult] = await db
      .select({ count: count() })
      .from(complaints)
      .where(and(
        eq(complaints.businessId, businessId),
        eq(complaints.status, 'resolved'),
        gte(complaints.updatedAt, monthStart)
      ));

    const resolutionRate = stats.total > 0
      ? Math.round(((stats.responded + stats.resolved) / stats.total) * 100)
      : 0;

    return {
      activeComplaints: stats.new + stats.inProgress,
      urgentComplaints: urgentComplaints.length,
      overdueComplaints: stats.overdue,
      totalComplaints: stats.total,
      slaCompliance: stats.slaOnTimeRate,
      resolvedThisMonth: resolvedThisMonthResult?.count ?? 0,
      resolutionRate,
      averageResponseTime: stats.avgResponseTime,
      recentComplaints: withEstablishment(recentComplaints),
      urgentAlerts: withEstablishment(urgentAlerts),
    };
  },

  async getReportStats(businessId: string): Promise<ReportStats> {
    const stats = await complaintStorage.getComplaintStats(businessId);

    const now = new Date();
    const thisMonthStart = startOfPeruMonth(now);
    const lastMonthStart = startOfPeruMonth(now, -1);

    const [thisMonthResult] = await db
      .select({ count: count() })
      .from(complaints)
      .where(and(
        eq(complaints.businessId, businessId),
        gte(complaints.submissionDate, thisMonthStart)
      ));

    const [lastMonthResult] = await db
      .select({ count: count() })
      .from(complaints)
      .where(and(
        eq(complaints.businessId, businessId),
        gte(complaints.submissionDate, lastMonthStart),
        lt(complaints.submissionDate, thisMonthStart)
      ));

    const thisMonth = thisMonthResult?.count ?? 0;
    const lastMonth = lastMonthResult?.count ?? 0;

    const complaintsGrowth = lastMonth > 0
      ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100)
      : (thisMonth > 0 ? 100 : 0);

    // Average response time and the complaint-handling compliance both come
    // from getComplaintStats (single source of truth: complaintSlaService).
    const resolutionRate = stats.total > 0
      ? Math.round(((stats.resolved + stats.responded) / stats.total) * 100)
      : 0;

    return {
      totalComplaints: stats.total,
      complaintsGrowth,
      averageResponseTime: stats.avgResponseTime,
      resolutionRate,
      // null = "sin datos" (no complaints yet), which is NOT the same as 0%.
      slaOnTimeRate: stats.slaOnTimeRate,
      answeredComplaints: stats.answered,
      overdueComplaints: stats.overdue,
      complianceRate: stats.slaOnTimeRate ?? 0,
    };
  },

  async getMonthlyReports(businessId: string): Promise<MonthlyReport[]> {
    const [businessRows, rows] = await Promise.all([
      db
        .select({ createdAt: businesses.createdAt })
        .from(businesses)
        .where(eq(businesses.id, businessId))
        .limit(1),
      db
        .select({
          submissionDate: complaints.submissionDate,
          status: complaints.status,
          isOverdue: complaints.isOverdue,
        })
        .from(complaints)
        .where(eq(complaints.businessId, businessId)),
    ]);

    // The window starts at the month the company exists from: a brand-new
    // account must not be listed six months of "0 reclamaciones procesadas" for
    // periods that predate its own registration (see @shared/monthly-reports).
    return buildMonthlyReports(rows, {
      firstMonth: businessRows[0]?.createdAt ?? null,
    });
  },
};
