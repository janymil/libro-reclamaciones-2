import type { Express } from "express";

import { storage } from "../storage";
import { requireAuth } from "../middleware/requireAuth";

/**
 * Analytical reports beyond the dashboard metrics (Phase 3.11).
 */
export function registerReportsRoutes(app: Express): void {
  // Reincidence: products and branches generating repeated complaints
  app.get('/api/reports/reincidencia', requireAuth, async (req: any, res) => {
    try {
      const report = await storage.getReincidenceReport(req.user.businessId);
      res.json(report);
    } catch (error) {
      console.error('Error building reincidence report:', error);
      res.status(500).json({ message: "No se pudo generar el reporte de reincidencia" });
    }
  });
}
