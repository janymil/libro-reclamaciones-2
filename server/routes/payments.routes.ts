import type { Express } from "express";
import { z } from "zod";

import {
  PAYMENT_CURRENCY,
  PAYMENT_STATUS_LABELS,
  availablePaymentProviders,
  isPaymentProviderId,
  isPaymentStatus,
  isPlanPeriod,
  type PaymentProviderId,
  type PlanPeriod,
} from "@shared/payments";
import { getPlan, isPlanId } from "@shared/plans";
import type { Payment, Subscription } from "@shared/schema";

import { storage } from "../storage";
import { requireAdmin, requireAuth, requireNonDemo, requirePlatformAdmin } from "../middleware/requireAuth";
import { paymentWebhookLimiter } from "../middleware/rateLimits";
import {
  cancelSubscriptionForBusiness,
  confirmManualPayment,
  getActiveSubscription,
  handleProviderWebhook,
  listPayments,
  listPendingManualPayments,
  paymentProviderOptions,
  refreshPayment,
  refreshSubscription,
  startCheckout,
} from "../services/paymentService";
import { evaluateDiscountForCheckout, DiscountRejectedError } from "../services/discountService";
import { effectivePlanAmountCents } from "../services/pricingService";


/**
 * Subscription payments (Phase 2.7).
 *
 * Flow:
 *   POST /api/payments/checkout        - admin starts a checkout (returns a
 *                                        redirect URL, or bank instructions)
 *   POST /api/payments/webhook/:provider - the PSP tells us something changed;
 *                                        the status is re-read from the PSP API
 *   POST /api/payments/:id/refresh     - the browser comes back from checkout
 *   POST /api/payments/:id/confirm     - admin marks a bank transfer as received
 *   GET  /api/payments                 - the business's payment history
 *
 * The webhook is the only unauthenticated one, and it trusts nothing: see
 * `handleProviderWebhook`.
 */

/** Public projection: the provider's raw payload never reaches the browser. */
export function toPublicPayment(payment: Payment) {
  return {
    id: payment.id,
    reference: payment.reference,
    provider: payment.provider,
    method: payment.method,
    planId: payment.planId,
    period: payment.period,
    amountCents: payment.amountCents,
    currency: payment.currency,
    // Why the amount is what it is: the list price minus a promo code, if any. Kept in
    // the projection so the customer's history and the operator's ledger both explain
    // themselves instead of showing a number nobody can reconcile.
    discountCode: payment.discountCode,
    discountCents: payment.discountCents,
    status: payment.status,
    statusLabel: isPaymentStatus(payment.status) ? PAYMENT_STATUS_LABELS[payment.status] : payment.status,
    redirectUrl: payment.redirectUrl,
    failureReason: payment.failureReason,
    paidAt: payment.paidAt,
    createdAt: payment.createdAt,
  };
}

/** Public projection of a recurring agreement. */
function toPublicSubscription(subscription: Subscription, statusLabel: string, isLive: boolean) {
  return {
    id: subscription.id,
    reference: subscription.reference,
    provider: subscription.provider,
    planId: subscription.planId,
    period: subscription.period,
    amountCents: subscription.amountCents,
    currency: subscription.currency,
    status: subscription.status,
    statusLabel,
    isLive,
    nextPaymentAt: subscription.nextPaymentAt,
    startedAt: subscription.startedAt,
    cancelledAt: subscription.cancelledAt,
    initPoint: subscription.initPoint,
    createdAt: subscription.createdAt,
  };
}

/**
 * Origin used to build the return URLs the PSP redirects to.
 *
 * `APP_URL` wins because it is the real public domain; behind a proxy the
 * request's own host can be an internal one, which would send the customer to
 * an unreachable address after paying.
 */
function resolveBaseUrl(req: any): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  return `${req.protocol}://${req.get("host")}`;
}

