import type { Express } from "express";
import { z } from "zod";

import { isPlanId } from "@shared/plans";
import { BANK_ACCOUNT_CURRENCIES, MAX_BANK_ACCOUNTS, normalizePaymentDetails } from "@shared/payment-details";
import { storage } from "../storage";
import { requireAuth, requireNonDemo, requirePlatformAdmin } from "../middleware/requireAuth";
import { emailTestLimiter } from "../middleware/rateLimits";
import { emailService } from "../services/emailService";
import { envFallbackConfigured, readPaymentSettings, savePaymentSettings } from "../services/paymentSettingsService";
import {
  envAlertEmail,
  isFreePlanChangeAllowed,
  readPlatformSettings,
  savePlatformSettings,
} from "../services/platformSettingsService";
import { readPlanPricing, savePlanPricing, REPRICEABLE_PLAN_IDS } from "../services/pricingService";
import {
  createDiscountCode,
  deleteDiscountCode,
  listDiscountCodes,
  updateDiscountCode,
  validateDiscountInput,
} from "../services/discountService";
import { listPlatformChanges } from "../services/platformAuditService";
import { toPublicPayment } from "./payments.routes";


/**
 * Platform panel (operator-only): the LibroDigital team's tools.
 *
 *   GET    /api/admin/overview            - totals for the dashboard
 *   GET    /api/admin/customers           - every customer, its logins and its spend
 *   PATCH  /api/admin/customers/:id       - assign/change a subscription, block a tenant
 *   DELETE /api/admin/customers/:id       - wipe a customer (its RUC must be typed back)
 *   GET    /api/admin/payments            - every payment of every tenant
 *   GET    /api/admin/operators           - who is platform staff
 *   POST   /api/admin/operators           - grant the flag to an existing login
 *   DELETE /api/admin/operators/:userId   - revoke it (never the last operator)
 *
 * Everything here is guarded by `requirePlatformAdmin`, never by a role: every
 * customer is `admin` of their own business, so a role check would hand the whole
 * panel to the tenants.
 */

