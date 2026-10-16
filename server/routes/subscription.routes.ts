import type { Express } from "express";
import { z } from "zod";

import { storage } from "../storage";
import { requireAuth, requireNonDemo } from "../middleware/requireAuth";
import { getSubscriptionInfo, resolvePlanChange } from "../services/subscriptionService";
import { effectivePlans } from "../services/pricingService";
import { getIdentity, getTrialDays, isFreePlanChangeAllowed } from "../services/platformSettingsService";

/**
 * Plans & quotas (Phase 2.6): the catalog is public (landing page), while the
 * subscription status, usage meters and plan changes belong to the business
 * admin.
 */
export function registerSubscriptionRoutes(app: Express): void {
  /**
   * Public plan catalog.
   *
   * Prices come from the console's price list (Planes) when an operator overrode
   * them, so the page a visitor reads and the amount the checkout charges are the
   * same numbers. The plan *contents* still come from `shared/plans.ts`.
   */
  app.get('/api/plans', async (_req, res) => {
    try {
      res.json(await effectivePlans());
    } catch (error) {
      console.error('Error building the plan catalog:', error);
      // Never leave the pricing page empty: the catalogue prices are a valid answer.
      const { PLAN_LIST } = await import('@shared/plans');
      res.json(PLAN_LIST);
    }
  });


  /**
   * Public platform information: who we are and how long the trial lasts.
   *
   * The privacy policy, the receipts and the landing page all need the same two
   * facts, and both used to be hardcoded in the client. No secrets: this is exactly
   * what a customer may see, and the database is only read for values that are
   * already public by nature.
   */
  app.get('/api/platform-info', async (_req, res) => {
    try {
      res.json({
        identity: await getIdentity(),
        trialDays: await getTrialDays(),
      });
    } catch (error) {
      console.error('Error reading the platform identity:', error);
      res.status(500).json({ message: "No se pudo cargar la información de la plataforma" });
    }
  });

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
  // app (manual invoicing), so it is off unless an operator turns it on in the
  // console (Configuración → Operación, audited) or the deployment sets
  // PAYMENTS_ALLOW_FREE_PLAN_CHANGE=true. The normal path is
  // POST /api/payments/checkout, where only a confirmed payment applies a plan -
  // otherwise this endpoint would be a free upgrade for anyone with a session.
  app.post('/api/subscription', requireAuth, requireNonDemo, async (req: any, res) => {
    try {
      if (!(await isFreePlanChangeAllowed())) {
        return res.status(402).json({
          message:
            "La activación de un plan requiere un pago confirmado. Contrátelo en la sección \"Plan y Cuotas\".",
          code: "payment_required",
        });
      }

      // Loud on purpose: a plan that changes without money is exactly the event that
      // must be findable in the logs when someone asks "how did this account get Pro?".
      console.warn(
        `[subscription] cambio de plan SIN pago: usuario ${req.user.email} (${req.user.id}), ` +
          `empresa ${req.user.businessId ?? '—'}`,
      );

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
