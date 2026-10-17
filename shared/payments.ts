import { PLANS, PLAN_LIST, isPlanId } from "./plans";

/**
 * Peruvian payment catalog (Phase 2.7).
 *
 * Why this file exists: Stripe does not onboard Peruvian companies (Peru is not
 * a supported business country), and PayPal is technically available but almost
 * nobody in Peru pays a local B2B SaaS with it. Peruvian customers pay with
 * **tarjeta**, **Yape**, **Plin**, **PagoEfectivo/efectivo** or a plain bank
 * transfer - and those rails are only reachable through a local PSP
 * (Mercado Pago, Culqi, Niubiz, Izipay). Yape and Plin are never contracted
 * directly by a shop: they arrive as a payment method of one of those PSPs.
 *
 * This module is the single, framework-free source of truth for
 *   * which providers exist and which methods each one offers,
 *   * how prices in soles become integer céntimos (never floats, so no
 *     rounding drift on money),
 *   * how a provider status maps onto our own payment lifecycle.
 *
 * It has no I/O on purpose, so it is fully unit-tested (shared/payments.test.ts)
 * and can be imported by both the server and the browser.
 */

// ---------------------------------------------------------------------------
// Payment methods (what the customer actually uses)
// ---------------------------------------------------------------------------

export type PaymentMethodId = "tarjeta" | "yape" | "plin" | "efectivo" | "transferencia";

export interface PaymentMethodInfo {
  id: PaymentMethodId;
  name: string;
  description: string;
  /** Material Symbols icon name, rendered by the client. */
  icon: string;
}

/**
 * Methods an operator may reconcile by hand.
 *
 * Everything listed here is money that arrived OUTSIDE the provider: a bank
 * transfer, a Yape/Plin notification, cash at an agent. `tarjeta` is deliberately
 * absent - a card charge either exists in the provider's API or it does not, and
 * letting staff "confirm" one by hand would be a free-plan button.
 *
 * Used by the admin panel when a customer pays a pending order with one of these
 * methods instead of finishing the card checkout.
 */
export const MANUAL_PAYMENT_METHODS: PaymentMethodId[] = ["transferencia", "yape", "plin", "efectivo"];

export function isPaymentMethodId(value: string): value is PaymentMethodId {
  return value in PAYMENT_METHODS;
}

export function isManualPaymentMethod(value: string): value is PaymentMethodId {
  return MANUAL_PAYMENT_METHODS.includes(value as PaymentMethodId);
}

export const PAYMENT_METHODS: Record<PaymentMethodId, PaymentMethodInfo> = {
  tarjeta: {
    id: "tarjeta",
    name: "Tarjeta de crédito o débito",
    description: "Visa, Mastercard y American Express. Cargo inmediato.",
    icon: "credit_card",
  },
  yape: {
    id: "yape",
    name: "Yape",
    description: "El cliente escanea un código QR y confirma con su clave de 6 dígitos.",
    icon: "qr_code_scanner",
  },
  plin: {
    id: "plin",
    name: "Plin",
    description: "Billetera de BBVA, Interbank y Scotiabank.",
    icon: "qr_code_scanner",
  },
  efectivo: {
    id: "efectivo",
    name: "Efectivo (agente o bodega)",
    description: "Se genera un código de pago que el cliente paga en efectivo.",
    icon: "payments",
  },
  transferencia: {
    id: "transferencia",
    name: "Transferencia o depósito bancario",
    description: "El cliente deposita en la cuenta de la empresa y usted confirma el pago.",
    icon: "account_balance",
  },
};

// ---------------------------------------------------------------------------
// Providers (which PSP actually moves the money)
// ---------------------------------------------------------------------------

export type PaymentProviderId = "mercadopago" | "culqi" | "manual" | "niubiz" | "izipay";

