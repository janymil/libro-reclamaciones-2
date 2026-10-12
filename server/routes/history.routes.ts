import type { Express } from "express";

import { storage } from "../storage";
import { requireAuth } from "../middleware/requireAuth";

/**
 * Activity, audit trail and system change history.
 */
export function registerHistoryRoutes(app: Express): void {
  // History routes
  app.get('/api/history/activity', requireAuth, async (req: any, res) => {
    try {
      const { filterType, dateRange, searchTerm } = req.query;
      const activity = await storage.getActivityHistory(req.user.businessId, {
        filterType: filterType as string,
        dateRange: parseInt(dateRange as string) || 30,
        searchTerm: searchTerm as string,
      });
      res.json(activity);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch activity history" });
    }
  });

  app.get('/api/history/audit', requireAuth, async (req: any, res) => {
    try {
      const { filterType, dateRange } = req.query;
      const auditLogs = await storage.getAuditLogs(req.user.businessId, {
        filterType: filterType as string,
        dateRange: parseInt(dateRange as string) || 30,
      });
      res.json(auditLogs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch audit logs" });
    }
  });

  app.get('/api/history/system-changes', requireAuth, async (req: any, res) => {
    try {
      const { dateRange } = req.query;
      const systemChanges = await storage.getSystemChanges(req.user.businessId, {
        dateRange: parseInt(dateRange as string) || 30,
      });
      res.json(systemChanges);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch system changes" });
    }
  });
}
