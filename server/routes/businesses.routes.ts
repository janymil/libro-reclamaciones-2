import type { Express } from "express";
import { z } from "zod";

import { insertBusinessSchema } from "@shared/schema";
import { PLANS, checkQuota } from "@shared/plans";

import { storage } from "../storage";
import { requireAuth, requireNonDemo } from "../middleware/requireAuth";
import { enforceQuota, newBusinessTrialDefaults } from "../services/subscriptionService";

/**
 * Business records: read the current tenant, list, create and update.
 */
export function registerBusinessesRoutes(app: Express): void {
  // Businesses routes
  app.get('/api/businesses/current', requireAuth, async (req: any, res) => {
    try {
      if (!req.user.businessId) {
        return res.json(null);
      }

      const business = await storage.getBusiness(req.user.businessId);
      res.json(business ?? null);
    } catch (error) {
      console.error('Error fetching current business:', error);
      res.status(500).json({ message: "Failed to fetch business" });
    }
  });

  app.get('/api/businesses', requireAuth, async (req: any, res) => {
    try {
      const businesses = await storage.getAllBusinesses();
      res.json(businesses);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch businesses" });
    }
  });

  // Register another RUC under the same login (Phase 2.7). The plan's
  // multi-business quota applies, every new business starts its own 7-day
  // trial, and the creator gets an access grant for the switcher.
  app.post('/api/businesses', requireAuth, requireNonDemo, async (req: any, res) => {
    try {
      const businessData = insertBusinessSchema.parse(req.body);

      // Quota: businesses manageable from this login. Users without an active
      // business yet are starting their first one, so the esencial limit
      // applies (and their own access grants count as usage).
      const quota = req.user.businessId
        ? await enforceQuota(req.user.businessId, req.user.id, 'businesses')
        : checkQuota(PLANS.esencial, 'businesses', (await storage.getUserBusinessAccess(req.user.id)).length);
      if (!quota.allowed) {
        return res.status(402).json({ message: quota.reason, code: "quota_exceeded" });
      }

      const duplicate = await storage.getBusinessByRuc(businessData.ruc);
      if (duplicate) {
        return res.status(409).json({ message: "Ya existe una empresa registrada con ese RUC" });
      }

      const business = await storage.createBusiness({
        ...businessData,
        ...newBusinessTrialDefaults(),
      });

      // Multi-RUC access grant so the business appears in the switcher
      await storage.grantBusinessAccess({
        userId: req.user.id,
        businessId: business.id,
        role: 'admin',
      });

      res.status(201).json(business);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      }
      console.error('Error creating business:', error);
      res.status(500).json({ message: "Failed to create business" });
    }
  });

  // Update a business ("Gestionar" on Empresas)
  app.patch('/api/businesses/:id', requireAuth, async (req: any, res) => {
    try {
      const business = await storage.getBusiness(req.params.id);
      if (!business) {
        return res.status(404).json({ message: "Empresa no encontrada" });
      }

      const data = insertBusinessSchema.partial().parse(req.body);
      const updated = await storage.updateBusiness(req.params.id, data);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      }
      console.error('Error updating business:', error);
      res.status(500).json({ message: "Failed to update business" });
    }
  });
}