export interface PaymentProviderDefinition {
  id: PaymentProviderId;
  name: string;
  tagline: string;
  /** Payment methods this provider can actually transact. */
  methods: PaymentMethodId[];
  /**
   * true  = the merchant signs up online and only needs API keys (.env).
   * false = requires a signed commercial contract / bank affiliation.
   */
  selfServe: boolean;
  /**
   * false = listed in the catalog so the roadmap is visible, but NOT wired:
   * `availablePaymentProviders()` filters it out of the checkout screen.
   */
  available: boolean;
  /**
   * true = the provider can charge the customer automatically every period
   * (Mercado Pago "Suscripciones" / preapproval). A SaaS wants this; a provider
   * without it can only sell period by period, renewed by hand.
   */
  supportsRecurring: boolean;
  /** What is missing before `available` can become true. */
  requirement?: string;
  docsUrl: string;
  /** Environment variables that must be set for this provider to work. */
  envKeys: string[];
}

export const PAYMENT_PROVIDERS: PaymentProviderDefinition[] = [
  {
    id: "mercadopago",
    name: "Mercado Pago",
    tagline: "Tarjeta, Yape o Plin. Con tarjeta, además, cobro automático: se renueva sola.",
    methods: ["tarjeta", "yape", "plin", "efectivo"],
    selfServe: true,
    available: true,
    supportsRecurring: true,
    docsUrl: "https://www.mercadopago.com.pe/developers",
    envKeys: ["MERCADOPAGO_ACCESS_TOKEN"],
  },
  {
    id: "culqi",
    name: "Culqi",
    tagline: "Pasarela peruana: tarjetas, Yape y pago en efectivo.",
    methods: ["tarjeta", "yape", "efectivo"],
    selfServe: true,
    available: false,
    supportsRecurring: false,
    requirement:
      "Requiere el SDK Culqi Checkout en el frontend (crea el token de tarjeta/Yape) y añadirlo a la CSP de producción.",
    docsUrl: "https://docs.culqi.com/es/documentacion",
    envKeys: ["CULQI_SECRET_KEY"],
  },
  {
    id: "manual",
    name: "Transferencia / Yape directo",
    tagline: "Paga el periodo por transferencia y usted lo renueva cuando quiera.",
    methods: ["transferencia", "yape"],
    selfServe: true,
    available: true,
    supportsRecurring: false,
    docsUrl: "",
    envKeys: [],
  },
  {
    id: "niubiz",
    name: "Niubiz (ex VisaNet)",
    tagline: "El adquirente más grande del Perú; requiere contrato comercial.",
    methods: ["tarjeta"],
    selfServe: false,
    available: false,
    supportsRecurring: false,
    requirement: "Requiere contrato comercial y afiliación como comercio.",
    docsUrl: "https://developer.niubiz.com.pe/",
    envKeys: ["NIUBIZ_MERCHANT_ID", "NIUBIZ_API_KEY"],
  },
  {
    id: "izipay",
    name: "Izipay",
    tagline: "Pasarela de BCP/Interbank; requiere afiliación y contrato comercial.",
    methods: ["tarjeta", "yape"],
    selfServe: false,
    available: false,
    supportsRecurring: false,
    requirement: "Requiere código de comercio y llaves entregadas por Izipay.",
    docsUrl: "https://developer.izipay.pe/",
    envKeys: ["IZIPAY_MERCHANT_ID", "IZIPAY_API_KEY"],
  },
];

export function isPaymentProviderId(value: string): value is PaymentProviderId {
  return PAYMENT_PROVIDERS.some((provider) => provider.id === value);
}

export function getPaymentProvider(id: string): PaymentProviderDefinition | undefined {
  return PAYMENT_PROVIDERS.find((provider) => provider.id === id);
}

/** Providers that can be offered in the checkout screen right now. */
export function availablePaymentProviders(): PaymentProviderDefinition[] {
  return PAYMENT_PROVIDERS.filter((provider) => provider.available);
}

// ---------------------------------------------------------------------------
// Money (always integer céntimos of a sol)
// ---------------------------------------------------------------------------

export const PAYMENT_CURRENCY = "PEN";
export const PAYMENT_CURRENCY_SYMBOL = "S/";

export type PlanPeriod = "monthly" | "annual";

/** 15.00 soles -> 1500 céntimos. Rounded to avoid float noise (3199.9999...). */
export function solesToCents(soles: number): number {
  return Math.round(soles * 100);
}

export function centsToSoles(cents: number): number {
  return Math.round(cents) / 100;
}

/** Catalogue price of a plan for a billing period, in céntimos. Gratis costs 0. */
export function planAmountCents(planId: string, period: PlanPeriod): number {
  const plan = PLANS[isPlanId(planId) ? planId : "gratis"];
  return solesToCents(period === "annual" ? plan.priceAnnual : plan.priceMonthly);
}

