import { db } from "../db";
import { eq, and, desc, asc, count, gte, lte, lt, or, isNotNull } from "drizzle-orm";
import {
  complaints,
} from "@shared/schema";
import type {
  DashboardMetrics,
  ComplianceReport,
  ReportStats,
  MonthlyReport,
} from "./types";
import { businessDayCalculator } from "../services/businessDayCalculator";
import { complaintStorage } from "./complaint.storage";
import { complianceStorage } from "./compliance.storage";

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

    const recentComplaints = await db.select().from(complaints)
      .where(eq(complaints.businessId, businessId))
      .orderBy(desc(complaints.createdAt))
      .limit(5);

    // Get complaints due within 2 days for urgent alerts
    const urgentAlerts = await db.select().from(complaints)
      .where(and(
        eq(complaints.businessId, businessId),
        lte(complaints.dueDate, new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)),
        or(eq(complaints.status, 'new'), eq(complaints.status, 'in_progress'))
      ))
      .orderBy(asc(complaints.dueDate));

    // Complaints resolved during the current month
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

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
      slaCompliance: stats.slaCompliance,
      resolvedThisMonth: resolvedThisMonthResult?.count ?? 0,
      resolutionRate,
      averageResponseTime: stats.avgResponseTime,
      recentComplaints,
      urgentAlerts,
    };
  },

  async generateComplianceReport(businessId: string): Promise<ComplianceReport> {
    const tracking = await complianceStorage.getComplianceTracking(businessId);
    
    const ds011Status = tracking.some(t => t.complianceType === 'ds_011_2011_pcm' && t.status === 'compliant');
    const ds101Status = tracking.some(t => t.complianceType === 'ds_101_2022_pcm' && t.status === 'compliant');
    const ley29733Status = tracking.some(t => t.complianceType === 'ley_29733' && t.status === 'compliant');
    
    const overdueItems = tracking.filter(t => 
      t.status !== 'compliant' && 
      t.dueDate && 
      new Date(t.dueDate) < new Date()
    );
    
    const nextActions = [
      !ley29733Status ? 'Registro RNPD - Vence 30/03/2025' : null,
      'Actualizar Política de Privacidad',
      'Capacitación derechos ARCO'
    ].filter(Boolean) as string[];

    return {
      ds011Status,
      ds101Status,
      ley29733Status,
      nextActions,
      overdueItems,
    };
  },

  async getReportStats(businessId: string): Promise<ReportStats> {
    const stats = await complaintStorage.getComplaintStats(businessId);

    const thisMonthStart = new Date();
    thisMonthStart.setDate(1);
    thisMonthStart.setHours(0, 0, 0, 0);

    const lastMonthStart = new Date(thisMonthStart);
    lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);

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

    // Average response time, measured in business days (Peruvian calendar)
    const responded = await db
      .select({
        submissionDate: complaints.submissionDate,
        responseDate: complaints.responseDate,
      })
      .from(complaints)
      .where(and(
        eq(complaints.businessId, businessId),
        isNotNull(complaints.responseDate)
      ));

    const averageResponseTime = responded.length > 0
      ? Math.round(
          (responded.reduce(
            (total, complaint) =>
              total + businessDayCalculator.getBusinessDaysBetween(
                complaint.submissionDate,
                complaint.responseDate as Date
              ),
            0
          ) / responded.length) * 10
        ) / 10
      : 0;

    const resolutionRate = stats.total > 0
      ? Math.round(((stats.resolved + stats.responded) / stats.total) * 100)
      : 0;

    const compliance = await reportingStorage.generateComplianceReport(businessId);
    const compliantCount = [
      compliance.ds011Status,
      compliance.ds101Status,
      compliance.ley29733Status,
    ].filter(Boolean).length;

    return {
      totalComplaints: stats.total,
      complaintsGrowth,
      averageResponseTime,
      resolutionRate,
      complianceRate: Math.round((compliantCount / 3) * 100),
    };
  },

  async getMonthlyReports(businessId: string): Promise<MonthlyReport[]> {
    const rows = await db
      .select({
        submissionDate: complaints.submissionDate,
        status: complaints.status,
        isOverdue: complaints.isOverdue,
      })
      .from(complaints)
      .where(eq(complaints.businessId, businessId));

    const now = new Date();
    const reports: MonthlyReport[] = [];

    // Report on the last 6 months, most recent first
    for (let offset = 0; offset < 6; offset++) {
      const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);

      const inMonth = rows.filter(row => {
        const submitted = new Date(row.submissionDate);
        return submitted >= start && submitted < end;
      });

      reports.push({
        month: start.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' }),
        complaints: inMonth.length,
        resolved: inMonth.filter(row => row.status === 'resolved').length,
        overdue: inMonth.filter(row => row.isOverdue).length,
      });
    }

    return reports;
  },
};
