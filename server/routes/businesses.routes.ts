import type { Express } from "express";
import { z } from "zod";

import { businessProfileSchema, businessUpdateSchema } from "@shared/schema";
import { PLANS, checkQuota } from "@shared/plans";

import { storage } from "../storage";
import { requireAuth, requireNonDemo, requireAdmin } from "../middleware/requireAuth";
import { enforceQuota, newBusinessTrialDefaults } from "../services/subscriptionService";
import { provisionDefaultEstablishment } from "../services/establishmentProvisioning";
import { getManageableBusinessIds } from "../services/tenantAccess";

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
      // Only the businesses this login may manage: its active tenant plus any
      // multi-RUC access grants. Returning every tenant would leak other
      // companies' RUC/address to any authenticated user.
      const access = await storage.getUserBusinessAccess(req.user.id);
      const allowed = new Set(access.map((entry) => entry.businessId));
      if (req.user.businessId) {
        allowed.add(req.user.businessId);
      }

      const businesses = (await storage.getAllBusinesses()).filter((business) =>
        allowed.has(business.id),
      );
      res.json(businesses);
    } catch (error) {
      console.error('Error fetching businesses:', error);
      res.status(500).json({ message: "Failed to fetch businesses" });
    }
  });

  // Register another RUC under the same login. The plan's
  // multi-business quota applies, every new business starts its own trial, and the creator gets an access grant for the switcher.
  app.post('/api/businesses', requireAuth, requireAdmin, requireNonDemo, async (req: any, res) => {
    try {
      // Only the legal identity fields are accepted: plan, subscription state
      // and isActive are server-assigned (trial defaults below) - the client
      // must not mint itself a paid plan or skip the trial lifecycle.
      const businessData = businessProfileSchema.parse(req.body);

      // Quota: businesses manageable from this login. Users without an active
      // business yet are starting their first one, so the gratis limit
      // applies (and their own access grants count as usage).
      const quota = req.user.businessId
        ? await enforceQuota(req.user.businessId, req.user.id, 'businesses')
        : checkQuota(PLANS.gratis, 'businesses', (await storage.getUserBusinessAccess(req.user.id)).length);
      if (!quota.allowed) {
        return res.status(402).json({ message: quota.reason, code: "quota_exceeded" });
      }

      const duplicate = await storage.getBusinessByRuc(businessData.ruc);
      if (duplicate) {
        // Not a dead end any more: the caller can ask the current administrators
        // of that RUC for access (POST /api/businesses/access-requests), which is
        // what the client offers right next to this message.
        return res.status(409).json({
          message: "Ya existe una empresa registrada con ese RUC. Puedes solicitar acceso a esa empresa.",
          code: "ruc_already_registered",
          businessName: duplicate.businessName,
        });
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

      // Every business needs at least one establishment to use the Libro de
      // Reclamaciones; give the new RUC a default sucursal.
      await provisionDefaultEstablishment(business);

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
  app.patch('/api/businesses/:id', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      // Cross-tenant guard: the caller may only touch a tenant it manages
      // (its active business or an explicit multi-RUC grant). Previously any
      // authenticated user could rewrite ANY company's data - or flip its
      // subscriptionPlan to corporativo for free.
      const allowed = await getManageableBusinessIds(req.user);
      if (!allowed.has(req.params.id)) {
        return res.status(404).json({ message: "Empresa no encontrada" });
      }

      const business = await storage.getBusiness(req.params.id);
      if (!business) {
        return res.status(404).json({ message: "Empresa no encontrada" });
      }

      // Whitelisted profile fields only: RUC, plan and subscription lifecycle
      // can never be changed through this endpoint.
      const data = businessUpdateSchema.parse(req.body);
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