export function isPlanPeriod(value: string): value is PlanPeriod {
  return value === "monthly" || value === "annual";
}

/**
 * Referential commission estimates, used ONLY to show the merchant what the
 * PSP will roughly keep. Rates are negotiated per merchant and change over
 * time, so these are labels, never used for accounting.
 */
export interface ProviderFeeEstimate {
  rate: number;
  fixedCents: number;
  note: string;
}

export const PROVIDER_FEE_ESTIMATES: Record<PaymentProviderId, ProviderFeeEstimate> = {
  mercadopago: {
    rate: 0.0499,
    fixedCents: 0,
    note: "Tarifa referencial publicada de Mercado Pago Perú. Confirme la suya en su panel.",
  },
  culqi: {
    rate: 0.0369,
    fixedCents: 0,
    note: "Tarifa referencial para tarjeta. Yape y efectivo suelen tener otra comisión.",
  },
  manual: {
    rate: 0,
    fixedCents: 0,
    note: "Sin comisión de pasarela. Solo la comisión del banco por transferencia, si aplica.",
  },
  niubiz: {
    rate: 0.0299,
    fixedCents: 0,
    note: "Tarifa negociada por contrato; depende de su volumen y giro.",
  },
  izipay: {
    rate: 0.0339,
    fixedCents: 0,
    note: "Tarifa negociada por contrato; depende de su afiliación con el BCP.",
  },
};

/** What the merchant keeps after the PSP commission (estimate, in céntimos). */
export function estimateNetCents(providerId: PaymentProviderId, grossCents: number): number {
  const fee = PROVIDER_FEE_ESTIMATES[providerId];
  const net = Math.round(grossCents * (1 - fee.rate)) - fee.fixedCents;
  return Math.max(0, net);
}

// ---------------------------------------------------------------------------
// Payment lifecycle
// ---------------------------------------------------------------------------

/**
 * Our own status vocabulary, which every provider status is mapped onto:
 *   pending  - created, waiting for the customer / the bank
 *   paid     - money confirmed received
 *   failed   - declined or rejected
 *   expired  - abandoned / the provider timed it out
 *   refunded - returned to the customer (kept for the accounting trail)
 */
export type PaymentStatus = "pending" | "paid" | "failed" | "expired" | "refunded";

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Pendiente",
  paid: "Pagado",
  failed: "Rechazado",
  expired: "Vencido",
  refunded: "Devuelto",
};

export function isPaymentStatus(value: string): value is PaymentStatus {
  return ["pending", "paid", "failed", "expired", "refunded"].includes(value);
}

/**
 * Whether the customer's money has definitively moved one way or the other.
 *
 * Takes a plain string because the status read back from the database is typed
 * as `varchar`, and a predicate that throws on a legacy value would be useless.
 */
export function isPaymentSettled(status: string): boolean {
  return status === "paid" || status === "refunded";
}

/** The only status that unlocks the paid plan. */
export function isPaymentSuccessful(status: string): boolean {
  return status === "paid";
}

/**
 * Why a provider declined, in words the customer can act on.
 *
 * `status_detail` is the provider's own vocabulary (Mercado Pago: `cc_rejected_*`).
 * We show it as the reason an attempt failed - in the payments screen and in the
 * "finish your payment" email - so it has to be translated, and the translation
 * has to suggest something to do next. The raw code stays in `payments.raw` for
 * support; this map is only the human half.
 */
