import type { Express } from "express";
import { z } from "zod";

import { PLAN_LIST } from "@shared/plans";
import { storage } from "../storage";
import { requireAuth, requireNonDemo } from "../middleware/requireAuth";
import { getSubscriptionInfo, resolvePlanChange } from "../services/subscriptionService";

/**
 * Plans & quotas (Phase 2.6): the catalog is public (landing page), while the
 * subscription status, usage meters and plan changes belong to the business
 * admin.
 */
export function registerSubscriptionRoutes(app: Express): void {
  // Public plan catalog
  app.get('/api/plans', (_req, res) => {
    res.json(PLAN_LIST);
  });

  // Current subscription + usage for the upgrade UI
  app.get('/api/subscription', requireAuth, async (req: any, res) => {
    try {
      if (!req.user.businessId) {
        return res.status(404).json({ message: "La cuenta aún no tiene una empresa configurada" });
      }

      const business = await storage.getBusiness(req.user.businessId);
      if (!business) {
        return res.status(404).json({ message: "Empresa no encontrada" });
      }

      const info = await getSubscriptionInfo(business, req.user.id);
      res.json(info);
    } catch (error) {
      console.error('Error fetching subscription:', error);
      res.status(500).json({ message: "Failed to fetch subscription" });
    }
  });

  // Change the plan / billing period (admin only).
  //
  // This is the NO-CHARGE path: it applies the plan immediately without
  // collecting money. That is only legitimate when billing happens outside the
  // app (manual invoicing), so it is off unless
  // PAYMENTS_ALLOW_FREE_PLAN_CHANGE=true. The normal path is
  // POST /api/payments/checkout, where only a confirmed payment applies a plan -
  // otherwise this endpoint would be a free upgrade for anyone with a session.
  app.post('/api/subscription', requireAuth, requireNonDemo, async (req: any, res) => {
    try {
      if (process.env.PAYMENTS_ALLOW_FREE_PLAN_CHANGE !== 'true') {
        return res.status(402).json({
          message:
            "La activación de un plan requiere un pago confirmado. Contrátelo en la sección \"Plan y Cuotas\".",
          code: "payment_required",
        });
      }

      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: "Solo un administrador puede cambiar el plan" });
      }

      if (!req.user.businessId) {
        return res.status(404).json({ message: "La cuenta aún no tiene una empresa configurada" });
      }

      const { plan, period } = z.object({
        plan: z.string(),
        period: z.enum(['monthly', 'annual']).default('monthly'),
      }).parse(req.body);

      const business = await storage.getBusiness(req.user.businessId);
      if (!business) {
        return res.status(404).json({ message: "Empresa no encontrada" });
      }

      const change = resolvePlanChange(business, plan, period);
      if ('error' in change) {
        return res.status(400).json({ message: change.error });
      }

      const updated = await storage.updateBusiness(business.id, change);

      res.json({
        message: `Plan actualizado a ${plan} (${period === 'annual' ? 'anual' : 'mensual'})`,
        subscription: await getSubscriptionInfo(updated, req.user.id),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      }
      console.error('Error changing plan:', error);
      res.status(500).json({ message: "No se pudo cambiar el plan" });
    }
  });
}
