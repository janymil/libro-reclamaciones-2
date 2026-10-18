import crypto from "crypto";

import {
  PAYMENT_CURRENCY,
  PAYMENT_CURRENCY_SYMBOL,
  SUBSCRIPTION_STATUS_LABELS,
  availablePaymentProviders,
  buildPaymentReference,
  centsToSoles,
  computePeriodEnd,
  getPaymentProvider,
  isManualPaymentMethod,
  isPaymentSuccessful,
  isPubliclyReachableBaseUrl,
  isSubscriptionLive,
  isSubscriptionStatus,
  paymentFailureHint,
  referenceSuffix,
  resolvePlanFromAmount,
  resolvePlanFromCode,
  type PaymentMethodId,
  type PaymentProviderDefinition,
  type PaymentProviderId,
  type PaymentStatus,
  type PlanPeriod,
  type SubscriptionStatus,
} from "@shared/payments";
import { getPlan, isPlanId, isTrialing } from "@shared/plans";
import { buildTransferInstructions } from "@shared/payment-details";
import { buildPaymentResumeUrl } from "@shared/payment-recovery";
import { formatCalendarDate } from "@shared/peru-time";
import { getComprobanteDocType, COMPROBANTE_ISSUE_NOTE, type BillingData } from "@shared/comprobantes";
import { formatIgvRate, igvBreakdown } from "@shared/tax";
import type { Business, Payment, Subscription } from "@shared/schema";

import { storage } from "../storage";
import { emailService } from "./emailService";
import { ensureComprobanteForPayment } from "./comprobanteService";
import { redeemDiscountForPayment, evaluateDiscountForCheckout, DiscountRejectedError } from "./discountService";
import { effectivePlanAmountCents } from "./pricingService";
import { readTransferDetails } from "./paymentSettingsService";
import { getAlertEmail, getIdentity } from "./platformSettingsService";

import {
  getGateway,
  type CheckoutInput,
  type PayerProfile,
  type ProviderStatus,
  type SubscriptionCheckoutInput,
  type SubscriptionState,
} from "./paymentGateway";

/**
 * Payments orchestration (Phase 2.7).
 *
 * Turns "the admin clicked Upgrade" into money, and money back into a plan:
 *
 *   1. `startPayment`   creates a `pending` row, asks the provider for a
 *                       checkout and stores where the customer must go.
 *   2. the customer pays, the provider fires a webhook.
 *   3. `handleProviderWebhook` looks the row up, asks the provider API for the
 *                       *authoritative* status and calls `settlePayment`.
 *   4. `settlePayment` is the single write path: it is the only place a payment
 *                       becomes `paid`, and therefore the only place a plan is
 *                       activated - so a plan can never be unlocked twice or by
 *                       a forged webhook.
 *
 * `applyPaidPeriod` is pure, so the billing arithmetic (renewals, early
 * payments, paying during the trial) is unit-tested without a database.
 */

/** A readable code that no customer can guess from another one. */
export function newPaymentReference(): string {
  return buildPaymentReference(referenceSuffix(crypto.randomBytes(6)));
}

/**
 * Warns once per process when the configured base URL cannot be reached from the
 * internet.
 *
 * This is the most expensive misconfiguration in the whole payment flow: the
 * customer pays, Mercado Pago cannot deliver the webhook, and the plan never
 * activates - with nothing in the logs to explain it. A warning at the moment the
 * payment is created turns that into a five-second fix.
 */
let warnedAboutUnreachableBase = false;

function warnIfBaseUrlUnreachable(baseUrl: string): void {
  if (warnedAboutUnreachableBase || isPubliclyReachableBaseUrl(baseUrl)) {
    return;
  }

  warnedAboutUnreachableBase = true;
  console.warn(
    `[payments] APP_URL es "${baseUrl}", que no es una dirección pública HTTPS. ` +
      'Mercado Pago no podrá enviar las notificaciones de pago y el cliente volverá a una ' +
      'dirección inalcanzable, así que el plan no se activará solo. ' +
      'Configure APP_URL con el dominio real, o con un túnel público mientras prueba.',
  );
}

/**
 * What a successful payment writes onto the business row.
 *
 * The keys here are **column** names, not friendly ones: this object goes straight
 * into `storage.updateBusiness`, and Drizzle silently drops a key that matches no
 * column. An earlier version returned `plan` instead of `subscriptionPlan`, so a
 * paying customer's period was credited while the plan itself stayed on `gratis` -
 * a bug that no assertion on the return value could see. `paymentReceipt.test.ts`
 * now asserts the keys that actually reach the database.
 */
export interface PaidPeriodResult {
  subscriptionPlan: string;
  planPeriod: PlanPeriod;
  subscriptionStatus: string;
  currentPeriodEnd: Date;
}

/**
 * What a successful payment does to the business.
 *
 * Renewals stack: if a paid period is still running, the new one is added on
 * top of `currentPeriodEnd`, so paying early never loses days. Inside the free
 * trial the paid period starts when the trial ends, so a customer who pays on
 * day 2 still gets the 7 free days they were promised.
 */
export function applyPaidPeriod(
  business: Pick<Business, "subscriptionStatus" | "currentPeriodEnd" | "trialEndsAt">,
  planId: string,
  period: PlanPeriod,
  now: Date = new Date(),
): PaidPeriodResult {
  const trialEnds = business.trialEndsAt ? new Date(business.trialEndsAt) : null;
  const trialing = business.subscriptionStatus === "trialing" && !!trialEnds && trialEnds > now;

  const paidEnd = business.currentPeriodEnd ? new Date(business.currentPeriodEnd) : null;

  // Start from whichever entitlement is furthest in the future: an existing paid
  // period, otherwise the remaining trial, otherwise today.
  let base = now;
  if (paidEnd && paidEnd > base) {
    base = paidEnd;
  } else if (trialing && trialEnds && trialEnds > base) {
    base = trialEnds;
  }

  return {
    subscriptionPlan: planId,
    planPeriod: period,
    // A paying customer inside the trial stays "trialing" until it expires;
    // only then does the paid plan (already stored) take over.
    subscriptionStatus: trialing ? "trialing" : "active",
    currentPeriodEnd: computePeriodEnd(base, period),
  };
}

// ---------------------------------------------------------------------------
// Provider availability (catalog + credentials)
// ---------------------------------------------------------------------------

export interface PaymentProviderOption extends PaymentProviderDefinition {
  /** The catalog offers it AND the credentials are present. */
  configured: boolean;
}

/**
 * What the checkout screen may show. A provider that is wired but has no keys
 * (e.g. Mercado Pago before you paste the access token) is still listed, but
 * with `configured: false`, so the UI can explain what is missing instead of
 * failing at the last step.
 */
export function paymentProviderOptions(): PaymentProviderOption[] {
  return availablePaymentProviders().map((provider) => {
    const gateway = getGateway(provider.id);
    return {
      ...provider,
      // The capability depends on the credentials actually in use: Mercado Pago's
      // sandbox `TEST-` token cannot create preapprovals even though the provider
      // can, so the checkout must not offer a recurring charge it cannot honour.
      supportsRecurring: gateway.supportsRecurring(),
      configured: gateway.isConfigured(),
    };
  });
}

// ---------------------------------------------------------------------------
// 1. Start a checkout
// ---------------------------------------------------------------------------