export function registerPaymentsRoutes(app: Express): void {
  // ---- Notifications (public, unauthenticated) ------------------------------

  /**
   * Registered first so the more specific path always wins over `:id`.
   *
   * Answers 200 even for notifications we ignore (unknown id, other event
   * types): the provider would otherwise retry forever. A failure to *reach*
   * the provider, on the other hand, answers 500 on purpose, because then we
   * do want the retry.
   */
  app.post('/api/payments/webhook/:provider', paymentWebhookLimiter, async (req, res) => {
    const providerId = req.params.provider;

    if (!isPaymentProviderId(providerId)) {
      return res.status(200).json({ received: true, ignored: "proveedor desconocido" });
    }

    try {
      const outcome = await handleProviderWebhook(providerId, req.body, req.query as Record<string, unknown>);

      if (!outcome.handled) {
        console.warn(`[payments] webhook ${providerId} ignorado: ${outcome.reason}`);
      }

      res.status(200).json({ received: true, handled: outcome.handled, status: outcome.status });
    } catch (error) {
      // Could not confirm with the provider: ask it to retry.
      console.error(`[payments] error procesando el webhook de ${providerId}:`, error);
      res.status(500).json({ received: false });
    }
  });

  // ---- Catalog --------------------------------------------------------------

  app.get('/api/payments/providers', requireAuth, (_req, res) => {
    res.json({
      currency: PAYMENT_CURRENCY,
      providers: paymentProviderOptions(),
    });
  });

  // ---- History --------------------------------------------------------------

  app.get('/api/payments', requireAuth, async (req: any, res) => {
    try {
      if (!req.user.businessId) {
        return res.status(404).json({ message: "La cuenta aún no tiene una empresa configurada" });
      }

      const payments = await listPayments(req.user.businessId);
      res.json(payments.map(toPublicPayment));
    } catch (error) {
      console.error('Error listing payments:', error);
      res.status(500).json({ message: "No se pudo cargar el historial de pagos" });
    }
  });

  /**
   * Operator queue (platform staff only): the pending transfers/Yape of EVERY
   * customer.
   *
   * The customer's own history is tenant-scoped, so without this the team would
   * never see the transfer it has to reconcile - which is exactly what makes
   * "pagar por transferencia" look like it did nothing.
   */
  app.get('/api/payments/pending-manual', requireAuth, requirePlatformAdmin, async (_req: any, res) => {
    try {
      const pending = await listPendingManualPayments();
      const rows = await Promise.all(
        pending.map(async (payment) => {
          const business = payment.businessId
            ? await storage.getBusiness(payment.businessId)
            : undefined;
          return {
            payment: toPublicPayment(payment),
            businessId: payment.businessId,
            businessName: business?.businessName ?? null,
          };
        }),
      );
      res.json(rows);
    } catch (error) {
      console.error('Error listing pending manual payments:', error);
      res.status(500).json({ message: "No se pudieron cargar los pagos pendientes" });
    }
  });

  // ---- Start a checkout -----------------------------------------------------

  app.post('/api/payments/checkout', requireAuth, requireNonDemo, async (req: any, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: "Solo un administrador puede contratar un plan" });
      }

      if (!req.user.businessId) {
        return res.status(404).json({ message: "La cuenta aún no tiene una empresa configurada" });
      }

      const { plan, period, provider, mode, discountCode } = z.object({
        plan: z.string(),
        period: z.string().default('monthly'),
        provider: z.string(),
        // `auto` (default) picks the recurring rail when the provider has one.
        mode: z.enum(['auto', 'one_time']).default('auto'),
        /** Promo code, validated below against the live price - never trusted. */
        discountCode: z.string().trim().max(40).optional(),
      }).parse(req.body);

      if (!isPlanId(plan)) {
        return res.status(400).json({ message: "Plan inválido" });
      }
      if (!isPlanPeriod(period)) {
        return res.status(400).json({ message: "Periodo inválido" });
      }

      // The free plan is chosen, not bought. Saying so beats asking the provider
      // to charge S/ 0 and reporting its rejection as a gateway failure.
      const selectedPlan = getPlan(plan);
      if ((await effectivePlanAmountCents(selectedPlan.id, period)) <= 0) {
        return res.status(400).json({
          message: `El plan ${selectedPlan.name} es gratuito: no necesita ningún pago.`,
          code: "plan_is_free",
        });
      }
      if (!isPaymentProviderId(provider)) {
        return res.status(400).json({ message: "Método de pago inválido" });
      }

      // Catalogued but not wired (Culqi / Niubiz / Izipay): a clear 400 instead
      // of a confusing gateway error.
      if (!availablePaymentProviders().some((option) => option.id === provider)) {
        return res.status(400).json({
          message: `El método de pago ${provider} todavía no está habilitado. Use Mercado Pago o la transferencia directa.`,
          code: "payment_provider_unavailable",
        });
      }

      const business = await storage.getBusiness(req.user.businessId);
      if (!business) {
        return res.status(404).json({ message: "Empresa no encontrada" });
      }

      const result = await startCheckout({
        business,
        userId: req.user.id,
        userEmail: req.user.email,
        providerId: provider as PaymentProviderId,
        planId: plan,
        period: period as PlanPeriod,
        baseUrl: resolveBaseUrl(req),
        mode,
        discountCode,
      });

      if (result.mode === 'subscription') {
        return res.status(201).json({
          mode: 'subscription',
          redirectUrl: result.redirectUrl,
          subscription: toPublicSubscription(result.subscription, 'Pendiente de activación', false),
        });
      }

      res.status(201).json({
        mode: 'payment',
        payment: toPublicPayment(result.payment),
        redirectUrl: result.redirectUrl,
        instructions: result.instructions,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      }
      // A refused code is the customer's own input, not a gateway failure: it gets a
      // 400 with the reason and a code the dialog can show inline.
      if (error instanceof DiscountRejectedError) {
        return res.status(400).json({ message: error.message, code: "discount_rejected" });
      }
      console.error('Error starting checkout:', error);
      res.status(502).json({
        message: error instanceof Error ? error.message : "No se pudo iniciar el pago",
      });
    }
  });

  // ---- Discount codes -------------------------------------------------------

  /**
   * Preview of what a promo code would do to this plan.
   *
   * Read-only and cheap: the dialog calls it to show "con PRO10 pagas S/ 26.10"
   * before sending anyone to a payment page. The checkout re-validates the code
   * against the price it is about to charge, because this answer is a courtesy and
   * never the basis for charging.
   *
   * Answers 200 with `ok: false` for a code that does not apply: an invalid code is
   * not an error, it is an answer.
   */
  app.post('/api/payments/discount', requireAuth, requireNonDemo, async (req: any, res) => {
    try {
      const { plan, period, code } = z.object({
        plan: z.string(),
        period: z.string().default('monthly'),
        code: z.string().trim().max(40),
      }).parse(req.body);

      if (!isPlanId(plan) || !isPlanPeriod(period)) {
        return res.status(400).json({ message: "Plan o periodo inválido" });
      }

      const listCents = await effectivePlanAmountCents(plan, period);
      const evaluation = await evaluateDiscountForCheckout(code, { planId: plan, amountCents: listCents });

      res.json({
        ok: evaluation.ok,
        reason: evaluation.reason ?? null,
        label: evaluation.label,
        listAmountCents: listCents,
        amountOffCents: evaluation.amountOffCents,
        finalAmountCents: evaluation.finalAmountCents,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      }
      console.error('Error previewing a discount code:', error);
      res.status(500).json({ message: "No se pudo comprobar el código" });
    }
  });

  /**
   * Registered BEFORE `/api/payments/:id/...` on purpose: otherwise
   * `/api/payments/subscription` would be read as `:id = "subscription"`.
   */
  app.get('/api/payments/subscription', requireAuth, async (req: any, res) => {
    try {
      if (!req.user.businessId) {
        return res.status(404).json({ message: "La cuenta aún no tiene una empresa configurada" });
      }

      const current = await getActiveSubscription(req.user.businessId);
      if (!current) {
        return res.json({ subscription: null });
      }

      res.json({
        subscription: toPublicSubscription(current.subscription, current.statusLabel, current.isLive),
      });
    } catch (error) {
      console.error('Error fetching subscription:', error);
      res.status(500).json({ message: "No se pudo cargar la suscripción" });
    }
  });

  /** Re-reads the agreement from the provider (the customer just authorised it). */
  app.post('/api/payments/subscription/refresh', requireAuth, async (req: any, res) => {
    try {
      if (!req.user.businessId) {
        return res.status(404).json({ message: "La cuenta aún no tiene una empresa configurada" });
      }

      const refreshed = await refreshSubscription(req.user.businessId);
      if (!refreshed) {
        return res.json({ subscription: null });
      }

      const current = await getActiveSubscription(req.user.businessId);
      res.json({
        subscription: current
          ? toPublicSubscription(current.subscription, current.statusLabel, current.isLive)
          : null,
      });
    } catch (error) {
      console.error('Error refreshing subscription:', error);
      res.status(502).json({ message: "No se pudo verificar la suscripción con el proveedor" });
    }
  });

  /**
   * Stops future charges. The current paid period is respected: access runs
   * until `currentPeriodEnd`, which is what the customer paid for.
   */
  app.post('/api/payments/subscription/cancel', requireAuth, requireNonDemo, requireAdmin, async (req: any, res) => {
    try {
      if (!req.user.businessId) {
        return res.status(404).json({ message: "La cuenta aún no tiene una empresa configurada" });
      }

      const cancelled = await cancelSubscriptionForBusiness(req.user.businessId);
      if (!cancelled) {
        return res.status(404).json({ message: "No hay una suscripción que cancelar" });
      }

      res.json({
        message:
          "Suscripción cancelada. No se harán más cobros automáticos y mantiene el acceso hasta el final del periodo pagado.",
        subscription: toPublicSubscription(cancelled, "Cancelada", false),
      });
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      res.status(502).json({
        message: error instanceof Error ? error.message : "No se pudo cancelar la suscripción",
      });
    }
  });

  // ---- Return from the PSP checkout ----------------------------------------

  app.post('/api/payments/:id/refresh', requireAuth, async (req: any, res) => {
    try {
      const payment = await storage.getPayment(req.params.id);
      if (!payment || payment.businessId !== req.user.businessId) {
        return res.status(404).json({ message: "Pago no encontrado" });
      }

      const refreshed = await refreshPayment(payment.id);
      res.json({ payment: refreshed ? toPublicPayment(refreshed) : null });
    } catch (error) {
      console.error('Error refreshing payment:', error);
      res.status(502).json({ message: "No se pudo verificar el pago con el proveedor" });
    }
  });

  // ---- Manual confirmation (bank transfer received) ------------------------

  // Platform staff only: `requireAdmin` here would let any customer confirm
  // their own transfer and grant themselves a paid plan for free.
  app.post('/api/payments/:id/confirm', requireAuth, requireNonDemo, requirePlatformAdmin, async (req: any, res) => {
    try {
      const payment = await storage.getPayment(req.params.id);
      // No tenant check on purpose: platform staff reconcile transfers for ANY
      // customer, and a customer can no longer reach this endpoint at all (403
      // above), so an ownership filter here would only break the team's access.
      if (!payment) {
        return res.status(404).json({ message: "Pago no encontrado" });
      }

      const confirmed = await confirmManualPayment(payment.id, req.user.id);
      if (!confirmed) {
        return res.status(404).json({ message: "Pago no encontrado" });
      }

      res.json({
        message: `Pago ${confirmed.reference} confirmado. El plan quedó activo.`,
        payment: toPublicPayment(confirmed),
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("manualmente")) {
        return res.status(400).json({ message: error.message });
      }
      console.error('Error confirming payment:', error);
      res.status(500).json({ message: "No se pudo confirmar el pago" });
    }
  });
}
