import type { Express } from "express";

import { insertEstablishmentSchema } from "@shared/schema";

import { storage } from "../storage";
import { requireAuth } from "../middleware/requireAuth";
import { enforceQuota } from "../services/subscriptionService";

/**
 * Establishments (sucursales) belonging to the authenticated business.
 */
export function registerEstablishmentsRoutes(app: Express): void {
  // Establishments routes
  app.get('/api/establishments', requireAuth, async (req: any, res) => {
    try {
      const establishments = await storage.getEstablishmentsByBusiness(req.user.businessId);
      res.json(establishments);
    } catch (error) {
      console.error('Error fetching establishments:', error);
      res.status(500).json({ message: "Failed to fetch establishments" });
    }
  });

  app.post('/api/establishments', requireAuth, async (req: any, res) => {
    try {
      const data = insertEstablishmentSchema.parse({
        ...req.body,
        businessId: req.user.businessId,
      });

      // Plan quota on sucursales (Phase 2.6)
      const quota = await enforceQuota(req.user.businessId, req.user.id, 'establishments');
      if (!quota.allowed) {
        return res.status(402).json({ message: quota.reason, code: "quota_exceeded" });
      }

      const establishment = await storage.createEstablishment(data);
      res.json(establishment);
    } catch (error) {
      console.error('Error creating establishment:', error);
      res.status(500).json({ message: "Failed to create establishment" });
    }
  });
}