/**
 * What the provider's antifraud engine is told about the buyer.
 *
 * Mercado Pago scores a preference with an empty `payer` block as riskier, and a
 * live card can be refused (`cc_rejected_high_risk`) even when the order is
 * otherwise correct. Everything here comes from data the customer already gave
 * us - the account's name, the company's RUC and phone - and the gateway drops
 * anything that is not valid instead of inventing it.
 */
export function buildPayerProfile(
  business: Pick<Business, "ruc" | "phone">,
  input: { userFirstName?: string; userLastName?: string },
): PayerProfile {
  return {
    firstName: input.userFirstName,
    lastName: input.userLastName,
    // A company buys with its RUC: that is also the document it needs on the
    // receipt. A malformed RUC is discarded by the gateway, never sent.
    identification: { type: "RUC", number: business.ruc },
    phone: business.phone ?? undefined,
  };
}

export interface StartPaymentInput {
  business: Business;
  userId: string;
  userEmail: string;
  /** Name of the person paying, when the caller knows it (the antifraud fields). */
  userFirstName?: string;
  userLastName?: string;
  providerId: PaymentProviderId;
  planId: string;
  period: PlanPeriod;
  /** Public origin used to build the return and webhook URLs. */
  baseUrl: string;
  /**
   * Discount already validated by the caller (`discountService`), if any.
   *
   * It arrives resolved instead of as a code for one reason: the code must be
   * evaluated once, against the price we are about to charge, and the result stored
   * with the payment. A second lookup inside here could disagree with the amount the
   * customer was shown.
   */
  discount?: { id: string; code: string; amountOffCents: number };
  /**
   * To whom the comprobante is issued, captured at checkout.
   *
   * Optional because an operator-confirmed payment may have no checkout; the
   * business profile is then used as the fallback. Stored as a snapshot on the
   * payment so a later profile edit cannot rewrite an issued document.
   */
  billing?: BillingData;
}

export interface StartPaymentResult {
  payment: Payment;
  redirectUrl: string | null;
  instructions?: string;
}