/** What an operator may change about a customer's subscription. */
const customerPatchSchema = z
  .object({
    subscriptionPlan: z.string().refine(isPlanId, "Plan desconocido").optional(),
    planPeriod: z.enum(["monthly", "annual"]).optional(),
    subscriptionStatus: z
      .enum(["trialing", "active", "past_due", "canceled", "trial_ended"])
      .optional(),
    /** ISO date; `null` clears it (e.g. an open-ended plan). */
    currentPeriodEnd: z.string().datetime().nullable().optional(),
    trialEndsAt: z.string().datetime().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

const operatorSchema = z.object({ email: z.string().email() }).strict();

/**
 * Where the customer sends a transfer / Yape (Configuración).
 *
 * All optional: an operator may publish only a Yape number today and add the bank
 * accounts later. `PUT` replaces the whole record, which is what the console's form
 * sends, and every write is normalized afterwards (`normalizePaymentDetails`), so
 * an incomplete account row is dropped rather than stored and later printed.
 */
const blankToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

/** A form field: max length, "" collapses to `null` (the columns are nullable). */
const optionalField = (max: number, tooLong?: string) =>
  z.preprocess(
    blankToNull,
    z.string().trim().max(max, tooLong).nullable().optional(),
  );

const bankAccountSchema = z
  .object({
    bank: z.string().trim().min(1, "Indique el banco").max(120),
    accountType: optionalField(40),
    accountNumber: z.string().trim().min(1, "Indique el número de cuenta").max(60),
    cci: optionalField(40),
    currency: z.enum(BANK_ACCOUNT_CURRENCIES).optional(),
    holder: optionalField(160),
  })
  .strict();

const paymentSettingsSchema = z
  .object({
    holderName: optionalField(160),
    holderRuc: z.preprocess(
      blankToNull,
      z
        .string()
        .trim()
        .regex(/^\d{11}$/, "El RUC debe tener 11 dígitos")
        .nullable()
        .optional(),
    ),
    yapeNumber: optionalField(40),
    plinNumber: optionalField(40),
    voucherEmail: z.preprocess(
      blankToNull,
      z.string().trim().toLowerCase().email("Correo inválido").max(255).nullable().optional(),
    ),
    voucherWhatsapp: optionalField(40),
    bankAccounts: z
      .array(bankAccountSchema)
      .max(MAX_BANK_ACCOUNTS, `Máximo ${MAX_BANK_ACCOUNTS} cuentas`)
      .optional(),
    notes: optionalField(2000),
  })
  .strict();

/** Reusable: an optional e-mail field whose empty string means "not set". */
const optionalEmail = (max = 255) =>
  z.preprocess(
    blankToNull,
    z.string().trim().toLowerCase().email("Correo inválido").max(max).nullable().optional(),
  );

/**
 * The platform's operational settings (Configuración → Operación / Identidad).
 *
 * All optional and `strict`, like the payment settings: the console sends the whole
 * record, and a stray key must not silently become a column.
 *
 * `allowFreePlanChange` is the dangerous one. It is a plain boolean here; what makes
 * it acceptable is that every save is written to `platform_config_audit` with the
 * operator's e-mail, and the UI asks for an explicit confirmation.
 */
const platformSettingsSchema = z
  .object({
    alertEmail: optionalEmail(),
    legalName: optionalField(200),
    commercialName: optionalField(200),
    ruc: z.preprocess(
      blankToNull,
      z
        .string()
        .trim()
        .regex(/^\d{11}$/, "El RUC debe tener 11 dígitos")
        .nullable()
        .optional(),
    ),
    fiscalAddress: optionalField(300),
    contactEmail: optionalEmail(),
    contactPhone: optionalField(40),
    website: z.preprocess(
      blankToNull,
      z.string().trim().url("Sitio web inválido (use https://...)").max(255).nullable().optional(),
    ),
    allowFreePlanChange: z.boolean().optional(),
  })
  .strict();

/** The price list: every repricable plan at once, plus the trial length. */
const planPricingSchema = z
  .object({
    prices: z
      .array(
        z
          .object({
            planId: z.string().refine(isPlanId, "Plan desconocido"),
            monthlyCents: z.number().int().min(0).max(100_000_00),
            annualCents: z.number().int().min(0).max(1_000_000_00),
          })
          .strict(),
      )
      .min(1)
      .max(REPRICEABLE_PLAN_IDS.length),
    trialDays: z.number().int().min(1, "La prueba debe durar al menos 1 día").max(365),
  })
  .strict();

/** A discount code. `value` is a percent (1-100) or céntimos, per `kind`. */
const discountCodeSchema = z
  .object({
    code: z.string().trim().min(2, "El código debe tener al menos 2 caracteres").max(40),
    description: optionalField(300),
    kind: z.enum(["percent", "fixed"]),
    value: z.number().int().positive("El valor debe ser mayor que cero"),
    planIds: z.array(z.string().refine(isPlanId, "Plan desconocido")).max(5).optional(),
    maxRedemptions: z.number().int().positive().nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
  })
  .strict();

/** A partial update: only the fields the console actually changed. */
const discountPatchSchema = discountCodeSchema.partial().extend({ isActive: z.boolean().optional() }).strict();


export function registerAdminRoutes(app: Express): void {
  app.get('/api/admin/overview', requireAuth, requireNonDemo, requirePlatformAdmin, async (_req, res) => {
    try {
      const [businesses, users, operators, payments, pending] = await Promise.all([
        storage.getAllBusinesses(),
        storage.getAllUsers(),
        storage.listPlatformAdmins(),
        storage.listAllPayments(1000),
        storage.listPendingManualPayments(),
      ]);

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const paid = payments.filter((payment) => payment.status === "paid");

      const byPlan: Record<string, number> = {};
      for (const business of businesses) {
        byPlan[business.subscriptionPlan] = (byPlan[business.subscriptionPlan] ?? 0) + 1;
      }

      res.json({
        customers: businesses.length,
        activeCustomers: businesses.filter((business) => business.isActive).length,
        logins: users.length,
        operators: operators.length,
        byPlan,
        trialsEndingThisWeek: businesses.filter(
          (business) =>
            business.trialEndsAt && business.trialEndsAt > now && business.trialEndsAt <= weekFromNow,
        ).length,
        /** Money actually received, in céntimos: what the plan row cannot tell us. */
        paidThisMonthCents: paid
          .filter((payment) => payment.paidAt && payment.paidAt >= startOfMonth)
          .reduce((sum, payment) => sum + payment.amountCents, 0),
        collectedTotalCents: paid.reduce((sum, payment) => sum + payment.amountCents, 0),
        pendingTransfers: pending.length,
      });
    } catch (error) {
      console.error('Error building the admin overview:', error);
      res.status(500).json({ message: "No se pudo cargar el resumen" });
    }
  });

  app.get('/api/admin/customers', requireAuth, requireNonDemo, requirePlatformAdmin, async (_req, res) => {
    try {
      const [businesses, users, payments] = await Promise.all([
        storage.getAllBusinesses(),
        storage.getAllUsers(),
        storage.listAllPayments(1000),
      ]);

      const customers = businesses.map((business) => {
        const own = payments.filter((payment) => payment.businessId === business.id);
        return {
          /** Plan, status and period end live here - this is the subscription. */
          business,
          logins: users
            .filter((user) => user.businessId === business.id)
            .map((user) => ({
              id: user.id,
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
              role: user.role,
              isActive: user.isActive,
              isEmailVerified: user.isEmailVerified,
              isDemo: user.isDemo,
              lastLoginAt: user.lastLoginAt,
              createdAt: user.createdAt,
            })),
          paymentCount: own.length,
          paidCents: own
            .filter((payment) => payment.status === "paid")
            .reduce((sum, payment) => sum + payment.amountCents, 0),
          pendingCents: own
            .filter((payment) => payment.status === "pending")
            .reduce((sum, payment) => sum + payment.amountCents, 0),
        };
      });

      res.json(customers);
    } catch (error) {
      console.error('Error listing customers:', error);
      res.status(500).json({ message: "No se pudieron cargar los clientes" });
    }
  });

  /**
   * Assign or change a customer's subscription by hand: the plan, the period, the
   * renewal date and the account state. This is what an operator does after a
   * transfer or a Yape arrived, or when a customer is given a month for free.
   */
  app.patch('/api/admin/customers/:businessId', requireAuth, requireNonDemo, requirePlatformAdmin, async (req: any, res) => {
    try {
      const parsed = customerPatchSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.issues[0]?.message ?? "Datos inválidos",
        });
      }

      const business = await storage.getBusinessById(req.params.businessId);
      if (!business) {
        return res.status(404).json({ message: "Cliente no encontrado" });
      }

      const changes = parsed.data;
      const updated = await storage.updateBusiness(business.id, {
        ...(changes.subscriptionPlan ? { subscriptionPlan: changes.subscriptionPlan } : {}),
        ...(changes.planPeriod ? { planPeriod: changes.planPeriod } : {}),
        ...(changes.subscriptionStatus ? { subscriptionStatus: changes.subscriptionStatus } : {}),
        ...(changes.currentPeriodEnd !== undefined
          ? { currentPeriodEnd: changes.currentPeriodEnd ? new Date(changes.currentPeriodEnd) : null }
          : {}),
        ...(changes.trialEndsAt !== undefined
          ? { trialEndsAt: changes.trialEndsAt ? new Date(changes.trialEndsAt) : null }
          : {}),
        ...(changes.isActive !== undefined ? { isActive: changes.isActive } : {}),
      });

      res.json({ business: updated });
    } catch (error) {
      console.error('Error updating a customer:', error);
      res.status(500).json({ message: "No se pudo actualizar el cliente" });
    }
  });

  /**
   * Wipes a customer: its logins, complaints, establishments, books and payments.
   *
   * The Libro de Reclamaciones is legal evidence, so this can never be a one-click
   * accident: the operator has to type the customer's RUC back. Deactivating
   * (`PATCH { isActive: false }`) is the reversible answer for everything else.
   */
  app.delete('/api/admin/customers/:businessId', requireAuth, requireNonDemo, requirePlatformAdmin, async (req: any, res) => {
    try {
      const business = await storage.getBusinessById(req.params.businessId);
      if (!business) {
        return res.status(404).json({ message: "Cliente no encontrado" });
      }

      const typedRuc = String(req.body?.confirmRuc ?? "").trim();
      if (typedRuc !== business.ruc) {
        return res.status(400).json({
          message: "Para eliminar el cliente escriba su RUC exacto en «confirmRuc».",
        });
      }

      await storage.purgeBusiness(business.id);
      res.json({ deleted: true, businessId: business.id, ruc: business.ruc });
    } catch (error) {
      console.error('Error deleting a customer:', error);
      res.status(500).json({ message: "No se pudo eliminar el cliente" });
    }
  });

  /** Revenue reconciliation: every payment of every tenant, with its customer. */
  app.get('/api/admin/payments', requireAuth, requireNonDemo, requirePlatformAdmin, async (_req, res) => {
    try {
      const payments = await storage.listAllPayments();

      const rows = await Promise.all(
        payments.map(async (payment) => {
          const business = payment.businessId
            ? await storage.getBusinessById(payment.businessId)
            : undefined;
          return {
            ...toPublicPayment(payment),
            businessId: payment.businessId,
            businessName: business?.businessName ?? null,
            ruc: business?.ruc ?? null,
          };
        }),
      );

      res.json(rows);
    } catch (error) {
      console.error('Error listing every payment:', error);
      res.status(500).json({ message: "No se pudieron cargar los pagos" });
    }
  });

  /**
   * One customer in full: everything support needs while the customer is on the
   * phone (its logins, its money, its book and its integrations).
   */
  app.get('/api/admin/customers/:businessId', requireAuth, requireNonDemo, requirePlatformAdmin, async (req: any, res) => {
    try {
      const business = await storage.getBusinessById(req.params.businessId);
      if (!business) {
        return res.status(404).json({ message: "Cliente no encontrado" });
      }

      const [logins, payments, subscriptions, establishments, complaints, apiKeys] =
        await Promise.all([
          storage.getUsersByBusinessIds([business.id]),
          storage.getPaymentsByBusiness(business.id),
          storage.getSubscriptionsByBusiness(business.id),
          storage.getEstablishmentsByBusiness(business.id),
          storage.getComplaintsByBusiness(business.id),
          storage.getApiKeysByBusiness(business.id),
        ]);

      const openComplaints = complaints.filter((complaint) => !complaint.responseDate);

      res.json({
        business,
        logins: logins.map((user) => ({
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          isActive: user.isActive,
          isEmailVerified: user.isEmailVerified,
          isDemo: user.isDemo,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt,
        })),
        payments: payments.map(toPublicPayment),
        subscriptions: subscriptions.map((subscription) => ({
          id: subscription.id,
          reference: subscription.reference,
          provider: subscription.provider,
          planId: subscription.planId,
          period: subscription.period,
          status: subscription.status,
          nextPaymentAt: subscription.nextPaymentAt,
          startedAt: subscription.startedAt,
          cancelledAt: subscription.cancelledAt,
          createdAt: subscription.createdAt,
        })),
        establishments: establishments.map((establishment) => ({
          id: establishment.id,
          name: establishment.name,
          address: establishment.address,
          identificationCode: establishment.identificationCode,
          isActive: establishment.isActive,
        })),
        complaints: {
          total: complaints.length,
          /** No `responseDate` yet: still inside the 15 business days. */
          pending: openComplaints.length,
          latest: complaints.slice(0, 5).map((complaint) => ({
            id: complaint.id,
            correlativeNumber: complaint.correlativeNumber,
            complaintType: complaint.complaintType,
            status: complaint.status,
            submissionDate: complaint.submissionDate,
            dueDate: complaint.dueDate,
          })),
        },
        apiKeys: { total: apiKeys.length },
      });
    } catch (error) {
      console.error('Error loading a customer:', error);
      res.status(500).json({ message: "No se pudo cargar el cliente" });
    }
  });

  /** The billing desk: every recurring agreement, with who pays for it. */
  app.get('/api/admin/subscriptions', requireAuth, requireNonDemo, requirePlatformAdmin, async (_req, res) => {
    try {
      const [subscriptions, businesses] = await Promise.all([
        storage.listAllSubscriptions(),
        storage.getAllBusinesses(),
      ]);
      const byId = new Map(businesses.map((business) => [business.id, business]));

      res.json(
        subscriptions.map((subscription) => {
          const business = subscription.businessId ? byId.get(subscription.businessId) : undefined;
          return {
            id: subscription.id,
            reference: subscription.reference,
            provider: subscription.provider,
            planId: subscription.planId,
            period: subscription.period,
            status: subscription.status,
            nextPaymentAt: subscription.nextPaymentAt,
            startedAt: subscription.startedAt,
            cancelledAt: subscription.cancelledAt,
            createdAt: subscription.createdAt,
            businessId: subscription.businessId,
            businessName: business?.businessName ?? null,
            ruc: business?.ruc ?? null,
          };
        }),
      );
    } catch (error) {
      console.error('Error listing subscriptions:', error);
      res.status(500).json({ message: "No se pudieron cargar las suscripciones" });
    }
  });

  /**
   * Where the company collects a transfer / Yape (Configuración).
   *
   * Operator-only, like the rest of the console: these are the platform's own bank
   * accounts, and the write path is the one an attacker would want (point a paying
   * customer at their own Yape number). `requirePlatformAdmin` is therefore on both
   * endpoints, not just the mutating one.
   *
   * `envFallbackConfigured` is reported so the screen can say which text a customer
   * would read today, even before anything is saved here.
   */
  app.get('/api/admin/payment-settings', requireAuth, requireNonDemo, requirePlatformAdmin, async (_req, res) => {
    try {
      const view = await readPaymentSettings();
      res.json({ ...view, envFallbackConfigured: envFallbackConfigured() });
    } catch (error) {
      console.error('Error reading the payment settings:', error);
      res.status(500).json({ message: "No se pudieron cargar los datos de pago" });
    }
  });

  /**
   * Saves them. `PUT`, not `PATCH`: the console always sends the complete record,
   * so an operator who clears the Yape field really does remove the number instead
   * of keeping an invisible stale one that the next checkout would still print.
   */
  app.put('/api/admin/payment-settings', requireAuth, requireNonDemo, requirePlatformAdmin, async (req: any, res) => {
    try {
      const parsed = paymentSettingsSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        // Row number included: with several accounts, "Indique el número de cuenta"
        // alone does not tell the operator which one to fix.
        const issue = parsed.error.issues[0];
        const row = typeof issue?.path?.[1] === 'number' ? ` (cuenta ${Number(issue.path[1]) + 1})` : '';
        return res.status(400).json({
          message: `${issue?.message ?? 'Datos inválidos'}${row}`,
          errors: parsed.error.issues,
        });
      }

      // Validated, then normalized: one shared function decides what a stored value
      // looks like, so the row written here is exactly what the instructions read.
      const normalized = normalizePaymentDetails(parsed.data);
      const bankAccounts = normalized.bankAccounts.map((account) => ({
        ...account,
        currency: BANK_ACCOUNT_CURRENCIES.includes(account.currency) ? account.currency : "PEN",
      }));

      const view = await savePaymentSettings({ ...normalized, bankAccounts }, req.user.id);
      res.json({ ...view, envFallbackConfigured: envFallbackConfigured() });
    } catch (error) {
      console.error('Error saving the payment settings:', error);
      res.status(500).json({ message: "No se pudieron guardar los datos de pago" });
    }
  });

  /**
   * Platform health, on screen: exactly the checks the server logs at boot.
   *
   * A wrong value here fails silently and confusingly (payments that never
   * activate, transfers nobody can confirm, a webhook registered at the wrong
   * address), so the console shows the real, current values instead of asking an
   * operator to read a log file.
   */
  app.get('/api/admin/platform', requireAuth, requireNonDemo, requirePlatformAdmin, async (_req, res) => {
    try {
      const [businesses, users, operators, payments, pendingManual] = await Promise.all([
        storage.getAllBusinesses(),
        storage.getAllUsers(),
        storage.listPlatformAdmins(),
        storage.listAllPayments(1000),
        storage.listPendingManualPayments(),
      ]);

      // Where the customer-facing transfer details currently come from: the console
      // (Configuración) wins, the env var is the fallback for a database nobody has
      // opened yet.
      const settingsView = await readPaymentSettings();
      const envFallback = envFallbackConfigured();

      // Same two-halves read for the operational settings: what is stored and what is
      // in force. The console must never claim a value that the server is not using.
      const platform = await readPlatformSettings();
      const pricing = await readPlanPricing();
      const freePlanChange = await isFreePlanChangeAllowed();

      const appUrl = (process.env.APP_URL ?? '').trim().replace(/\/+$/, '');
      const adminPath = (process.env.VITE_ADMIN_PATH ?? '').trim() || '/acceso/operaciones-7f31';
      const mpToken = (process.env.MERCADOPAGO_ACCESS_TOKEN ?? '').trim();
      const sandbox = process.env.MERCADOPAGO_SANDBOX === 'true';

      const paid = payments.filter((payment) => payment.status === 'paid');
      const lastPayment = payments[0];

      res.json({
        adminPath,
        checks: [
          {
            id: 'app_url',
            label: 'APP_URL (enlaces de correo y retorno de pago)',
            detail: appUrl || null,
            ok: Boolean(appUrl),
            hint: 'Sin dominio público, Mercado Pago no puede notificar los pagos.',
          },
          {
            id: 'webhook',
            label: 'Webhook de Mercado Pago a registrar en el panel',
            detail: appUrl ? `${appUrl}/api/payments/webhook/mercadopago` : null,
            ok: Boolean(appUrl),
            hint: 'Debe estar en la pestaña que corresponde al tipo de credencial (prueba o productivo).',
          },
          {
            id: 'mp_credentials',
            label: 'Credencial de Mercado Pago',
            // Never echo the token: its prefix is enough to see which set is loaded.
            detail: mpToken ? `${mpToken.split('-')[0]}-…` : null,
            ok: Boolean(mpToken),
            hint: sandbox ? 'Modo de prueba (MERCADOPAGO_SANDBOX=true).' : 'Modo productivo.',
          },
          {
            id: 'platform_admins',
            label: 'Operadores con acceso al panel',
            detail: `${operators.length} (${operators.map((operator) => operator.email).join(', ') || 'ninguno'})`,
            ok: operators.length > 0,
            hint: 'Los añade el panel o npm run db:admin. PLATFORM_ADMIN_EMAILS solo sirve de arranque.',
          },
          {
            id: 'manual_instructions',
            label: 'Datos de transferencia/Yape que lee el cliente',
            detail: settingsView.hasDetails
              ? 'Configuración (panel)'
              : envFallback
                ? 'PAYMENTS_MANUAL_INSTRUCTIONS'
                : null,
            ok: settingsView.hasDetails || envFallback,
            hint: 'Se editan en Configuración → Datos de pago. Sin ellos el cliente solo lee «pídanos los datos de pago», que es mala primera impresión.',
          },
          {
            id: 'alert_email',
            label: 'Correo de alertas (suscripción pagada sin asignar)',
            detail: platform.effective.alertEmail || null,
            ok: Boolean(platform.effective.alertEmail),
            hint:
              platform.effective.alertEmailSource === 'panel'
                ? 'Configurado en Configuración → Alertas.'
                : platform.effective.alertEmailSource === 'env'
                  ? 'Viene de PAYMENTS_ALERT_EMAIL. Puede moverlo a Configuración.'
                  : 'Sin él, un pago que no se pudo asignar solo queda en el log.',
          },
          {
            id: 'smtp',
            label: 'Correo saliente (SMTP)',
            detail: process.env.SMTP_HOST ? `${process.env.SMTP_HOST}:${process.env.SMTP_PORT ?? ''}` : null,
            ok: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER),
            hint: 'Sin SMTP no salen recibos, ni verificaciones, ni avisos de reclamación. Pruébelo con el botón de Configuración → Correo.',
          },
          {
            id: 'free_plan_change',
            label: 'Cambio de plan SIN pago',
            detail: freePlanChange
              ? platform.stored.allowFreePlanChange
                ? 'ACTIVADO (panel)'
                : 'ACTIVADO (PAYMENTS_ALLOW_FREE_PLAN_CHANGE)'
              : null,
            ok: !freePlanChange,
            hint: 'Activado permite cambiar de plan sin cobrar: es una puerta abierta. Se cambia en Configuración → Operación, y queda en el historial.',
          },
          {
            id: 'plan_prices',
            label: 'Lista de precios',
            detail: `${pricing.plans.filter((plan) => plan.isOverride).length} de ${pricing.plans.length} con precio propio`,
            ok: true,
            hint: `Prueba gratuita: ${pricing.trialDays} días. Se editan en Planes, y el cobro usa esos mismos importes.`,
          },
        ],
        totals: {
          customers: businesses.length,
          logins: users.length,
          operators: operators.length,
          paidPayments: paid.length,
          collectedTotalCents: paid.reduce((sum, payment) => sum + payment.amountCents, 0),
          pendingTransfers: pendingManual.length,
          lastPaymentAt: lastPayment ? lastPayment.createdAt : null,
        },
      });
    } catch (error) {
      console.error('Error building the platform check:', error);
      res.status(500).json({ message: "No se pudo comprobar la plataforma" });
    }
  });

  // ---- Platform configuration (identity, alerts, flags) ----------------------

  /**
   * The platform's own identity, alert mailbox and the dangerous flag.
   *
   * Served to both console screens that show them, together with the environment
   * values they may fall back to - so the console never renders a value the server
   * would not use, and never hides which of the two is in force.
   */
  const envSnapshot = () => ({
    alertEmail: envAlertEmail(),
    freePlanChange: process.env.PAYMENTS_ALLOW_FREE_PLAN_CHANGE === 'true',
    smtpHost: process.env.SMTP_HOST ?? null,
    smtpPort: process.env.SMTP_PORT ?? null,
    smtpUser: process.env.SMTP_USER ?? null,
    smtpFromEmail: process.env.SMTP_FROM_EMAIL ?? null,
  });

  app.get('/api/admin/platform-settings', requireAuth, requireNonDemo, requirePlatformAdmin, async (_req, res) => {
    try {
      res.json({ ...(await readPlatformSettings()), env: envSnapshot() });
    } catch (error) {
      console.error('Error reading the platform settings:', error);
      res.status(500).json({ message: "No se pudo cargar la configuración" });
    }
  });

  /** Saves them. Every save lands in the change history, by order of the service. */
  app.put('/api/admin/platform-settings', requireAuth, requireNonDemo, requirePlatformAdmin, async (req: any, res) => {
    try {
      const parsed = platformSettingsSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.issues[0]?.message ?? "Datos inválidos",
          errors: parsed.error.issues,
        });
      }

      if (parsed.data.allowFreePlanChange === true) {
        // Turning it ON is the one change worth shouting about in the server log.
        console.warn(
          `[console] ${req.user.email} activó el cambio de plan SIN pago.`,
        );
      }

      const view = await savePlatformSettings(parsed.data, {
        userId: req.user.id,
        email: req.user.email ?? null,
      });

      res.json({ ...view, env: envSnapshot() });
    } catch (error) {
      console.error('Error saving the platform settings:', error);
      res.status(500).json({ message: "No se pudo guardar la configuración" });
    }
  });

  /**
   * Sends a real message through the configured SMTP, to the operator's OWN address.
   *
   * The recipient comes from the session and never from the body: the console has no
   * business acting as a relay, and testing deliverability only needs proof that a
   * message leaves the server and lands somewhere the operator can look at.
   */
  app.post(
    '/api/admin/email-test',
    requireAuth,
    requireNonDemo,
    requirePlatformAdmin,
    emailTestLimiter,
    async (req: any, res) => {
      try {
        const connected = await emailService.testConnection();
        if (!connected) {
          return res.status(502).json({
            ok: false,
            message:
              "No se pudo conectar al servidor SMTP. Revise SMTP_HOST, SMTP_PORT, SMTP_USER y SMTP_PASSWORD.",
          });
        }

        await emailService.sendTestEmail(req.user.email, req.user.firstName);
        res.json({ ok: true, message: `Correo de prueba enviado a ${req.user.email}.` });
      } catch (error) {
        console.error('[console] the SMTP test failed:', error);
        res.status(502).json({
          ok: false,
          message: 'La conexión SMTP funciona, pero no se pudo enviar el correo de prueba.',
        });
      }
    },
  );

  // ---- Price list (Planes) ---------------------------------------------------

  /** What we charge today, next to what the code ships with. */
  app.get('/api/admin/plan-pricing', requireAuth, requireNonDemo, requirePlatformAdmin, async (_req, res) => {
    try {
      res.json(await readPlanPricing());
    } catch (error) {
      console.error('Error reading the price list:', error);
      res.status(500).json({ message: "No se pudo cargar la lista de precios" });
    }
  });

  /**
   * Saves prices and the trial length together, then writes the change history.
   *
   * This is the single place a price may change, and the checkout charges from the
   * same values - so the console cannot make a page say one thing and the payment
   * another.
   */
  app.put('/api/admin/plan-pricing', requireAuth, requireNonDemo, requirePlatformAdmin, async (req: any, res) => {
    try {
      const parsed = planPricingSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.issues[0]?.message ?? "Datos inválidos",
          errors: parsed.error.issues,
        });
      }

      for (const price of parsed.data.prices) {
        if (!REPRICEABLE_PLAN_IDS.includes(price.planId)) {
          return res.status(400).json({ message: `El plan ${price.planId} no tiene precio que cambiar` });
        }
        if (price.monthlyCents === 0 && price.annualCents === 0) {
          // A paid plan priced at S/ 0 would sell the paid tier for free.
          return res.status(400).json({
            message: `El plan ${price.planId} no puede quedar en S/ 0.00: para eso está el plan Gratis.`,
          });
        }
      }

      await savePlanPricing(parsed.data, { userId: req.user.id, email: req.user.email ?? null });
      res.json(await readPlanPricing());
    } catch (error) {
      console.error('Error saving the price list:', error);
      res.status(500).json({ message: "No se pudo guardar la lista de precios" });
    }
  });



  // ---- Discount codes (Descuentos) -------------------------------------------

  /** Every code an operator created, with its state resolved. */
  app.get('/api/admin/discount-codes', requireAuth, requireNonDemo, requirePlatformAdmin, async (_req, res) => {
    try {
      res.json({ codes: await listDiscountCodes() });
    } catch (error) {
      console.error('Error listing discount codes:', error);
      res.status(500).json({ message: "No se pudieron cargar los descuentos" });
    }
  });

  app.post('/api/admin/discount-codes', requireAuth, requireNonDemo, requirePlatformAdmin, async (req: any, res) => {
    try {
      const parsed = discountCodeSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.issues[0]?.message ?? "Datos inválidos",
          errors: parsed.error.issues,
        });
      }

      const invalid = validateDiscountInput(parsed.data);
      if (invalid) {
        return res.status(400).json({ message: invalid });
      }

      const created = await createDiscountCode(parsed.data, {
        userId: req.user.id,
        email: req.user.email ?? null,
      });
      res.status(201).json({ code: created });
    } catch (error) {
      // Duplicate codes are a form error, not a server fault.
      const message = error instanceof Error ? error.message : "No se pudo crear el descuento";
      res.status(message.includes("ya existe") ? 409 : 500).json({ message });
    }
  });

  app.patch('/api/admin/discount-codes/:id', requireAuth, requireNonDemo, requirePlatformAdmin, async (req: any, res) => {
    try {
      const parsed = discountPatchSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.issues[0]?.message ?? "Datos inválidos",
          errors: parsed.error.issues,
        });
      }

      const updated = await updateDiscountCode(req.params.id, parsed.data, {
        userId: req.user.id,
        email: req.user.email ?? null,
      });
      if (!updated) {
        return res.status(404).json({ message: "Ese descuento no existe" });
      }

      res.json({ code: updated });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo actualizar el descuento";
      res.status(message.includes("ya existe") ? 409 : 500).json({ message });
    }
  });

  /**
   * Removes a code that was never used.
   *
   * One that has redemptions answers 409 instead of deleting: the payments that used
   * it point at the row, so deleting it would erase the explanation of a discount
   * somebody was actually given.
   */
  app.delete('/api/admin/discount-codes/:id', requireAuth, requireNonDemo, requirePlatformAdmin, async (req: any, res) => {
    try {
      const deleted = await deleteDiscountCode(req.params.id, {
        userId: req.user.id,
        email: req.user.email ?? null,
      });
      if (!deleted) {
        return res.status(404).json({ message: "Ese descuento no existe" });
      }
      res.json({ deleted: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo eliminar el descuento";
      res.status(message.includes("ya se usó") ? 409 : 500).json({ message });
    }
  });

  // ---- Change history --------------------------------------------------------

  /**
   * Who changed what, newest first.
   *
   * The reason the console may expose a dangerous flag at all: months later, "why is
   * this customer's plan free?" has an answer that does not depend on a rotated log
   * file.
   */
  app.get('/api/admin/config-history', requireAuth, requireNonDemo, requirePlatformAdmin, async (req, res) => {
    try {
      const limit = Number.parseInt(String((req.query as any).limit ?? '50'), 10);
      res.json({ changes: await listPlatformChanges(Number.isFinite(limit) ? limit : 50) });
    } catch (error) {
      console.error('Error reading the change history:', error);
      res.status(500).json({ message: "No se pudo cargar el historial" });
    }
  });

  app.get('/api/admin/operators', requireAuth, requireNonDemo, requirePlatformAdmin, async (_req, res) => {
    try {
      const [users, operators] = await Promise.all([
        storage.getAllUsers(),
        storage.listPlatformAdmins(),
      ]);

      const operatorIds = new Set(operators.map((operator) => operator.id));

      res.json({
        operators: operators.map((operator) => ({
          id: operator.id,
          email: operator.email,
          firstName: operator.firstName,
          lastName: operator.lastName,
          isActive: operator.isActive,
          lastLoginAt: operator.lastLoginAt,
          createdAt: operator.createdAt,
        })),
        /** Existing logins that could be promoted (the panel never creates them). */
        candidates: users
          .filter((user) => !operatorIds.has(user.id))
          .map((user) => ({
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            isDemo: user.isDemo,
            businessName: user.businessName,
          })),
      });
    } catch (error) {
      console.error('Error listing operators:', error);
      res.status(500).json({ message: "No se pudo cargar el equipo" });
    }
  });

  /**
   * Grants operator powers to an existing login.
   *
   * The login already has to exist (the panel does not mint accounts, that is what
   * `/registro` and `scripts/setup-platform-admin.mjs` are for), and a demo login is
   * refused outright: its password is public.
   */
  app.post('/api/admin/operators', requireAuth, requireNonDemo, requirePlatformAdmin, async (req: any, res) => {
    try {
      const parsed = operatorSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ message: "Escriba un correo válido" });
      }

      const user = await storage.getUserByEmail(parsed.data.email);
      if (!user) {
        return res.status(404).json({
          message:
            "No existe un usuario con ese correo. Créelo primero (o use el script de operadores).",
        });
      }
      if (user.isDemo) {
        return res.status(403).json({ message: "La cuenta demo no puede ser operador." });
      }
      if (user.isPlatformAdmin) {
        return res.status(409).json({ message: "Ese usuario ya es operador." });
      }

      const updated = await storage.setPlatformAdmin(user.id, true);
      res.json({
        operator: {
          id: user.id,
          email: user.email,
          isPlatformAdmin: updated?.isPlatformAdmin ?? true,
        },
      });
    } catch (error) {
      console.error('Error granting operator rights:', error);
      res.status(500).json({ message: "No se pudo dar acceso de operador" });
    }
  });

  /**
   * Revokes operator powers.
   *
   * The last operator can never be removed: with the flag gone and an empty
   * `PLATFORM_ADMIN_EMAILS` nobody could ever manage customers again.
   */
  app.delete('/api/admin/operators/:userId', requireAuth, requireNonDemo, requirePlatformAdmin, async (req: any, res) => {
    try {
      const target = await storage.getUser(req.params.userId);
      if (!target || !target.isPlatformAdmin) {
        return res.status(404).json({ message: "Ese usuario no es operador" });
      }

      const operators = await storage.listPlatformAdmins();
      if (operators.length <= 1) {
        return res.status(409).json({
          message: "Es el último operador: no se puede quitar (nadie podría gestionar clientes).",
        });
      }

      await storage.setPlatformAdmin(target.id, false);
      res.json({ revoked: true, userId: target.id, email: target.email });
    } catch (error) {
      console.error('Error revoking operator rights:', error);
      res.status(500).json({ message: "No se pudo quitar el acceso de operador" });
    }
  });
}
