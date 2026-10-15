import crypto from "crypto";

import {
  PAYMENT_CURRENCY,
  SUBSCRIPTION_STATUS_LABELS,
  availablePaymentProviders,
  buildPaymentReference,
  computePeriodEnd,
  isPaymentSuccessful,
  isSubscriptionLive,
  isSubscriptionStatus,
  planAmountCents,
  providerSupportsRecurring,
  referenceSuffix,
  type PaymentProviderDefinition,
  type PaymentProviderId,
  type PaymentStatus,
  type PlanPeriod,
  type SubscriptionStatus,
} from "@shared/payments";
import { getPlan, isPlanId, isTrialing } from "@shared/plans";
import type { Business, Payment, Subscription } from "@shared/schema";

import { storage } from "../storage";
import {
  getGateway,
  type CheckoutInput,
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

export interface PaidPeriodResult {
  plan: string;
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
    plan: planId,
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
  return availablePaymentProviders().map((provider) => ({
    ...provider,
    configured: getGateway(provider.id).isConfigured(),
  }));
}

// ---------------------------------------------------------------------------
// 1. Start a checkout
// ---------------------------------------------------------------------------

export interface StartPaymentInput {
  business: Business;
  userId: string;
  userEmail: string;
  providerId: PaymentProviderId;
  planId: string;
  period: PlanPeriod;
  /** Public origin used to build the return and webhook URLs. */
  baseUrl: string;
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
  const amountCents = planAmountCents(plan.id, input.period);
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
  });

  const base = input.baseUrl.replace(/\/+$/, "");
  const checkoutInput: CheckoutInput = {
    reference,
    amountCents,
    description: `Plan ${plan.name} (${periodLabel})`,
    planId: plan.id,
    period: input.period,
    payerEmail: input.userEmail,
    businessName: input.business.businessName,
    successUrl: `${base}/pagos?pago=ok&ref=${encodeURIComponent(reference)}`,
    failureUrl: `${base}/pagos?pago=error&ref=${encodeURIComponent(reference)}`,
    pendingUrl: `${base}/pagos?pago=pendiente&ref=${encodeURIComponent(reference)}`,
    notificationUrl: `${base}/api/payments/webhook/${input.providerId}`,
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
  providerId: PaymentProviderId;
  planId: string;
  period: PlanPeriod;
  baseUrl: string;
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
  const amountCents = planAmountCents(plan.id, input.period);
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
    status: "pending",
  });

  const base = input.baseUrl.replace(/\/+$/, "");
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
  providerId: PaymentProviderId;
  planId: string;
  period: PlanPeriod;
  baseUrl: string;
  /** `auto` (default) prefers a recurring subscription when available. */
  mode?: "auto" | "one_time";
}

export type StartCheckoutResult =
  | { mode: "subscription"; redirectUrl: string; subscription: Subscription }
  | { mode: "payment"; redirectUrl: string | null; instructions?: string; payment: Payment };

/**
 * The single call the checkout screen makes.
 *
 * A SaaS wants recurring billing, so when the provider supports it the default
 * is a subscription. `one_time` remains available for the exceptions (a
 * customer who insists on paying once, or a provider without the recurring
 * rail, or the offline bank transfer).
 */
export async function startCheckout(input: StartCheckoutInput): Promise<StartCheckoutResult> {
  const wantsRecurring =
    input.mode !== "one_time" && providerSupportsRecurring(input.providerId);

  if (wantsRecurring) {
    const result = await startSubscription(input);
    return { mode: "subscription", redirectUrl: result.redirectUrl, subscription: result.subscription };
  }

  const result = await startPayment(input);
  return {
    mode: "payment",
    redirectUrl: result.redirectUrl,
    instructions: result.instructions,
    payment: result.payment,
  };
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
    ...(status === "paid" ? { paidAt: new Date() } : {}),
  });
  const settled = updated ?? payment;

  if (isPaymentSuccessful(settled.status)) {
    await activatePlan(settled);
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

// ---------------------------------------------------------------------------
// 2b. Recurring agreements: state sync and the renewal ledger
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
  return syncSubscription(subscription, state);
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
  const subscription = await storage.getSubscriptionByProviderRef(providerId, providerRef);
  if (!subscription) {
    return { handled: false, reason: "suscripción no encontrada" };
  }

  const state = await getGateway(providerId).fetchSubscription(providerRef);
  const synced = await syncSubscription(subscription, state);
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

  const subscription = await storage.getSubscriptionByProviderRef(providerId, resolved.subscriptionRef);
  if (!subscription) {
    return { handled: false, reason: "suscripción no encontrada" };
  }

  // Keep the agreement's own state fresh as well, so a paused/cancelled change
  // notified on this topic is not missed.
  const state = await gateway.fetchSubscription(subscription.providerRef ?? resolved.subscriptionRef);
  const synced = await syncSubscription(subscription, state);

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

  const authoritative = await gateway.fetchStatus(payment.providerRef);
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
  return settled;
}