export const PAYMENT_FAILURE_HINTS: Record<string, string> = {
  cc_rejected_bad_filled_card_number: "El número de la tarjeta no es correcto.",
  cc_rejected_bad_filled_date: "La fecha de vencimiento de la tarjeta no es correcta.",
  cc_rejected_bad_filled_other: "Algún dato de la tarjeta no es correcto.",
  cc_rejected_bad_filled_security_code: "El código de seguridad (CVV) de la tarjeta no es correcto.",
  cc_rejected_blacklist: "El banco bloqueó esta tarjeta. Use otra tarjeta o pague por transferencia.",
  cc_rejected_call_for_authorize:
    "El banco pidió autorizar el pago desde su aplicación. Autorícelo e intente de nuevo, o use otra tarjeta.",
  cc_rejected_card_disabled:
    "La tarjeta está desactivada para compras por internet. Actívela con su banco o use otra tarjeta.",
  cc_rejected_card_error: "El banco no pudo procesar la tarjeta. Intente con otra tarjeta.",
  cc_rejected_duplicated_payment:
    "Ya existe un pago igual registrado. Revise su estado de cuenta antes de reintentar.",
  cc_rejected_high_risk:
    "El proveedor de pagos marcó la operación como de riesgo alto y no la autorizó. Intente con otra tarjeta, con otro titular, o pague por transferencia.",
  cc_rejected_insufficient_amount: "La tarjeta no tiene saldo suficiente.",
  cc_rejected_invalid_installments: "El banco no permite pagar en las cuotas elegidas.",
  cc_rejected_max_attempts:
    "Se superó el número de intentos permitidos con esta tarjeta. Use otra tarjeta o pague por transferencia.",
  cc_rejected_other_reason: "El banco rechazó el pago sin indicar el motivo.",
};

/** Used for any other decline code (or none): still says what to do next. */
export const PAYMENT_FAILURE_HINT_FALLBACK =
  "El pago no se pudo completar. Puede intentarlo de nuevo con otra tarjeta o pagar por transferencia o Yape.";

/**
 * Always returns something printable: a failure with no reason is the worst
 * message of all, so an unknown code degrades to the generic text instead of null.
 */
export function paymentFailureHint(statusDetail: unknown): string {
  if (typeof statusDetail !== "string" || !statusDetail.trim()) {
    return PAYMENT_FAILURE_HINT_FALLBACK;
  }
  return PAYMENT_FAILURE_HINTS[statusDetail.trim()] ?? PAYMENT_FAILURE_HINT_FALLBACK;
}

// ---------------------------------------------------------------------------
// Recurring subscriptions (Mercado Pago "Suscripciones" / preapproval)
// ---------------------------------------------------------------------------

/**
 * The provider's own vocabulary for a recurring agreement, mapped onto ours:
 *   pending    - the customer has not finished the first payment yet
 *   authorized - the agreement is live; the provider charges every period
 *   paused     - charging failed or was paused; access should not be renewed
 *   cancelled  - the customer or the merchant ended it
 *
 * `cancelled` does NOT remove access immediately: the customer already paid for
 * the current period, so the plan runs until `currentPeriodEnd`.
 */
export type SubscriptionStatus = "pending" | "authorized" | "paused" | "cancelled";

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  pending: "Pendiente de activación",
  authorized: "Activa (se renueva sola)",
  paused: "Pausada (no se pudo cobrar)",
  cancelled: "Cancelada",
};

export function isSubscriptionStatus(value: string): value is SubscriptionStatus {
  return ["pending", "authorized", "paused", "cancelled"].includes(value);
}

/** Whether the provider is allowed to keep charging on this agreement. */
export function isSubscriptionLive(status: string): boolean {
  return status === "authorized";
}

/**
 * Billing frequency in the shape the provider expects.
 *
 * `frequency_type` is one of `days` or `months`; a year is expressed as 12
 * months, which is how the provider documents yearly subscriptions.
 */
export interface RecurrenceRule {
  frequency: number;
  frequencyType: "days" | "months";
}

export function recurrenceForPeriod(period: PlanPeriod): RecurrenceRule {
  return period === "annual"
    ? { frequency: 12, frequencyType: "months" }
    : { frequency: 1, frequencyType: "months" };
}

/** Whether the provider can charge this customer automatically. */
export function providerSupportsRecurring(providerId: string): boolean {
  return getPaymentProvider(providerId)?.supportsRecurring === true;
}

// ---------------------------------------------------------------------------
// Human-facing reference ("LD-8F3A2B") used on bank transfers and receipts
// ---------------------------------------------------------------------------

/** Ambiguous characters (O/0, I/1) removed so a reference can be read aloud. */
const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Turns raw random bytes into a readable code. Pure, so the generator can be
 * unit-tested with a fixed byte sequence.
 */
export function referenceSuffix(bytes: Uint8Array, length = 6): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += REFERENCE_ALPHABET[bytes[i % bytes.length] % REFERENCE_ALPHABET.length];
  }
  return out;
}

