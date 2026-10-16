import {
  PAYMENT_CURRENCY,
  recurrenceForPeriod,
  type PaymentProviderId,
  type PaymentStatus,
  type PlanPeriod,
  type SubscriptionStatus,
} from "@shared/payments";

/**
 * Provider adapters (Phase 2.7).
 *
 * Every PSP is reduced to the same two operations:
 *
 *   createCheckout() - "start a payment of this amount; tell me under which
 *                      provider id it was created and where to send the payer"
 *   fetchStatus()    - "what is the authoritative outcome of provider id X?"
 *
 * The second one is the security cornerstone. A webhook body is just an
 * untrusted HTTP request, so we never trust the status it *claims*. We pull the
 * transaction id out of it and ask the provider's own API, server-to-server,
 * with our secret key. Somebody who learns the webhook URL therefore cannot
 * unlock a paid plan by posting a fake "approved".
 *
 * Only providers that are genuinely finished are wired here. Culqi needs its
 * frontend SDK (and a production CSP change), and Niubiz/Izipay need a signed
 * merchant contract - they are catalogued in `@shared/payments` as
 * `available: false` instead of shipping a half-invented integration.
 *
 * All the payload building and response parsing is pure and exported, so the
 * provider contracts are unit-tested offline (paymentGateway.test.ts).
 */

const REQUEST_TIMEOUT_MS = 10_000;

export interface CheckoutInput {
  /** Our own code, e.g. LV-8F3A2B. Printed on receipts and bank transfers. */
  reference: string;
  amountCents: number;
  description: string;
  planId: string;
  period: string;
  payerEmail: string;
  businessName: string;
  successUrl: string;
  failureUrl: string;
  pendingUrl: string;
  notificationUrl: string;
}

export interface CheckoutResult {
  providerRef: string;
  /** Where the browser must go to pay. `null` for offline (manual) providers. */
  redirectUrl: string | null;
  /** Human instructions for offline providers. */
  instructions?: string;
  raw: Record<string, unknown>;
}

export interface ProviderStatus {
  providerRef: string;
  status: PaymentStatus;
  /** Amount confirmed by the provider, in céntimos (tamper check). */
  amountCents?: number;
  raw: Record<string, unknown>;
}

export interface PaymentGateway {
  id: PaymentProviderId;
  /** False when credentials are missing: the UI then hides the option. */
  isConfigured(): boolean;
  /**
   * Whether this provider can charge the customer again every period without
   * them doing anything. When false, the only recurring model is "sell the next
   * period again", which the caller handles as a one-time payment.
   */
  supportsRecurring(): boolean;

  // --- One-time payments -----------------------------------------------------
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  fetchStatus(providerRef: string): Promise<ProviderStatus>;

  // --- Recurring agreements ---------------------------------------------------
  /** Creates the agreement; the payer must still authorise it at `initPoint`. */
  createSubscription(input: SubscriptionCheckoutInput): Promise<SubscriptionResult>;
  fetchSubscription(providerRef: string): Promise<SubscriptionState>;
  /** Stops future charges. Never throws when it is already stopped. */
  cancelSubscription(providerRef: string): Promise<void>;
  /**
   * A recurring charge arrives as its own id; this resolves it into the
   * agreement it belongs to and the underlying payment (when there is one).
   */
  resolveSubscriptionCharge(chargeRef: string): Promise<ResolvedCharge>;

  /**
   * Extracts the topic and the resource id from a webhook payload. Deliberately
   * does NOT verify anything: the id is only used to look the record up, and the
   * real outcome always comes from the matching `fetch*` call above.
   */
  parseNotification(body: unknown, query: Record<string, unknown>): NotificationInfo;
}

/** What a provider webhook ultimately talks about. */
export type NotificationTopic = "payment" | "subscription" | "subscription_payment" | "other";

export interface NotificationInfo {
  topic: NotificationTopic;
  /** Id of the changed resource (payment, preapproval or authorized payment). */
  providerRef?: string;
  /** Provider-side action name, kept for diagnostics. */
  action?: string;
}

export interface SubscriptionCheckoutInput {
  reference: string;
  amountCents: number;
  description: string;
  planId: string;
  period: PlanPeriod;
  payerEmail: string;
  businessName: string;
  /** Where the payer lands after authorising. */
  backUrl: string;
  notificationUrl: string;
}

export interface SubscriptionResult {
  providerRef: string;
  /** Where the customer authorises the recurring charge. */
  initPoint: string;
  raw: Record<string, unknown>;
}

