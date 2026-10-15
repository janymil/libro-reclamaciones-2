import type { Express } from "express";

import { storage } from "../storage";
import { requireAuth } from "../middleware/requireAuth";
import { hasFeature } from "../services/subscriptionService";

/**
 * Analytical reports beyond the dashboard metrics.
 */
export function registerReportsRoutes(app: Express): void {
  // Reincidence: products and branches generating repeated complaints
  app.get('/api/reports/reincidencia', requireAuth, async (req: any, res) => {
    try {
      if (!(await hasFeature(req.user.businessId, 'reports'))) {
        return res.status(402).json({
          message:
            "Los reportes de reincidencia están disponibles desde el plan Básico. Mejore su plan en \"Plan y Cuotas\".",
          code: "plan_upgrade_required",
        });
      }

      const report = await storage.getReincidenceReport(req.user.businessId);
      res.json(report);
    } catch (error) {
      console.error('Error building reincidence report:', error);
      res.status(500).json({ message: "No se pudo generar el reporte de reincidencia" });
    }
  });
}