export function buildPaymentReference(suffix: string): string {
  return `LD-${suffix.toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// Billing period arithmetic (moved here so server and client agree)
// ---------------------------------------------------------------------------

export function periodMonths(period: PlanPeriod): number {
  return period === "annual" ? 12 : 1;
}

/** Adds one month / one year to `start`, returned as a new Date. */
export function computePeriodEnd(start: Date, period: PlanPeriod): Date {
  const end = new Date(start.getTime());
  end.setUTCMonth(end.getUTCMonth() + periodMonths(period));
  return end;
}

// ---------------------------------------------------------------------------
// Plans created in the Mercado Pago panel (the public subscription links)
// ---------------------------------------------------------------------------

/**
 * Whether a base URL is something Mercado Pago can actually call back.
 *
 * Webhooks and return URLs are useless when they point at localhost: the provider
 * cannot reach it, and the customer would be redirected to their own machine. The
 * point of this check is to turn a silent failure ("the plan never activates and
 * nobody knows why") into a loud one at the moment the payment is created.
 */
export function isPubliclyReachableBaseUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  // Mercado Pago only delivers to HTTPS.
  if (parsed.protocol !== "https:") {
    return false;
  }

  // IPv6 hosts arrive wrapped in brackets ("[::1]"), so strip them first.
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local")) {
    return false;
  }

  return true;
}

/**
 * The "Código de referencia" (`external_reference`) of every plan created in the
 * Mercado Pago panel, mapped onto our own plan and billing period.
 *
 * Why this exists: a plan created in the panel can be paid through its own public
 * link (`mpago.la/...`). That subscription is created by Mercado Pago, so we have
 * never seen it and we cannot tell from an id which plan was bought. This code -
 * or, failing that, the amount plus the frequency - is what lets the webhook
 * recognise the purchase instead of dropping a paid subscription on the floor.
 *
 * Keep it in sync with the panel. The codes below are the ones the panel was
 * configured with; changing a code in the panel means changing it here too.
 */
export const PLAN_REFERENCE_CODES: Record<string, { planId: string; period: PlanPeriod }> = {
  "LD-ESENCIAL-M": { planId: "esencial", period: "monthly" },
  "LD-ESENCIAL-A": { planId: "esencial", period: "annual" },
  "LD-PROFESIONAL-M": { planId: "profesional", period: "monthly" },
  "LD-PROFESIONAL-A": { planId: "profesional", period: "annual" },
  "LD-CORPORATIVO-M": { planId: "corporativo", period: "monthly" },
  "LD-CORPORATIVO-A": { planId: "corporativo", period: "annual" },
};

export interface ResolvedPlanPurchase {
  planId: string;
  period: PlanPeriod;
}

/**
 * Reads a plan code such as `LD-PROFESIONAL-A` (trimmed, case-insensitive).
 *
 * Codes written before the LibroVirtual -> LibroDigital rebrand used an `LV-`
 * prefix. Those are still accepted: a plan configured in the Mercado Pago panel
 * months ago must keep activating, because the alternative is a paid
 * subscription silently dropped for a prefix nobody remembers.
 */
export function resolvePlanFromCode(code: unknown): ResolvedPlanPurchase | undefined {
  if (typeof code !== "string") {
    return undefined;
  }
  const normalized = code.trim().toUpperCase();
  return PLAN_REFERENCE_CODES[normalized] ?? PLAN_REFERENCE_CODES[normalized.replace(/^LV-/, "LD-")];
}

/**
 * Fallback for when the code did not survive the trip.
 *
 * Price and frequency together identify a plan unambiguously (15/29/69 per month,
 * 89/189/429 per year), so a purchase is still recognised if the panel code is
 * missing or was typed differently. Note that the period is always required: the
 * monthly and annual prices of a tier are different, and one tier's annual price
 * can equal another tier's monthly price.
 */
export function resolvePlanFromAmount(
  amountCents: number,
  period: PlanPeriod,
): ResolvedPlanPurchase | undefined {
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return undefined;
  }

  const match = PLAN_LIST.find((plan) => planAmountCents(plan.id, period) === amountCents);
  return match ? { planId: match.id, period } : undefined;
}