export interface SubscriptionState {
  providerRef: string;
  status: SubscriptionStatus;
  /**
   * When the provider says it will charge again. Only set when the provider
   * reports it: we never invent a billing date.
   */
  nextPaymentAt?: Date;
  /** The recurring amount the provider confirms, in céntimos. */
  amountCents?: number;
  /** Billing period, derived from the provider's own frequency. */
  period?: PlanPeriod;
  /**
   * Our own code (Mercado Pago `external_reference`). For a subscription this app
   * created it is the `LV-XXXXXX` reference; for one bought through a plan link it
   * is the plan's panel code - which is how an unknown subscription is recognised.
   */
  externalReference?: string;
  /**
   * The payer's Mercado Pago account email. Used ONLY to match a subscription the
   * app did not create to the account that paid for it. Kept out of `raw` on
   * purpose, so the stored provider payload holds no personal data.
   */
  payerEmail?: string;
  /** Set when the subscription came from a plan created in the panel. */
  planRef?: string;
  raw: Record<string, unknown>;
}

export interface ResolvedCharge {
  /** The agreement (preapproval) this charge belongs to. */
  subscriptionRef?: string;
  /** The underlying payment, when the charge produced one. */
  paymentRef?: string;
  raw: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Configuration (read lazily, so tests do not need a .env)
// ---------------------------------------------------------------------------

function readEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function requireEnv(name: string): string {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name} para procesar pagos.`);
  }
  return value;
}

/** Mercado Pago test credentials must redirect to the sandbox checkout. */
export function isMercadoPagoSandbox(): boolean {
  return readEnv("MERCADOPAGO_SANDBOX") === "true";
}

// ---------------------------------------------------------------------------
// Mercado Pago (Checkout Pro) - pure payload builders / parsers
// ---------------------------------------------------------------------------

/**
 * Checkout Pro preference payload.
 *
 * Note the unit change: Mercado Pago speaks in the currency's main unit
 * (soles), while we store integer céntimos everywhere else, so this is the one
 * place the /100 conversion happens.
 */
export function mercadopagoPreferenceBody(input: CheckoutInput): Record<string, unknown> {
  return {
    items: [
      {
        id: `${input.planId}-${input.period}`,
        title: input.description,
        description: `${input.businessName} · ${input.reference}`,
        quantity: 1,
        currency_id: PAYMENT_CURRENCY,
        unit_price: input.amountCents / 100,
      },
    ],
    payer: { email: input.payerEmail },
    external_reference: input.reference,
    statement_descriptor: "LIBRODIGITAL",
    notification_url: input.notificationUrl,
    back_urls: {
      success: input.successUrl,
      failure: input.failureUrl,
      pending: input.pendingUrl,
    },
    auto_return: "approved",
  };
}

/** Extracts the preference id and the checkout URL from the response. */
export function parseMercadoPagoPreference(
  json: unknown,
  sandbox = false,
): { providerRef: string; redirectUrl: string } {
  const payload = (json ?? {}) as Record<string, unknown>;
  const id = typeof payload.id === "string" ? payload.id : undefined;
  const initPoint = typeof payload.init_point === "string" ? payload.init_point : undefined;
  const sandboxPoint = typeof payload.sandbox_init_point === "string" ? payload.sandbox_init_point : undefined;

  const redirectUrl = sandbox ? sandboxPoint ?? initPoint : initPoint ?? sandboxPoint;
  if (!id || !redirectUrl) {
    throw new Error("Mercado Pago no devolvió el id o la URL de pago de la preferencia.");
  }
  return { providerRef: id, redirectUrl };
}

/** Mercado Pago's status vocabulary mapped onto our own. */
export function mapMercadoPagoStatus(status: unknown): PaymentStatus {
  switch (String(status ?? "").toLowerCase()) {
    case "approved":
      return "paid";
    case "refunded":
    case "charged_back":
      return "refunded";
    case "rejected":
    case "cancelled":
      return "failed";
    case "pending":
    case "in_process":
    case "authorized":
    default:
      return "pending";
  }
}

/** Keeps only summary fields: never store card or payer personal data. */
export function sanitizeMercadoPagoPayment(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    id: payload.id,
    status: payload.status,
    status_detail: payload.status_detail,
    external_reference: payload.external_reference,
    transaction_amount: payload.transaction_amount,
    currency_id: payload.currency_id,
    payment_method_id: payload.payment_method_id,
    payment_type_id: payload.payment_type_id,
    date_approved: payload.date_approved,
  };
}

/** Parses `GET /v1/payments/{id}` into our own status shape. */
export function parseMercadoPagoPayment(json: unknown): ProviderStatus {
  const payload = (json ?? {}) as Record<string, unknown>;
  const id = payload.id;
  const providerRef = id === undefined || id === null ? "" : String(id);
  if (!providerRef) {
    throw new Error("Mercado Pago no devolvió el id del pago.");
  }

  const amount = payload.transaction_amount;
  return {
    providerRef,
    status: mapMercadoPagoStatus(payload.status),
    amountCents: typeof amount === "number" ? Math.round(amount * 100) : undefined,
    raw: sanitizeMercadoPagoPayment(payload),
  };
}

/**
 * Pulls the topic and the changed resource id out of a Mercado Pago
 * notification.
 *
 * Mercado Pago sends either a JSON body (`{ type: "payment", data: { id } }`) or
 * query parameters when configured as IPN (`?topic=payment&id=...`), so both
 * shapes are accepted. The topics we care about:
 *   payment                         - a one-time charge changed
 *   subscription_preapproval        - the recurring agreement changed status
 *   subscription_authorized_payment - the provider charged (or failed to charge)
 */
export function parseMercadoPagoNotification(
  body: unknown,
  query: Record<string, unknown> = {},
): NotificationInfo {
  const payload = (body ?? {}) as Record<string, unknown>;
  const data = (payload.data ?? {}) as Record<string, unknown>;

  const rawId = data.id ?? payload.id ?? query["data.id"] ?? query.id;
  const providerRef = rawId === undefined || rawId === null ? undefined : String(rawId);

  const rawTopic =
    (typeof payload.type === "string" ? payload.type : undefined) ??
    (typeof payload.topic === "string" ? payload.topic : undefined) ??
    (typeof query.type === "string" ? query.type : undefined) ??
    (typeof query.topic === "string" ? query.topic : undefined);

  const action = typeof payload.action === "string" ? payload.action : undefined;

  return { topic: mapMercadoPagoTopic(rawTopic), providerRef, action };
}

/** Provider topic name -> the four things we actually act on. */
export function mapMercadoPagoTopic(topic: unknown): NotificationTopic {
  switch (String(topic ?? "").toLowerCase()) {
    case "payment":
      return "payment";
    case "subscription_preapproval":
    case "preapproval":
      return "subscription";
    case "subscription_authorized_payment":
    case "authorized_payment":
      return "subscription_payment";
    default:
      return "other";
  }
}

// ---------------------------------------------------------------------------
// Mercado Pago subscriptions (preapproval) - pure payload builders / parsers
// ---------------------------------------------------------------------------

/**
 * Preapproval payload for a subscription without an associated plan.
 *
 * `frequency_type` is `months`, so a yearly subscription is 12 months. As with
 * Checkout Pro, the provider speaks in soles while we store céntimos.
 */
export function mercadopagoPreapprovalBody(input: SubscriptionCheckoutInput): Record<string, unknown> {
  const rule = recurrenceForPeriod(input.period);

  return {
    reason: `${input.description} · ${input.businessName}`,
    external_reference: input.reference,
    payer_email: input.payerEmail,
    back_url: input.backUrl,
    status: "pending",
    auto_recurring: {
      frequency: rule.frequency,
      frequency_type: rule.frequencyType,
      transaction_amount: input.amountCents / 100,
      currency_id: PAYMENT_CURRENCY,
    },
  };
}

/** Keeps only summary fields: never store the payer's personal data. */
export function sanitizeMercadoPagoPreapproval(payload: Record<string, unknown>): Record<string, unknown> {
  const auto = (payload.auto_recurring ?? {}) as Record<string, unknown>;
  return {
    id: payload.id,
    status: payload.status,
    external_reference: payload.external_reference,
    preapproval_plan_id: payload.preapproval_plan_id,
    frequency: auto.frequency,
    frequency_type: auto.frequency_type,
    transaction_amount: auto.transaction_amount,
    currency_id: auto.currency_id,
    date_created: payload.date_created,
    last_modified: payload.last_modified,
  };
}

/**
 * Billing period derived from the provider's frequency (so we never assume
 * monthly for a yearly plan the customer actually bought).
 */
export function periodFromRecurrence(frequency: unknown, frequencyType: unknown): PlanPeriod {
  const amount = Number(frequency);
  const type = String(frequencyType ?? "").toLowerCase();

  if (type === "years") {
    return "annual";
  }
  if (type === "months" && Number.isFinite(amount) && amount >= 12) {
    return "annual";
  }
  return "monthly";
}

/** Mercado Pago's preapproval vocabulary mapped onto our own. */
export function mapMercadoPagoSubscriptionStatus(status: unknown): SubscriptionStatus {
  switch (String(status ?? "").toLowerCase()) {
    case "authorized":
      return "authorized";
    case "paused":
      return "paused";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "pending":
    default:
      return "pending";
  }
}

/** A date string the provider may or may not send. */
function parseOptionalDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Parses a preapproval (from create or GET) into our own subscription shape. */
export function parseMercadoPagoPreapproval(json: unknown): SubscriptionState & { initPoint?: string } {
  const payload = (json ?? {}) as Record<string, unknown>;
  const id = payload.id;
  const providerRef = id === undefined || id === null ? "" : String(id);
  if (!providerRef) {
    throw new Error("Mercado Pago no devolvió el id de la suscripción.");
  }

  const auto = (payload.auto_recurring ?? {}) as Record<string, unknown>;
  const amount = auto.transaction_amount;
  const initPoint = typeof payload.init_point === "string" ? payload.init_point : undefined;

  const externalReference =
    typeof payload.external_reference === "string" ? payload.external_reference : undefined;
  const payerEmail = typeof payload.payer_email === "string" ? payload.payer_email : undefined;
  const planRef =
    payload.preapproval_plan_id === undefined || payload.preapproval_plan_id === null
      ? undefined
      : String(payload.preapproval_plan_id);

  return {
    providerRef,
    status: mapMercadoPagoSubscriptionStatus(payload.status),
    // The next charge date is only recorded when the provider reports it: we
    // never invent a billing date.
    nextPaymentAt:
      parseOptionalDate(payload.next_payment_date) ?? parseOptionalDate(auto.next_payment_date),
    amountCents: typeof amount === "number" ? Math.round(amount * 100) : undefined,
    period: periodFromRecurrence(auto.frequency, auto.frequency_type),
    externalReference,
    payerEmail,
    planRef,
    initPoint,
    // `raw` is the sanitized copy: the payer email above is used for matching and
    // never written into the stored provider payload.
    raw: sanitizeMercadoPagoPreapproval(payload),
  };
}

/**
 * Reads an authorized-payment (invoice) resource.
 *
 * Only two stable fields are trusted here: which agreement it belongs to, and
 * which payment it produced. The amount and the outcome are then read from
 * `/v1/payments/{id}`, the same authoritative source used everywhere else. When
 * the invoice has no payment yet (still scheduled), the caller only refreshes
 * the agreement's state.
 */
export function parseMercadoPagoAuthorizedPayment(json: unknown): ResolvedCharge {
  const payload = (json ?? {}) as Record<string, unknown>;
  const payment = (payload.payment ?? {}) as Record<string, unknown>;

  const subscriptionRef =
    payload.preapproval_id === undefined || payload.preapproval_id === null
      ? undefined
      : String(payload.preapproval_id);

  const paymentId = payment.id ?? payload.payment_id;
  const paymentRef = paymentId === undefined || paymentId === null ? undefined : String(paymentId);

  return {
    subscriptionRef,
    paymentRef,
    raw: {
      id: payload.id,
      preapproval_id: subscriptionRef,
      status: payload.status,
      type: payload.type,
      debit_date: payload.debit_date,
      payment_id: paymentRef,
    },
  };
}

// ---------------------------------------------------------------------------
// HTTP plumbing
// ---------------------------------------------------------------------------

/** Shared JSON fetch with a hard timeout and no redirect following. */
async function requestJson(url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      // Provider APIs never redirect; following one would be an SSRF footgun.
      redirect: "error",
    });

    const text = await response.text();
    let json: unknown;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text.slice(0, 500) };
      }
    }

    if (!response.ok) {
      const detail = json === undefined ? "" : JSON.stringify(json).slice(0, 300);
      throw new Error(`El proveedor de pagos respondió ${response.status}. ${detail}`.trim());
    }

    return json;
  } finally {
    clearTimeout(timer);
  }
}

function getJson(url: string, headers: Record<string, string>): Promise<unknown> {
  return requestJson(url, { method: "GET", headers: { Accept: "application/json", ...headers } });
}

function postJson(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<unknown> {
  return requestJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function putJson(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<unknown> {
  return requestJson(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Manual provider (bank transfer / Yape to a phone number)
// ---------------------------------------------------------------------------

export const DEFAULT_MANUAL_DETAILS = [
  "Realice la transferencia o el Yape a la cuenta que le indique su asesor comercial.",
  "Escriba la referencia en el motivo o la glosa del pago.",
  "Envíe el comprobante por correo. Un administrador confirmará el pago y su plan quedará activo.",
].join("\n");

/** Instruction block shown to the customer, including the amount and reference. */
export function manualPaymentInstructions(
  input: Pick<CheckoutInput, "reference" | "amountCents" | "description">,
): string {
  const configured = readEnv("PAYMENTS_MANUAL_INSTRUCTIONS") ?? DEFAULT_MANUAL_DETAILS;
  return [
    `Referencia: ${input.reference}`,
    `Monto: S/ ${(input.amountCents / 100).toFixed(2)} · ${input.description}`,
    configured,
  ].join("\n");
}

/**
 * Offline provider: nothing is collected automatically. The payment is created
 * in `pending` and only an administrator can mark it as received, which is the
 * honest model for a bank transfer (and how most Peruvian B2B billing starts).
 */
class ManualGateway implements PaymentGateway {
  readonly id = "manual" as const;

  isConfigured(): boolean {
    return true;
  }

  /** Offline: the merchant renews by confirming the next transfer by hand. */
  supportsRecurring(): boolean {
    return false;
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    return {
      providerRef: input.reference,
      redirectUrl: null,
      instructions: manualPaymentInstructions(input),
      raw: { mode: "manual" },
    };
  }

  async fetchStatus(providerRef: string): Promise<ProviderStatus> {
    // There is nothing to poll: only a human can confirm a bank transfer.
    return { providerRef, status: "pending", raw: { mode: "manual" } };
  }

  async createSubscription(): Promise<SubscriptionResult> {
    throw new Error("La transferencia directa no admite cobro automático.");
  }

  async fetchSubscription(providerRef: string): Promise<SubscriptionState> {
    return { providerRef, status: "pending", raw: { mode: "manual" } };
  }

  async cancelSubscription(): Promise<void> {
    // Nothing to stop: there is no standing authorisation.
  }

  async resolveSubscriptionCharge(): Promise<ResolvedCharge> {
    throw new Error("La transferencia directa no genera cobros automáticos.");
  }

  parseNotification(): NotificationInfo {
    // Offline provider: it has no webhook at all.
    return { topic: "other" };
  }
}

// ---------------------------------------------------------------------------
// Mercado Pago (Checkout Pro) adapter
// ---------------------------------------------------------------------------

const MERCADOPAGO_API = "https://api.mercadopago.com";

/**
 * Checkout Pro is a redirect flow: we create a "preference" server-side, send
 * the browser to the returned `init_point`, and Mercado Pago handles cards,
 * Yape, Plin and cash (PagoEfectivo) on its own page. No SDK and no CSP change
 * are needed, which is why it is the recommended automated provider.
 */
class MercadoPagoGateway implements PaymentGateway {
  readonly id = "mercadopago" as const;

  isConfigured(): boolean {
    return Boolean(readEnv("MERCADOPAGO_ACCESS_TOKEN"));
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const token = requireEnv("MERCADOPAGO_ACCESS_TOKEN");
    const json = await postJson(
      `${MERCADOPAGO_API}/checkout/preferences`,
      mercadopagoPreferenceBody(input),
      { Authorization: `Bearer ${token}` },
    );

    const { providerRef, redirectUrl } = parseMercadoPagoPreference(json, isMercadoPagoSandbox());
    return { providerRef, redirectUrl, raw: { preference_id: providerRef } };
  }

  /**
   * Authoritative status lookup. This is what a webhook ultimately triggers -
   * the notification only tells us *which* payment to ask about.
   */
  async fetchStatus(providerRef: string): Promise<ProviderStatus> {
    const token = requireEnv("MERCADOPAGO_ACCESS_TOKEN");
    const json = await getJson(
      `${MERCADOPAGO_API}/v1/payments/${encodeURIComponent(providerRef)}`,
      { Authorization: `Bearer ${token}` },
    );
    return parseMercadoPagoPayment(json);
  }

  supportsRecurring(): boolean {
    return true;
  }

  /**
   * Creates a subscription (preapproval). The customer is not charged yet: the
   * response's `init_point` is where they authorise the recurring charge, and
   * the plan is activated later by the webhook.
   */
  async createSubscription(input: SubscriptionCheckoutInput): Promise<SubscriptionResult> {
    const token = requireEnv("MERCADOPAGO_ACCESS_TOKEN");
    const json = await postJson(
      `${MERCADOPAGO_API}/preapproval`,
      mercadopagoPreapprovalBody(input),
      { Authorization: `Bearer ${token}` },
    );

    const parsed = parseMercadoPagoPreapproval(json);
    if (!parsed.initPoint) {
      throw new Error("Mercado Pago no devolvió la URL para autorizar la suscripción.");
    }

    return { providerRef: parsed.providerRef, initPoint: parsed.initPoint, raw: parsed.raw };
  }

  async fetchSubscription(providerRef: string): Promise<SubscriptionState> {
    const token = requireEnv("MERCADOPAGO_ACCESS_TOKEN");
    const json = await getJson(
      `${MERCADOPAGO_API}/preapproval/${encodeURIComponent(providerRef)}`,
      { Authorization: `Bearer ${token}` },
    );
    return parseMercadoPagoPreapproval(json);
  }

  /**
   * Stops future charges. Mercado Pago answers 400 when the agreement is already
   * cancelled, which is not an error for us - the desired end state is reached.
   */
  async cancelSubscription(providerRef: string): Promise<void> {
    const token = requireEnv("MERCADOPAGO_ACCESS_TOKEN");
    try {
      await putJson(
        `${MERCADOPAGO_API}/preapproval/${encodeURIComponent(providerRef)}`,
        { status: "cancelled" },
        { Authorization: `Bearer ${token}` },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const current = await this.fetchSubscription(providerRef).catch(() => undefined);
      if (current?.status === "cancelled") {
        return;
      }
      throw new Error(message || "No se pudo cancelar la suscripción.");
    }
  }

  /** Turns an authorized-payment id into "which agreement, which payment". */
  async resolveSubscriptionCharge(chargeRef: string): Promise<ResolvedCharge> {
    const token = requireEnv("MERCADOPAGO_ACCESS_TOKEN");
    const json = await getJson(
      `${MERCADOPAGO_API}/authorized_payments/${encodeURIComponent(chargeRef)}`,
      { Authorization: `Bearer ${token}` },
    );
    return parseMercadoPagoAuthorizedPayment(json);
  }

  parseNotification(body: unknown, query: Record<string, unknown>): NotificationInfo {
    return parseMercadoPagoNotification(body, query);
  }
}

// ---------------------------------------------------------------------------
// Not-yet-wired providers
// ---------------------------------------------------------------------------

/**
 * Fails loudly instead of silently doing nothing. These providers appear in the
 * catalog with `available: false` and an explicit `requirement`, so the UI never
 * offers them - this class exists only so `getGateway` stays total.
 */
class UnwiredGateway implements PaymentGateway {
  readonly id: PaymentProviderId;

  constructor(id: PaymentProviderId) {
    this.id = id;
  }

  isConfigured(): boolean {
    return false;
  }

  supportsRecurring(): boolean {
    return false;
  }

  async createCheckout(): Promise<CheckoutResult> {
    throw new Error(
      `El proveedor ${this.id} todavía no está habilitado. Use Mercado Pago o la transferencia manual.`,
    );
  }

  async fetchStatus(providerRef: string): Promise<ProviderStatus> {
    return { providerRef, status: "pending", raw: { mode: "unwired", provider: this.id } };
  }

  async createSubscription(): Promise<SubscriptionResult> {
    throw new Error(`El proveedor ${this.id} todavía no está habilitado para suscripciones.`);
  }

  async fetchSubscription(providerRef: string): Promise<SubscriptionState> {
    return { providerRef, status: "pending", raw: { mode: "unwired", provider: this.id } };
  }

  async cancelSubscription(): Promise<void> {
    throw new Error(`El proveedor ${this.id} todavía no está habilitado para suscripciones.`);
  }

  async resolveSubscriptionCharge(): Promise<ResolvedCharge> {
    throw new Error(`El proveedor ${this.id} todavía no está habilitado para suscripciones.`);
  }

  parseNotification(): NotificationInfo {
    return { topic: "other" };
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const GATEWAYS: Record<PaymentProviderId, PaymentGateway> = {
  mercadopago: new MercadoPagoGateway(),
  manual: new ManualGateway(),
  culqi: new UnwiredGateway("culqi"),
  niubiz: new UnwiredGateway("niubiz"),
  izipay: new UnwiredGateway("izipay"),
};

export function getGateway(providerId: PaymentProviderId): PaymentGateway {
  return GATEWAYS[providerId];
}