export async function startPayment(input: StartPaymentInput): Promise<StartPaymentResult> {
  if (!isPlanId(input.planId)) {
    throw new Error("Plan inválido");
  }

  const gateway = getGateway(input.providerId);
  if (!gateway.isConfigured()) {
    throw new Error("El proveedor de pagos seleccionado no está configurado en el servidor.");
  }

  const plan = getPlan(input.planId);
  const periodLabel = input.period === "annual" ? "anual" : "mensual";
  // The price list is the console's (Planes), never the code's: an operator must be
  // able to reprice without a deploy, and this is the only place that charges.
  const listCents = await effectivePlanAmountCents(plan.id, input.period);
  const discountCents = input.discount?.amountOffCents ?? 0;
  const amountCents = Math.max(0, listCents - discountCents);

  // Same rule as the recurring path: a free plan is not a checkout. A discount that
  // swallows the whole price is refused too (`@shared/discounts` enforces the floor),
  // so this is the last line of defence against a S/ 0.00 order.
  if (amountCents <= 0) {
    throw new Error("El plan seleccionado es gratuito: no requiere ningún pago.");
  }

  const reference = newPaymentReference();

  // The row exists before we call the provider: if the network call fails we
  // still have the attempt on record instead of an orphan charge.
  const payment = await storage.createPayment({
    businessId: input.business.id,
    userId: input.userId,
    provider: input.providerId,
    // Mercado Pago lets the payer choose cards/Yape/Plin on its own page, so
    // only the offline provider has a method we already know.
    method: input.providerId === "manual" ? "transferencia" : null,
    reference,
    planId: plan.id,
    period: input.period,
    amountCents,
    currency: PAYMENT_CURRENCY,
    status: "pending",
    billingDocType: input.billing?.docType ?? null,
    billingDocNumber: input.billing?.docNumber || null,
    billingName: input.billing?.name || null,
    billingAddress: input.billing?.address || null,
    billingEmail: input.billing?.email || null,
    // The ledger explains the charge: what it was, what came off and which code did it.
    discountCode: input.discount?.code ?? null,
    discountCents,
    discountCodeId: input.discount?.id ?? null,
  });

  const base = input.baseUrl.replace(/\/+$/, "");
  warnIfBaseUrlUnreachable(base);

  // The offline provider tells the customer where to send the money, so it needs
  // the details an operator saved in Configuración. Read here (not in the gateway)
  // so the gateway stays free of storage; `undefined` makes it fall back to
  // PAYMENTS_MANUAL_INSTRUCTIONS / the generic "ask us" text.
  const transferDetails =
    input.providerId === "manual" ? await readTransferDetails() : undefined;

  const checkoutInput: CheckoutInput = {
    reference,
    amountCents,
    description: `Plan ${plan.name} (${periodLabel})`,
    planId: plan.id,
    period: input.period,
    payerEmail: input.userEmail,
    businessName: input.business.businessName,
    payer: buildPayerProfile(input.business, input),
    successUrl: `${base}/pagos?pago=ok&ref=${encodeURIComponent(reference)}`,
    failureUrl: `${base}/pagos?pago=error&ref=${encodeURIComponent(reference)}`,
    pendingUrl: `${base}/pagos?pago=pendiente&ref=${encodeURIComponent(reference)}`,
    notificationUrl: `${base}/api/payments/webhook/${input.providerId}`,
    transferDetails,
  };

  try {
    const created = await gateway.createCheckout(checkoutInput);

    const updated = await storage.updatePayment(payment.id, {
      providerRef: created.providerRef,
      redirectUrl: created.redirectUrl,
      raw: created.raw,
    });

    return {
      payment: updated ?? payment,
      redirectUrl: created.redirectUrl,
      instructions: created.instructions,
    };
  } catch (error) {
    await storage.updatePayment(payment.id, {
      status: "failed",
      failureReason: error instanceof Error ? error.message : "No se pudo iniciar el pago",
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 1b. Start a subscription (the recurring rail)
// ---------------------------------------------------------------------------

export interface StartSubscriptionInput {
  business: Business;
  userId: string;
  userEmail: string;
  /** Name of the person paying, when the caller knows it (the antifraud fields). */
  userFirstName?: string;
  userLastName?: string;
  providerId: PaymentProviderId;
  planId: string;
  period: PlanPeriod;
  baseUrl: string;
  /** Buyer snapshot; renewals inherit it from this agreement. */
  billing?: BillingData;
}

/**
 * Creates the recurring agreement.
 *
 * The customer is NOT charged here: Mercado Pago returns an `init_point` where
 * they authorise the automatic charge. The plan is applied later, by the
 * webhook, so nothing is given away before the money exists.
 */
export async function startSubscription(input: StartSubscriptionInput): Promise<{ subscription: Subscription; redirectUrl: string }> {
  if (!isPlanId(input.planId)) {
    throw new Error("Plan inválido");
  }

  const gateway = getGateway(input.providerId);
  if (!gateway.supportsRecurring()) {
    throw new Error(`El método de pago ${input.providerId} no admite cobro automático.`);
  }
  if (!gateway.isConfigured()) {
    throw new Error("El proveedor de pagos seleccionado no está configurado en el servidor.");
  }

  const plan = getPlan(input.planId);
  const amountCents = await effectivePlanAmountCents(plan.id, input.period);

  // A free plan is not a payment: sending S/ 0 to the provider would be
  // rejected there and reported as a confusing gateway error. Say it plainly.
  if (amountCents <= 0) {
    throw new Error("El plan seleccionado es gratuito: no requiere ningún pago.");
  }

  const reference = newPaymentReference();
  const periodLabel = input.period === "annual" ? "anual" : "mensual";

  const subscription = await storage.createSubscription({
    businessId: input.business.id,
    userId: input.userId,
    provider: input.providerId,
    reference,
    planId: plan.id,
    period: input.period,
    amountCents,
    currency: PAYMENT_CURRENCY,
    payerEmail: input.userEmail,
    billingDocType: input.billing?.docType ?? null,
    billingDocNumber: input.billing?.docNumber || null,
    billingName: input.billing?.name || null,
    billingAddress: input.billing?.address || null,
    billingEmail: input.billing?.email || null,
    status: "pending",
  });

  const base = input.baseUrl.replace(/\/+$/, "");
  warnIfBaseUrlUnreachable(base);

  const checkoutInput: SubscriptionCheckoutInput = {
    reference,
    amountCents,
    description: `Plan ${plan.name} (${periodLabel})`,
    planId: plan.id,
    period: input.period,
    payerEmail: input.userEmail,
    businessName: input.business.businessName,
    backUrl: `${base}/pagos?pago=ok&ref=${encodeURIComponent(reference)}`,
    notificationUrl: `${base}/api/payments/webhook/${input.providerId}`,
  };

  try {
    const created = await gateway.createSubscription(checkoutInput);

    const updated = await storage.updateSubscription(subscription.id, {
      providerRef: created.providerRef,
      initPoint: created.initPoint,
      raw: created.raw,
    });

    return { subscription: updated ?? subscription, redirectUrl: created.initPoint };
  } catch (error) {
    await storage.updateSubscription(subscription.id, {
      status: "cancelled",
      cancelledAt: new Date(),
      raw: { error: error instanceof Error ? error.message : "unknown" },
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 1c. One entry point for the UI
// ---------------------------------------------------------------------------

export interface StartCheckoutInput {
  business: Business;
  userId: string;
  userEmail: string;
  /** Name of the person paying, when the caller knows it (the antifraud fields). */
  userFirstName?: string;
  userLastName?: string;
  providerId: PaymentProviderId;
  planId: string;
  period: PlanPeriod;
  baseUrl: string;
  /** `auto` (default) prefers a recurring subscription when available. */
  mode?: "auto" | "one_time";
  /** Customer-typed promo code, if any. Never trusted: re-validated here. */
  discountCode?: string;
  /** Buyer snapshot for the comprobante (validated by the route). */
  billing?: BillingData;
}

export type StartCheckoutResult =
  | { mode: "subscription"; redirectUrl: string; subscription: Subscription }
  | { mode: "payment"; redirectUrl: string | null; instructions?: string; payment: Payment };

/**
 * The single call the checkout screen makes.
 *
 * A SaaS wants recurring billing, so when the provider - with the credentials
 * actually loaded - supports it, the default is a subscription. `one_time`
 * remains available for the exceptions (a customer who insists on paying once, a
 * provider without the recurring rail, the offline bank transfer, or Mercado
 * Pago's `TEST-` sandbox token, which cannot create preapprovals).
 *
 * Discount codes are resolved here, once, against the price we are about to charge:
 * the result is stored on the payment, so what the customer was promised and what we
 * asked the provider for are the same number.
 */
export async function startCheckout(input: StartCheckoutInput): Promise<StartCheckoutResult> {
  const wantsRecurring =
    input.mode !== "one_time" && getGateway(input.providerId).supportsRecurring();

  const code = (input.discountCode ?? "").trim();

  // A discount on a recurring agreement would follow the customer forever: the
  // provider would keep charging the discounted amount every period. Refusing it is
  // the only honest answer, and the UI offers one-time payment for exactly this.
  if (code && wantsRecurring) {
    throw new DiscountRejectedError(
      "Los descuentos aplican a un pago único. Elija «Pago único» para usar su código, o pague el precio del plan sin descuento.",
    );
  }

  let discount: StartPaymentInput["discount"];
  if (code) {
    const listCents = await effectivePlanAmountCents(input.planId, input.period);
    const evaluation = await evaluateDiscountForCheckout(code, {
      planId: input.planId,
      amountCents: listCents,
    });
    if (!evaluation.ok || !evaluation.rule) {
      throw new DiscountRejectedError(evaluation.reason ?? "El código de descuento no es válido.");
    }
    discount = {
      id: evaluation.rule.id,
      code: evaluation.rule.code,
      amountOffCents: evaluation.amountOffCents,
    };
  }

  // The agreement this purchase replaces, read BEFORE the new row exists:
  // `getLatestSubscriptionByBusiness` returns the newest agreement, which after
  // the insert below would be the new (still pending) one.
  const replaced = await findReplacedAgreement(input.business.id, input.planId, input.period);

  let result: StartCheckoutResult;
  if (wantsRecurring) {
    const created = await startSubscription(input);
    result = {
      mode: "subscription",
      redirectUrl: created.redirectUrl,
      subscription: created.subscription,
    };
  } else {
    const created = await startPayment(discount ? { ...input, discount } : input);
    result = {
      mode: "payment",
      redirectUrl: created.redirectUrl,
      instructions: created.instructions,
      payment: created.payment,
    };
  }

  // Changing plan - or only the billing period of the same plan, e.g. Básico
  // mensual to Básico anual - has to stop the provider charging the old
  // agreement, or the customer pays for both at once. Done AFTER the new
  // checkout exists so a failed checkout never leaves them with nothing.
  if (replaced) {
    await cancelAgreement(replaced).catch((error) => {
      console.error(
        `[payments] no se pudo cancelar la suscripción ${replaced.reference} reemplazada por ` +
          `${input.planId}/${input.period}:`,
        error,
      );
    });
  }

  return result;
}

/**
 * A live agreement that a new purchase replaces, if any.
 *
 * Only a REAL change counts. Re-buying the exact plan and period that is already
 * being charged is a deliberate early renewal - `applyPaidPeriod` stacks the new
 * period on top - so that agreement is left alone.
 */
async function findReplacedAgreement(
  businessId: string,
  planId: string,
  period: PlanPeriod,
): Promise<Subscription | undefined> {
  const current = await storage.getLatestSubscriptionByBusiness(businessId);
  if (!current || !isSubscriptionLive(current.status)) {
    return undefined;
  }

  const samePeriod = (current.period === "annual") === (period === "annual");
  if (current.planId === planId && samePeriod) {
    return undefined;
  }

  return current;
}

// ---------------------------------------------------------------------------
// 2. The single write path for an outcome
// ---------------------------------------------------------------------------

/**
 * Records the final outcome of a payment and, only when it is `paid`, activates
 * the plan. Everything funnels through here so there is exactly one place where
 * money turns into entitlement.
 *
 * Idempotent on purpose: providers retry webhooks, and a customer can also come
 * back from the checkout page, so the same "approved" can arrive twice. A
 * payment that is already `paid` is returned untouched - which also means a
 * renewal can never be credited twice.
 */
export async function settlePayment(
  payment: Payment,
  status: PaymentStatus,
  amountCents?: number,
  raw?: Record<string, unknown>,
): Promise<Payment> {
  if (payment.status === "paid") {
    return payment;
  }

  // Tamper check: the provider must confirm the exact amount we asked for.
  if (status === "paid" && typeof amountCents === "number" && amountCents !== payment.amountCents) {
    console.error(
      `[payments] importe no coincide en ${payment.reference}: esperado ${payment.amountCents}, recibido ${amountCents}`,
    );
    const rejected = await storage.updatePayment(payment.id, {
      status: "failed",
      failureReason: "El importe confirmado por el proveedor no coincide con el de la orden.",
    });
    return rejected ?? payment;
  }

  const updated = await storage.updatePayment(payment.id, {
    status,
    raw: raw ?? (payment.raw as Record<string, unknown> | null) ?? null,
    // The reason the customer sees. Filled from the provider's decline code, and
    // only when there is no reason yet, so a more precise one (the amount mismatch
    // below) is never overwritten by a generic translation.
    ...(status === "failed" && !payment.failureReason
      ? {
          failureReason: paymentFailureHint(
            (raw as Record<string, unknown> | undefined)?.status_detail,
          ),
        }
      : {}),
    ...(status === "paid" ? { paidAt: new Date() } : {}),
  });
  const settled = updated ?? payment;

  if (isPaymentSuccessful(settled.status)) {
    await activatePlan(settled);

    // The invoice's paper trail starts here: one pending comprobante per paid
    // order, created before the receipt goes out so the email and the console
    // agree. A failure to record it must never undo a confirmed payment.
    await ensureComprobanteForPayment(settled).catch((error) => {
      console.error(
        `[comprobantes] no se pudo crear el comprobante de ${settled.reference}:`,
        error,
      );
    });

    // The code is consumed HERE, not at checkout: an abandoned checkout must not
    // burn a redemption. Fire-and-forget by design - the money is already in.
    await redeemDiscountForPayment(settled).catch((error) => {
      console.error(
        `[payments] no se pudo contar el uso del descuento en ${settled.reference}:`,
        error,
      );
    });

    // Fire and forget: a receipt that cannot be delivered must never undo a
    // confirmed payment, nor fail the webhook response the provider is waiting for.
    void sendPaymentReceipt(settled).catch((error) => {
      console.error(`[payments] no se pudo enviar el comprobante de ${settled.reference}:`, error);
    });
  } else if (settled.status === "failed") {
    // A declined charge is the one moment the customer needs a way back, and the
    // webhook is the only moment we are sure enough to act on it. Fire-and-forget
    // like the receipt: an SMTP failure must never fail the provider's webhook.
    // `automatic: true` makes it send at most once, however many times the provider
    // retries the notification.
    void sendPaymentRecoveryEmail(settled.id, { automatic: true }).catch((error) => {
      console.error(
        `[payments] no se pudo enviar el enlace de pago de ${settled.reference}:`,
        error,
      );
    });
  }

  return settled;
}

/** Applies the paid period to the business that owns the payment. */
async function activatePlan(payment: Payment): Promise<void> {
  const business = await storage.getBusiness(payment.businessId);
  if (!business) {
    console.error(`[payments] pago ${payment.reference} sin empresa asociada`);
    return;
  }

  const period: PlanPeriod = payment.period === "annual" ? "annual" : "monthly";
  await storage.updateBusiness(business.id, applyPaidPeriod(business, payment.planId, period));
}

/**
 * Emails the customer a receipt for a payment that has just been credited.
 *
 * Sent from our own system instead of relying on the provider's receipt email:
 * Mercado Pago cannot deliver anything to a test user's mailbox (so the sandbox
 * could never prove that path), and a bank transfer has no provider email at all.
 * This way a confirmed charge always produces one message, whatever the method.
 */
async function sendPaymentReceipt(payment: Payment): Promise<void> {
  // A payment confirmed by an administrator may have no user attached; there is
  // then no customer to write to.
  if (!payment.userId) {
    return;
  }

  const [user, business] = await Promise.all([
    storage.getUser(payment.userId),
    storage.getBusiness(payment.businessId),
  ]);

  if (!user?.email) {
    return;
  }

  const periodEnd = business?.currentPeriodEnd ? new Date(business.currentPeriodEnd) : null;

  // The identity the console configured: the receipt carries the legal footer a
  // customer may need (razón social, RUC, dirección). Empty fields are simply not
  // printed, so a deployment that never opened Configuración reads as before.
  const identity = await getIdentity().catch(() => undefined);

  // The receipt already explains the amount's anatomy: base, IGV and total, plus
  // the document the customer will receive. This is what an accountant asks for
  // when the factura itself has not arrived yet (Phase 1 is manual).
  const breakdown = igvBreakdown(payment.amountCents);
  const doc = getComprobanteDocType(payment.billingDocType ?? business?.billingDocType);
  // A boleta is a person's document: the company's razón social is not the buyer.
  const buyerName =
    payment.billingName ??
    (doc.id === "factura" ? business?.businessName ?? "su empresa" : "");
  const buyerDoc =
    payment.billingDocNumber ??
    (doc.id === "factura" ? business?.ruc : business?.billingDni) ??
    "";
  const billingDocLabel = buyerDoc
    ? `${doc.label}${buyerName ? ` a nombre de ${buyerName}` : ""} · ${doc.requiresRuc ? "RUC" : "DNI"} ${buyerDoc}`
    : `${doc.label} (consumidor final)`;
  const destination = payment.billingEmail ?? business?.billingEmail ?? user.email;

  await emailService.sendPaymentReceipt({
    email: user.email,
    firstName: user.firstName ?? "",
    businessName: business?.businessName ?? "su empresa",
    planName: getPlan(payment.planId)?.name ?? payment.planId,
    periodLabel: payment.period === "annual" ? "anual" : "mensual",
    amountLabel: `${PAYMENT_CURRENCY_SYMBOL} ${centsToSoles(payment.amountCents).toFixed(2)}`,
    methodName: getPaymentProvider(payment.provider)?.name ?? payment.provider,
    reference: payment.reference,
    validUntilLabel: periodEnd ? formatCalendarDate(periodEnd) : null,
    identity,
    billingDocLabel,
    subtotalLabel: `${PAYMENT_CURRENCY_SYMBOL} ${centsToSoles(breakdown.subtotalCents).toFixed(2)}`,
    igvLabel: `${PAYMENT_CURRENCY_SYMBOL} ${centsToSoles(breakdown.igvCents).toFixed(2)}`,
    igvRateLabel: formatIgvRate(breakdown.rateBps),
    comprobanteNote: `${COMPROBANTE_ISSUE_NOTE} Se enviará a ${destination}.`,
  });
}

// ---------------------------------------------------------------------------
// 2b. Recovering an unpaid order
// ---------------------------------------------------------------------------

/** A recovery email that cannot be sent, with a message the API can return. */
export class PaymentRecoveryError extends Error {}

/**
 * Only http(s), because the stored URL comes from a provider payload and ends up
 * inside an email. A `javascript:` or `data:` value would turn the message into a
 * weapon aimed at the customer, so anything else is dropped.
 */
function safeCheckoutUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export type PaymentRecoveryOutcome =
  | { sent: true; sentTo: string; payment: Payment }
  | {
      sent: false;
      reason: "not_found" | "already_paid" | "already_sent" | "no_email";
    };

/**
 * Emails the customer a way to finish an unpaid order.
 *
 * Two callers, one message:
 *
 *   * `settlePayment` when a charge turns `failed` (the automatic path), and
 *   * the operator's "send the payment link" button in the console.
 *
 * What travels is the SAME checkout URL the customer was sent to the first time
 * (stored in `redirect_url`), our own `/suscribir` page as a fallback, and the
 * transfer/Yape block for the same amount and reference - so paying by a
 * different method still carries `LD-XXXXXX` and can be matched by hand.
 *
 * `automatic: true` sends at most once per payment: webhooks are retried, and a
 * customer must not receive the same email three times. An operator can resend
 * deliberately; every send is counted in `recoveryEmailCount`.
 */
export async function sendPaymentRecoveryEmail(
  paymentId: string,
  options: { automatic?: boolean } = {},
): Promise<PaymentRecoveryOutcome> {
  const automatic = options.automatic === true;

  const payment = await storage.getPayment(paymentId);
  if (!payment) {
    if (automatic) {
      return { sent: false, reason: "not_found" };
    }
    throw new PaymentRecoveryError("Pago no encontrado.");
  }

  if (payment.status === "paid") {
    if (automatic) {
      return { sent: false, reason: "already_paid" };
    }
    throw new PaymentRecoveryError("El pago ya está confirmado: no hay nada que cobrar.");
  }

  if (automatic && payment.recoveryEmailSentAt) {
    // Already told once. Retries of the same webhook stop here.
    return { sent: false, reason: "already_sent" };
  }

  const [user, business] = await Promise.all([
    payment.userId ? storage.getUser(payment.userId) : Promise.resolve(undefined),
    storage.getBusiness(payment.businessId),
  ]);

  if (!user?.email) {
    if (automatic) {
      return { sent: false, reason: "no_email" };
    }
    throw new PaymentRecoveryError(
      "El cliente no tiene un correo electrónico registrado: no se puede enviar el enlace.",
    );
  }

  const period: PlanPeriod = payment.period === "annual" ? "annual" : "monthly";
  const periodLabel = period === "annual" ? "anual" : "mensual";
  const planName = getPlan(payment.planId)?.name ?? payment.planId;
  const description = `Plan ${planName} (${periodLabel})`;

  // The identity also gives us the public base URL for the fallback link, which is
  // the same one every other email and the PSP return URLs use.
  const identity = await getIdentity().catch(() => undefined);
  const baseUrl = (identity?.website || "https://librodigital.pe").replace(/\/+$/, "");

  // Where to send a transfer / Yape, exactly as the checkout screen shows it. An
  // unreadable settings table must not stop the email: it simply omits the block.
  const transferDetails = await readTransferDetails().catch(() => undefined);
  const transferInstructions =
    buildTransferInstructions(
      {
        reference: payment.reference,
        amountCents: payment.amountCents,
        description,
      },
      transferDetails,
    ) ?? null;

  await emailService.sendPaymentRecovery({
    email: user.email,
    firstName: user.firstName ?? "",
    businessName: business?.businessName ?? "su empresa",
    planName,
    periodLabel,
    amountLabel: `${PAYMENT_CURRENCY_SYMBOL} ${centsToSoles(payment.amountCents).toFixed(2)}`,
    reference: payment.reference,
    checkoutUrl: safeCheckoutUrl(payment.redirectUrl),
    resumeUrl: buildPaymentResumeUrl(baseUrl, payment.planId, period),
    transferInstructions,
    reason: payment.failureReason,
    identity,
  });

  const updated = await storage.updatePayment(payment.id, {
    // Kept from the first send so "when did we first reach out?" never moves.
    recoveryEmailSentAt: payment.recoveryEmailSentAt ?? new Date(),
    recoveryEmailCount: (payment.recoveryEmailCount ?? 0) + 1,
  });

  return { sent: true, sentTo: user.email, payment: updated ?? payment };
}

// ---------------------------------------------------------------------------
// 2c. Recurring agreements: state sync and the renewal ledger
// ---------------------------------------------------------------------------

/** Business state that follows the agreement's state. */
function businessStatusForSubscription(status: SubscriptionStatus): string | undefined {
  switch (status) {
    case "authorized":
      return "active";
    case "paused":
      return "past_due";
    case "cancelled":
      return "canceled";
    default:
      return undefined; // still pending: leave the trial / current state alone
  }
}

/**
 * Applies only the plan and the status, never the period end.
 *
 * This is deliberate: the paid period is extended exclusively by a confirmed
 * charge (see `recordSubscriptionCharge`). If this function also moved
 * `currentPeriodEnd`, the agreement notification and the charge notification -
 * which arrive in an unspecified order, and often both - would credit the same
 * payment twice.
 */
async function applySubscriptionEntitlement(subscription: Subscription): Promise<void> {
  const business = await storage.getBusiness(subscription.businessId);
  if (!business) {
    console.error(`[payments] suscripción ${subscription.reference} sin empresa asociada`);
    return;
  }

  await storage.updateBusiness(business.id, {
    subscriptionPlan: subscription.planId,
    planPeriod: subscription.period === "annual" ? "annual" : "monthly",
    // A customer who authorises the charge during the trial keeps the remaining
    // free days; the paid period starts when the trial ends.
    subscriptionStatus: isTrialing(business) ? "trialing" : "active",
  });
}

/** Moves the business's subscription status, without touching the plan. */
async function setBusinessSubscriptionState(businessId: string, status: string): Promise<void> {
  if (!isSubscriptionStatus(status)) {
    return;
  }

  const next = businessStatusForSubscription(status);
  if (!next) {
    return;
  }

  const business = await storage.getBusiness(businessId);
  if (!business || business.subscriptionStatus === next) {
    return;
  }

  // A running trial is a window we granted, not a charge a provider can switch
  // off: a pause or a cancellation must not end it early, or the customer loses
  // free days we promised. The trial closes on its own date.
  if (isTrialing(business)) {
    return;
  }

  // Cancelling deliberately does NOT strip the plan: the customer already paid
  // for the current period, so access runs until `currentPeriodEnd`.
  await storage.updateBusiness(businessId, { subscriptionStatus: next });
}

/** Persists what the provider says about an agreement, and follows it through. */
export async function syncSubscription(
  subscription: Subscription,
  state: SubscriptionState,
): Promise<Subscription> {
  const updated = await storage.updateSubscription(subscription.id, {
    status: state.status,
    nextPaymentAt: state.nextPaymentAt ?? subscription.nextPaymentAt,
    raw: state.raw,
    ...(state.status === "authorized" && !subscription.startedAt ? { startedAt: new Date() } : {}),
    ...(state.status === "cancelled" && !subscription.cancelledAt ? { cancelledAt: new Date() } : {}),
  });
  const settled = updated ?? subscription;

  if (isSubscriptionLive(settled.status)) {
    await applySubscriptionEntitlement(settled);
  } else {
    await setBusinessSubscriptionState(settled.businessId, settled.status);
  }

  return settled;
}

/**
 * Adopts a subscription the app never created.
 *
 * A plan created in the Mercado Pago panel can be paid through its own public
 * link, and Mercado Pago then creates the subscription - so we have no record of
 * it. Two things make it recognisable:
 *
 *   * WHICH plan: the panel code we configured (`external_reference`), or, when
 *     that is missing, the amount plus the frequency, which identify a plan
 *     unambiguously;
 *   * WHOSE plan: the payer's Mercado Pago email. It is the only thread between a
 *     payment made outside the app and one of our accounts, which is also the
 *     limit of what can be automated - see `alertUnmatchedSubscription`.
 */
async function adoptSubscription(
  providerId: PaymentProviderId,
  state: SubscriptionState,
): Promise<Subscription | undefined> {
  const purchase =
    resolvePlanFromCode(state.externalReference) ??
    (state.amountCents !== undefined && state.period
      ? resolvePlanFromAmount(state.amountCents, state.period)
      : undefined);

  if (!purchase) {
    return undefined;
  }

  const user = state.payerEmail ? await storage.getUserByEmail(state.payerEmail) : undefined;
  if (!user?.businessId) {
    return undefined;
  }

  const plan = getPlan(purchase.planId);
  // For a panel-created plan, the price the customer agreed to is the one the
  // provider reports - not our catalogue. Book it as-is so the charge amount
  // check downstream compares like with like.
  const amountCents = state.amountCents ?? (await effectivePlanAmountCents(plan.id, purchase.period));

  const catalogueCents = await effectivePlanAmountCents(plan.id, purchase.period);
  if (amountCents !== catalogueCents) {
    console.warn(
      `[payments] el precio del plan ${plan.name} (${purchase.period}) en Mercado Pago es ${amountCents} ` +
        `y el vigente ${catalogueCents}. Revise el panel y la sección Planes del panel de operaciones.`,
    );
  }

  const created = await storage.createSubscription({
    businessId: user.businessId,
    userId: user.id,
    provider: providerId,
    providerRef: state.providerRef,
    reference: newPaymentReference(),
    planId: plan.id,
    period: purchase.period,
    amountCents,
    currency: PAYMENT_CURRENCY,
    payerEmail: state.payerEmail ?? null,
    status: "pending",
    raw: state.raw,
  });

  console.warn(
    `[payments] suscripción ${state.providerRef} adoptada: ${plan.id}/${purchase.period} para la empresa ${user.businessId}`,
  );

  return created;
}

/** One stray payment must not flood the operator's inbox. */
const alertedSubscriptions = new Set<string>();

/**
 * Forgets which stray subscriptions were already reported.
 *
 * The cache is process-local and only exists to stop a provider retry from
 * mailing the operator several times for the same payment, so it carries no
 * state worth preserving. Exported so tests can exercise several stray
 * subscriptions independently.
 */
export function clearPaymentAlertCache(): void {
  alertedSubscriptions.clear();
}

/**
 * Tells the operator about a paid subscription that belongs to nobody.
 *
 * This is the honest limit of the automation: if the customer pays with a
 * Mercado Pago email that matches no account, we cannot know which business to
 * activate. Someone must fix it by hand, so we make sure a human hears about it
 * instead of letting the payment sit unnoticed.
 */
async function alertUnmatchedSubscription(
  providerId: PaymentProviderId,
  providerRef: string,
  state: SubscriptionState,
): Promise<void> {
  const key = `${providerId}:${providerRef}`;
  if (alertedSubscriptions.has(key)) {
    return;
  }
  alertedSubscriptions.add(key);

  const amount =
    state.amountCents !== undefined ? `S/ ${(state.amountCents / 100).toFixed(2)}` : "desconocido";

  console.error(
    `[payments] suscripción ${providerRef} (${providerId}) sin empresa asociada: ${amount}, ` +
      `código ${state.externalReference ?? "—"}, pagador ${state.payerEmail ?? "—"}.`,
  );

  const recipient = await getAlertEmail();
  if (!recipient) {
    return;
  }

  // Fire and forget: an alert must never break the webhook response.
  void emailService
    .sendPlatformAlert(
      recipient,
      "Suscripción pagada sin asignar",
      [
        `Proveedor: ${providerId}`,
        `Suscripción (id de Mercado Pago): ${providerRef}`,
        `Estado: ${state.status}`,
        `Importe: ${amount}`,
        `Código del plan: ${state.externalReference ?? "—"}`,
        `Correo del pagador: ${state.payerEmail ?? "—"}`,
        "",
        "Hay un pago que no se pudo asignar a ninguna empresa. Suele ocurrir cuando el cliente",
        "paga con un correo de Mercado Pago que no es el de su cuenta: pídale registrarse con",
        "ese mismo correo, o asígnele el plan manualmente.",
      ],
      await getIdentity().catch(() => undefined),
    )
    .catch(() => {});
}

/**
 * Finds the agreement a notification refers to, adopting it when the customer
 * paid through a plan link rather than our own button. The state comes back with
 * it so the caller does not have to ask the provider twice.
 */
async function resolveOrAdoptSubscription(
  providerId: PaymentProviderId,
  providerRef: string,
): Promise<{ subscription: Subscription; state: SubscriptionState } | undefined> {
  const gateway = getGateway(providerId);
  const known = await storage.getSubscriptionByProviderRef(providerId, providerRef);

  if (known) {
    const state = await gateway.fetchSubscription(known.providerRef ?? providerRef);
    return { subscription: known, state };
  }

  const state = await gateway.fetchSubscription(providerRef);
  const adopted = await adoptSubscription(providerId, state);

  if (!adopted) {
    await alertUnmatchedSubscription(providerId, providerRef, state);
    return undefined;
  }

  return { subscription: adopted, state };
}

/**
 * Books one charge of a recurring agreement and extends the paid period.
 *
 * Deduplicated by the provider's payment id: if the same charge is notified
 * twice (the provider retries, and it also arrives on the `payment` topic), the
 * existing row is reused and `settlePayment` refuses to credit it again. That is
 * what stops a subscription from granting two months for one month's money.
 */
export async function recordSubscriptionCharge(
  subscription: Subscription,
  providerStatus: ProviderStatus,
): Promise<Payment> {
  const existing = await storage.getPaymentByProviderRef(subscription.provider, providerStatus.providerRef);

  const payment = existing ?? (await storage.createPayment({
    businessId: subscription.businessId,
    userId: subscription.userId,
    provider: subscription.provider,
    method: null,
    providerRef: providerStatus.providerRef,
    // Each charge gets its own code; the agreement is linked by subscriptionId.
    reference: newPaymentReference(),
    planId: subscription.planId,
    period: subscription.period,
    // Booked at the agreed price, so a provider charging something else is
    // caught by `settlePayment`'s amount check instead of silently accepted.
    amountCents: subscription.amountCents,
    currency: subscription.currency,
    status: "pending",
    // A renewal has no checkout: the snapshot captured when the agreement was
    // authorised is what its invoice must say.
    billingDocType: subscription.billingDocType,
    billingDocNumber: subscription.billingDocNumber,
    billingName: subscription.billingName,
    billingAddress: subscription.billingAddress,
    billingEmail: subscription.billingEmail,
    subscriptionId: subscription.id,
  }));

  return settlePayment(payment, providerStatus.status, providerStatus.amountCents, providerStatus.raw);
}

export async function refreshSubscription(businessId: string): Promise<Subscription | undefined> {
  const subscription = await storage.getLatestSubscriptionByBusiness(businessId);
  // Nothing to ask about: cancelled, or the provider never gave us an id.
  if (!subscription || subscription.status === 'cancelled' || !subscription.providerRef) {
    return subscription;
  }

  const gateway = getGateway(subscription.provider as PaymentProviderId);
  if (!gateway.isConfigured()) {
    return subscription;
  }

  const state = await gateway.fetchSubscription(subscription.providerRef);
  const synced = await syncSubscription(subscription, state);

  // If the subscription is live and the provider can look up payments by our
  // external_reference, reconcile the charge so `currentPeriodEnd` is advanced
  // even when the charge webhook has not arrived yet.
  if (isSubscriptionLive(synced.status) && gateway.findPaymentByReference) {
    try {
      const charge = await gateway.findPaymentByReference(synced.reference);
      if (charge) {
        await recordSubscriptionCharge(synced, charge);
      }
    } catch (error) {
      console.error('[payments] could not reconcile subscription charge during refresh:', error);
    }
  }

  return synced;
}

/** The agreement the UI should show for a business, if any. */
export async function getActiveSubscription(businessId: string): Promise<{
  subscription: Subscription;
  statusLabel: string;
  isLive: boolean;
} | null> {
  const subscription = await storage.getLatestSubscriptionByBusiness(businessId);
  if (!subscription) {
    return null;
  }

  return {
    subscription,
    statusLabel: isSubscriptionStatus(subscription.status)
      ? SUBSCRIPTION_STATUS_LABELS[subscription.status]
      : subscription.status,
    isLive: isSubscriptionLive(subscription.status),
  };
}

/**
 * Stops future charges. Idempotent, and never throws when the agreement is
 * already cancelled.
 */
export async function cancelSubscriptionForBusiness(businessId: string): Promise<Subscription | undefined> {
  const subscription = await storage.getLatestSubscriptionByBusiness(businessId);
  if (!subscription) {
    return undefined;
  }
  return cancelAgreement(subscription);
}

/**
 * Cancels ONE agreement: tells the provider to stop charging and closes the row.
 *
 * Separate from `cancelSubscriptionForBusiness` because the checkout knows
 * exactly which agreement it replaces - the one read before the new row existed.
 * Going back to "the latest agreement of this business" at that point would
 * return the agreement that was just created.
 */
async function cancelAgreement(subscription: Subscription): Promise<Subscription> {
  if (subscription.status === "cancelled") {
    return subscription;
  }

  // Without a provider id there is no agreement on their side to stop; the
  // local row is still closed so the UI shows the truth.
  if (subscription.providerRef) {
    const gateway = getGateway(subscription.provider as PaymentProviderId);
    if (gateway.isConfigured()) {
      await gateway.cancelSubscription(subscription.providerRef);
    }
  }

  const updated = await storage.updateSubscription(subscription.id, {
    status: "cancelled",
    cancelledAt: new Date(),
  });
  const settled = updated ?? subscription;

  await setBusinessSubscriptionState(settled.businessId, "cancelled");
  return settled;
}

// ---------------------------------------------------------------------------
// 3. Webhook: the untrusted notification
// ---------------------------------------------------------------------------

export interface WebhookOutcome {
  handled: boolean;
  reason?: string;
  status?: string;
}

/**
 * Handles a provider webhook.
 *
 * Nothing in the body is trusted: it only tells us *which* resource changed and
 * under which topic. The state then comes from the matching `fetch*` call, made
 * server-to-server with our own secret key. That is the whole authorization
 * model - a forged "approved" body is useless without also forging the provider's
 * API response.
 */
export async function handleProviderWebhook(
  providerId: PaymentProviderId,
  body: unknown,
  query: Record<string, unknown> = {},
): Promise<WebhookOutcome> {
  const gateway = getGateway(providerId);

  if (!gateway.isConfigured()) {
    return { handled: false, reason: "proveedor no configurado" };
  }

  const notification = gateway.parseNotification(body, query);
  if (!notification.providerRef) {
    return { handled: false, reason: "notificación sin identificador de recurso" };
  }

  switch (notification.topic) {
    case "payment":
      return handlePaymentNotification(providerId, notification.providerRef);

    case "subscription":
      return handleSubscriptionNotification(providerId, notification.providerRef);

    case "subscription_payment":
      return handleSubscriptionChargeNotification(providerId, notification.providerRef);

    default:
      // e.g. merchant_order or a plan event: not part of our billing model.
      return { handled: false, reason: `evento ignorado: ${notification.action ?? notification.topic}` };
  }
}

/**
 * A charge changed.
 *
 * This topic covers one-time payments AND the charges of a subscription. When
 * the charge is unknown to us, its `external_reference` is used to find the
 * agreement it belongs to: that is what makes renewals work even when the
 * provider only notifies through this topic (and in any order relative to the
 * agreement notification).
 */
async function handlePaymentNotification(providerId: PaymentProviderId, providerRef: string): Promise<WebhookOutcome> {
  const gateway = getGateway(providerId);
  const authoritative = await gateway.fetchStatus(providerRef);

  const known = await storage.getPaymentByProviderRef(providerId, providerRef);
  if (known) {
    const settled = await settlePayment(known, authoritative.status, authoritative.amountCents, authoritative.raw);
    return { handled: true, status: settled.status };
  }

  const externalReference =
    typeof authoritative.raw.external_reference === "string" ? authoritative.raw.external_reference : undefined;

  if (externalReference) {
    // Checkout Pro stores the *preference* id as our `providerRef`, while the
    // notification carries the *payment* id, so the lookup above can never match a
    // one-off order. Our own reference does: it travels as `external_reference` on
    // every charge the preference produces. Without this fallback a declined - and
    // just as importantly, an approved - card was never recorded unless the customer
    // happened to come back to the site and press "verify".
    const order = await storage.getPaymentByReference(externalReference);
    if (order && order.provider === providerId) {
      const settled = await settlePayment(order, authoritative.status, authoritative.amountCents, authoritative.raw);
      return { handled: true, status: settled.status };
    }

    const subscription = await storage.getSubscriptionByReference(externalReference);
    if (subscription && subscription.provider === providerId) {
      const charge = await recordSubscriptionCharge(subscription, authoritative);
      return { handled: true, status: charge.status };
    }
  }

  return { handled: false, reason: "pago no encontrado" };
}

/** The recurring agreement itself changed status (authorised, paused, cancelled). */
async function handleSubscriptionNotification(
  providerId: PaymentProviderId,
  providerRef: string,
): Promise<WebhookOutcome> {
  // Adopts the subscription when it was bought through a plan link, so a payment
  // made outside the app still ends up on the right account.
  const found = await resolveOrAdoptSubscription(providerId, providerRef);
  if (!found) {
    return { handled: false, reason: "suscripción no encontrada" };
  }

  const synced = await syncSubscription(found.subscription, found.state);
  return { handled: true, status: synced.status };
}

/** The provider charged (or failed to charge) a period: book it and extend access. */
async function handleSubscriptionChargeNotification(
  providerId: PaymentProviderId,
  chargeRef: string,
): Promise<WebhookOutcome> {
  const gateway = getGateway(providerId);
  const resolved = await gateway.resolveSubscriptionCharge(chargeRef);

  if (!resolved.subscriptionRef) {
    return { handled: false, reason: "cobro sin suscripción asociada" };
  }

  // Same adoption path: a charge can be the first thing we hear about.
  const found = await resolveOrAdoptSubscription(providerId, resolved.subscriptionRef);
  if (!found) {
    return { handled: false, reason: "suscripción no encontrada" };
  }

  const synced = await syncSubscription(found.subscription, found.state);

  if (!resolved.paymentRef) {
    // Nothing was charged yet (the invoice is still scheduled).
    return { handled: true, status: synced.status };
  }

  const chargeStatus = await gateway.fetchStatus(resolved.paymentRef);
  const charge = await recordSubscriptionCharge(synced, chargeStatus);
  return { handled: true, status: charge.status };
}

// ---------------------------------------------------------------------------
// 4. Reads and manual confirmation
// ---------------------------------------------------------------------------

export async function listPayments(businessId: string): Promise<Payment[]> {
  return storage.getPaymentsByBusiness(businessId);
}

/**
 * The operator's queue: pending transfers/Yape of every customer.
 *
 * Deliberately not tenant-scoped. Only platform staff reach it, and their job is
 * to look at their own bank/Yape app and reconcile the reference they see there.
 */
export async function listPendingManualPayments(): Promise<Payment[]> {
  return storage.listPendingManualPayments();
}

/** Re-checks a still-pending payment against the provider (return from checkout). */
export async function refreshPayment(paymentId: string): Promise<Payment | undefined> {
  const payment = await storage.getPayment(paymentId);
  if (!payment) {
    return undefined;
  }
  if (payment.status !== "pending" || !payment.providerRef) {
    return payment;
  }

  const gateway = getGateway(payment.provider as PaymentProviderId);
  if (!gateway.isConfigured()) {
    return payment;
  }

  // How to ask, depends on which handle we hold:
  //   * a subscription charge has a payment id (there is nothing to look up while
  //     the agreement itself is still pending);
  //   * a Checkout Pro reference is a *preference*, so the payments endpoint can
  //     only answer 404 for it - that used to reach the customer as "no se pudo
  //     verificar el pago con el proveedor" while the money simply had not been
  //     sent yet. Our own reference is the handle that works there.
  const holdsPreference = payment.provider !== "manual" && !payment.subscriptionId;

  const authoritative =
    holdsPreference && gateway.findPaymentByReference
      ? await gateway.findPaymentByReference(payment.reference)
      : await gateway.fetchStatus(payment.providerRef);

  if (!authoritative) {
    // Nothing was charged for that preference yet: still pending, not an error.
    return payment;
  }

  return settlePayment(payment, authoritative.status, authoritative.amountCents, authoritative.raw);
}

/**
 * Marks an offline (bank transfer / Yape) payment as received.
 *
 * Only an administrator can do this, and only for the `manual` provider: an
 * automatically-collected payment must never be confirmable by hand, otherwise
 * the provider stops being the source of truth.
 */
export async function confirmManualPayment(
  paymentId: string,
  adminUserId: string,
): Promise<Payment | undefined> {
  const payment = await storage.getPayment(paymentId);
  if (!payment) {
    return undefined;
  }
  if (payment.provider !== "manual") {
    throw new Error("Solo los pagos por transferencia se confirman manualmente.");
  }
  if (payment.status === "paid") {
    return payment;
  }

  const updated = await storage.updatePayment(payment.id, {
    status: "paid",
    paidAt: new Date(),
    confirmedByUserId: adminUserId,
    failureReason: null,
  });
  const settled = updated ?? payment;

  await activatePlan(settled);

  // Same paper trail as any other confirmed charge: a manually confirmed
  // transfer must also produce its pending comprobante.
  await ensureComprobanteForPayment(settled).catch((error) => {
    console.error(
      `[comprobantes] no se pudo crear el comprobante de ${settled.reference}:`,
      error,
    );
  });

  return settled;
}

/**
 * Confirms a payment as received through a method that does not report itself.
 *
 * This is the "the customer ended up paying by transfer / Yape" path, and it
 * deliberately works on ANY provider row: the order that Mercado Pago rejected is
 * exactly the one the customer then pays against, quoting `LD-XXXXXX`, so
 * confirming that row is what PAIRS the bank deposit with the order instead of
 * leaving two unrelated records. `provider` is kept (it says where the order
 * started); `method` and the `manualConfirmation` block say how the money arrived.
 *
 * It goes through `settlePayment` on purpose: the plan, the receipt and the
 * discount redemption happen in the same single write path a provider-approved
 * charge uses, so the two can never drift.
 */
export async function confirmOfflinePayment(
  paymentId: string,
  adminUserId: string,
  input: { method: PaymentMethodId; note?: string | null },
): Promise<Payment | undefined> {
  const payment = await storage.getPayment(paymentId);
  if (!payment) {
    return undefined;
  }
  if (payment.status === "paid") {
    return payment;
  }
  if (!isManualPaymentMethod(input.method)) {
    throw new Error(
      "Un cobro con tarjeta no se confirma a mano: elija transferencia, Yape, Plin o efectivo.",
    );
  }

  const note = (input.note ?? "").trim() || null;
  const raw = {
    ...((payment.raw as Record<string, unknown> | null) ?? {}),
    manualConfirmation: {
      at: new Date().toISOString(),
      byUserId: adminUserId,
      method: input.method,
      note,
    },
  };

  const updated = await storage.updatePayment(payment.id, {
    method: input.method,
    confirmedByUserId: adminUserId,
    failureReason: null,
    raw,
  });
  const settled = updated ?? payment;

  return settlePayment(settled, "paid", settled.amountCents, raw);
}

export interface RegisterManualPaymentInput {
  businessId: string;
  adminUserId: string;
  planId: string;
  period: PlanPeriod;
  method: PaymentMethodId;
  /**
   * What actually arrived, in céntimos. Defaults to the console's price for the
   * plan, which is what an operator normally collects; a negotiated amount is
   * allowed because the bank deposit is the truth.
   */
  amountCents?: number;
  /** Bank operation number, Yape reference, or who took the money. */
  note?: string | null;
}

/**
 * Records a payment that has no order behind it, and applies the plan.
 *
 * The case this exists for: the customer never finished a checkout (or paid by
 * Yape "por fuera"), so there is no `payments` row to confirm. Creating the row
 * anyway is what keeps the ledger complete - the console, the customer's history
 * and the receipt all read from it - instead of the plan appearing from nowhere.
 */
export async function registerManualPayment(input: RegisterManualPaymentInput): Promise<Payment> {
  if (!isPlanId(input.planId)) {
    throw new Error("Plan inválido");
  }
  if (!isManualPaymentMethod(input.method)) {
    throw new Error(
      "Elija un método que se pueda cobrar fuera del proveedor: transferencia, Yape, Plin o efectivo.",
    );
  }

  const business = await storage.getBusinessById(input.businessId);
  if (!business) {
    throw new Error("Cliente no encontrado");
  }

  const plan = getPlan(input.planId);
  const listCents = await effectivePlanAmountCents(plan.id, input.period);
  const amountCents =
    typeof input.amountCents === "number" && Number.isFinite(input.amountCents) && input.amountCents > 0
      ? Math.round(input.amountCents)
      : listCents;

  if (amountCents <= 0) {
    throw new Error("El monto debe ser mayor que cero.");
  }

  // The receipt goes to `payments.userId`, so a row created by an operator still
  // has to point at the person who owns the account.
  const users = await storage.getUsersByBusinessIds([business.id]);
  const owner = users.find((user) => user.role === "admin" && user.isActive) ?? users[0];

  const created = await storage.createPayment({
    businessId: business.id,
    userId: owner?.id ?? null,
    provider: "manual",
    method: input.method,
    reference: newPaymentReference(),
    planId: plan.id,
    period: input.period,
    amountCents,
    currency: PAYMENT_CURRENCY,
    status: "pending",
  });

  const confirmed = await confirmOfflinePayment(created.id, input.adminUserId, {
    method: input.method,
    note: input.note,
  });

  return confirmed ?? created;
}
