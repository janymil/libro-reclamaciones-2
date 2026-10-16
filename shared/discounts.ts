import { PAYMENT_CURRENCY_SYMBOL } from "./payments";

/**
 * Discount codes (Phase 2.7, step 4).
 *
 * A code is a promise the app makes to a customer ("PRO10 = 10% off"), so the
 * arithmetic lives here - pure, framework-free and unit-tested - and is used by
 * three callers that must never disagree:
 *   * the checkout, which charges the discounted amount,
 *   * the console's Descuentos screen, which previews what a code does,
 *   * the tests, which pin the edge cases (100% off, an expired code, a code for
 *     another plan, the last redemption).
 *
 * Money is integer céntimos everywhere, like the rest of the billing code: a
 * percentage is rounded once, in our favour, and never re-rounded downstream.
 */

export type DiscountKind = "percent" | "fixed";

/** Percent codes go up to 100 (a cortesía); fixed codes are in céntimos. */
export const MAX_DISCOUNT_PERCENT = 100;

/**
 * The smallest amount we are willing to charge.
 *
 * A 100% code would make a `pending` payment of S/ 0.00, which no provider can
 * take and which leaves a plan that can never activate. Codes are therefore
 * capped so at least S/ 1.00 is charged - a free month is granted from the
 * Clientes screen instead, where it is a deliberate, audited act.
 */
export const MIN_CHARGEABLE_CENTS = 100;

/** One row of `discount_codes`, as far as the arithmetic is concerned. */
export interface DiscountRule {
  code: string;
  kind: DiscountKind;
  /** percent: 1-100. fixed: céntimos off. */
  value: number;
  /** Plan ids this code applies to. Empty = every paid plan. */
  planIds: string[];
  maxRedemptions: number | null;
  redemptionCount: number;
  expiresAt: Date | null;
  isActive: boolean;
}

export interface DiscountEvaluation {
  ok: boolean;
  /** Why it was refused, in the operator's words (never a code). */
  reason?: string;
  /** Human description of the offer, e.g. "−10%" or "−S/ 10.00". */
  label: string;
  amountOffCents: number;
  /** What we would charge. Always >= 0. */
  finalAmountCents: number;
}

/**
 * Codes are typed by hand from a WhatsApp message or a flyer, so `pro 10` and
 * `PRO-10` must be the same code: uppercase, letters and digits only.
 */
export function normalizeDiscountCode(raw: unknown): string {
  if (typeof raw !== 'string') {
    return '';
  }
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** The offer in one line, for the console and for the checkout. */
export function describeDiscount(rule: Pick<DiscountRule, 'kind' | 'value'>): string {
  if (rule.kind === 'percent') {
    return `−${rule.value}%`;
  }
  return `−${PAYMENT_CURRENCY_SYMBOL} ${(rule.value / 100).toFixed(2)}`;
}

/** How much comes off, never more than the price itself. */
export function discountAmountOffCents(
  rule: Pick<DiscountRule, 'kind' | 'value'>,
  amountCents: number,
): number {
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return 0;
  }
  if (rule.kind === 'percent') {
    const percent = Math.min(Math.max(rule.value, 0), MAX_DISCOUNT_PERCENT);
    // Rounded up: we would rather take one céntimo less than one more, and the
    // customer can check the maths in their head.
    return Math.min(amountCents, Math.ceil((amountCents * percent) / 100));
  }
  return Math.min(amountCents, Math.max(0, Math.round(rule.value)));
}

/**
 * Whether a code may be used right now, and for how much.
 *
 * Pure: the caller loads the row and supplies the clock, which is what makes
 * "expired yesterday" testable without waiting for tomorrow.
 */
export function evaluateDiscount(
  rule: DiscountRule,
  context: { planId: string; amountCents: number; now?: Date },
): DiscountEvaluation {
  const now = context.now ?? new Date();
  const label = describeDiscount(rule);
  const refuse = (reason: string): DiscountEvaluation => ({
    ok: false,
    reason,
    label,
    amountOffCents: 0,
    finalAmountCents: context.amountCents,
  });

  if (!rule.isActive) {
    return refuse('Este código ya no está activo.');
  }
  if (rule.expiresAt && rule.expiresAt <= now) {
    return refuse('Este código venció.');
  }
  if (rule.planIds.length > 0 && !rule.planIds.includes(context.planId)) {
    return refuse('Este código no aplica al plan elegido.');
  }
  if (rule.maxRedemptions !== null && rule.redemptionCount >= rule.maxRedemptions) {
    return refuse('Este código agotó sus usos.');
  }
  if (context.amountCents <= 0) {
    return refuse('El plan es gratuito: no hay nada que descontar.');
  }

  const amountOffCents = discountAmountOffCents(rule, context.amountCents);
  const finalAmountCents = Math.max(0, context.amountCents - amountOffCents);

  if (finalAmountCents < MIN_CHARGEABLE_CENTS) {
    return refuse(
      `El descuento deja el pago por debajo de ${PAYMENT_CURRENCY_SYMBOL} 1.00, que es el mínimo cobrable. Use un descuento menor o active el plan desde Clientes.`,
    );
  }

  // A code that changes nothing is a code the customer would think is broken.
  if (amountOffCents <= 0) {
    return refuse('Este código no descuenta nada en este plan.');
  }

  return { ok: true, label, amountOffCents, finalAmountCents };
}
