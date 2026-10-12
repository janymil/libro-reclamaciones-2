import type { Express } from "express";

import { storage } from "../storage";
import { requireAuth } from "../middleware/requireAuth";

/**
 * Dashboard metrics and reporting aggregates.
 */
export function registerDashboardRoutes(app: Express): void {
  // Dashboard routes
  app.get('/api/dashboard/metrics', requireAuth, async (req: any, res) => {
    try {
      const metrics = await storage.getDashboardMetrics(req.user.businessId);
      res.json(metrics);
    } catch (error) {
      console.error('Error fetching dashboard metrics:', error);
      res.status(500).json({ message: "Failed to fetch dashboard metrics" });
    }
  });

  // Reports routes
  app.get('/api/reports/stats', requireAuth, async (req: any, res) => {
    try {
      const stats = await storage.getReportStats(req.user.businessId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch report stats" });
    }
  });

  app.get('/api/reports/monthly', requireAuth, async (req: any, res) => {
    try {
      const reports = await storage.getMonthlyReports(req.user.businessId);
      res.json(reports);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch monthly reports" });
    }
  });
}
