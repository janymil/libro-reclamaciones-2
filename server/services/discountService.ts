import {
  MAX_DISCOUNT_PERCENT,
  describeDiscount,
  evaluateDiscount,
  normalizeDiscountCode,
  type DiscountEvaluation,
} from "@shared/discounts";
import { isPlanId } from "@shared/plans";
import type { DiscountCode, Payment } from "@shared/schema";

import { storage } from "../storage";
import { recordPlatformChange, type ConsoleActor } from "./platformAuditService";

/**
 * Discount codes (Phase 2.7, step 4).
 *
 * The arithmetic is in `@shared/discounts`; this service is the part that touches the
 * database and the console: creating, listing, deactivating, and counting a redemption
 * when (and only when) a payment is confirmed.
 *
 * The rule that keeps it honest: a code is *evaluated* at checkout and *redeemed* at
 * settlement. Nothing at checkout decrements the counter, so an abandoned checkout -
 * or ten of them - never burns a code; and a capped code is counted with a
 * conditional UPDATE, because a read-then-write loses redemptions when two customers
 * pay in the same second.
 */

export interface DiscountCodeView {
  id: string;
  code: string;
  description: string | null;
  kind: 'percent' | 'fixed';
  value: number;
  /** Human description: "−10%" or "−S/ 10.00". */
  label: string;
  planIds: string[];
  maxRedemptions: number | null;
  redemptionCount: number;
  startsAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  /** Localised state the operator reads at a glance. */
  state: 'activo' | 'inactivo' | 'vencido' | 'agotado';
  createdAt: string;
  createdByEmail: string | null;
}

export interface DiscountCodeInput {
  code: string;
  description?: string | null;
  kind: 'percent' | 'fixed';
  /** percent: 1-100. fixed: céntimos off. */
  value: number;
  planIds?: string[];
  maxRedemptions?: number | null;
  expiresAt?: string | null;
}

/** The two kinds the arithmetic understands. */
function isDiscountKind(value: unknown): value is 'percent' | 'fixed' {
  return value === 'percent' || value === 'fixed';
}

/**
 * A code the customer typed that we must refuse, with a message written for them.
 *
 * Its own class because the checkout has to map it to a 400 with the reason, instead
 * of the generic 502 it uses for a provider or database failure: "ese código venció"
 * is not a gateway problem, and telling a customer that it is sends them to support.
 */
export class DiscountRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiscountRejectedError';
  }
}

/** Whatever the row says, the view never contradicts itself. */
function stateOf(row: DiscountCode, now = new Date()): DiscountCodeView['state'] {
  if (!row.isActive) {
    return 'inactivo';
  }
  if (row.expiresAt && row.expiresAt <= now) {
    return 'vencido';
  }
  if (row.maxRedemptions !== null && row.redemptionCount >= row.maxRedemptions) {
    return 'agotado';
  }
  return 'activo';
}

/** What a scope means, in one phrase. */
function describeScope(planIds: string[]): string {
  return planIds.length === 0 ? 'todos los planes pagados' : `solo ${planIds.join(', ')}`;
}

/** The console's list, with the state and the label already resolved. */
export async function listDiscountCodes(): Promise<DiscountCodeView[]> {
  const rows = await storage.listDiscountCodes();
  const now = new Date();

  return await Promise.all(
    rows.map(async (row) => {
      let createdByEmail: string | null = null;
      if (row.createdByUserId) {
        const author = await storage.getUser(row.createdByUserId).catch(() => undefined);
        createdByEmail = author?.email ?? null;
      }

      const kind = isDiscountKind(row.kind) ? row.kind : 'percent';
      return {
        id: row.id,
        code: row.code,
        description: row.description,
        kind,
        value: row.value,
        label: describeDiscount({ kind, value: row.value }),
        planIds: Array.isArray(row.planIds) ? row.planIds : [],
        maxRedemptions: row.maxRedemptions,
        redemptionCount: row.redemptionCount,
        startsAt: row.startsAt ? row.startsAt.toISOString() : null,
        expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
        isActive: row.isActive,
        state: stateOf(row, now),
        createdAt: row.createdAt.toISOString(),
        createdByEmail,
      } satisfies DiscountCodeView;
    }),
  );
}

/** Validates the console's form before it reaches the database. */
export function validateDiscountInput(input: DiscountCodeInput): string | null {
  if (!normalizeDiscountCode(input.code)) {
    return 'Escriba un código (letras y números).';
  }
  if (!isDiscountKind(input.kind)) {
    return 'Tipo de descuento inválido.';
  }
  if (!Number.isFinite(input.value) || input.value <= 0) {
    return 'El valor del descuento debe ser mayor que cero.';
  }
  if (input.kind === 'percent' && input.value > MAX_DISCOUNT_PERCENT) {
    return `Un porcentaje no puede superar ${MAX_DISCOUNT_PERCENT}%.`;
  }
  if (
    input.maxRedemptions !== undefined &&
    input.maxRedemptions !== null &&
    input.maxRedemptions <= 0
  ) {
    return 'El límite de usos debe ser mayor que cero (o vacío para ilimitado).';
  }
  return null;
}

export async function createDiscountCode(
  input: DiscountCodeInput,
  actor: ConsoleActor,
): Promise<DiscountCodeView> {
  const code = normalizeDiscountCode(input.code);
  if (!code) {
    throw new Error('Escriba un código de descuento (letras y números).');
  }

  const existing = await storage.getDiscountCodeByCode(code);
  if (existing) {
    throw new Error(`El código ${code} ya existe.`);
  }

  const row = await storage.createDiscountCode({
    code,
    description: input.description ?? null,
    kind: input.kind,
    value: input.value,
    planIds: (input.planIds ?? []).filter((planId) => isPlanId(planId) && planId !== 'gratis'),
    maxRedemptions: input.maxRedemptions ?? null,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    isActive: true,
    createdByUserId: actor.userId,
  });

  await recordPlatformChange(
    actor,
    'descuentos',
    `Descuento ${code} creado (${describeDiscount({ kind: input.kind, value: input.value })}, ` +
      `${describeScope(row.planIds ?? [])})`,
    { code, kind: input.kind, value: input.value, planIds: row.planIds },
  );

  const views = await listDiscountCodes();
  return views.find((view) => view.id === row.id) as DiscountCodeView;
}

export async function updateDiscountCode(
  id: string,
  input: Partial<DiscountCodeInput> & { isActive?: boolean },
  actor: ConsoleActor,
): Promise<DiscountCodeView | undefined> {
  const current = await storage.getDiscountCode(id);
  if (!current) {
    return undefined;
  }

  const code = input.code !== undefined ? normalizeDiscountCode(input.code) : current.code;
  if (!code) {
    throw new Error('Escriba un código de descuento (letras y números).');
  }
  if (code !== current.code) {
    const clash = await storage.getDiscountCodeByCode(code);
    if (clash) {
      throw new Error(`El código ${code} ya existe.`);
    }
  }

  await storage.updateDiscountCode(id, {
    code,
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.kind !== undefined ? { kind: input.kind } : {}),
    ...(input.value !== undefined ? { value: input.value } : {}),
    ...(input.planIds !== undefined
      ? { planIds: input.planIds.filter((planId) => isPlanId(planId) && planId !== 'gratis') }
      : {}),
    ...(input.maxRedemptions !== undefined ? { maxRedemptions: input.maxRedemptions } : {}),
    ...(input.expiresAt !== undefined
      ? { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null }
      : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
  });

  await recordPlatformChange(
    actor,
    'descuentos',
    `Descuento ${code} actualizado${
      input.isActive === false ? ' (desactivado)' : input.isActive === true ? ' (activado)' : ''
    }`,
    { code, changes: input },
  );

  const views = await listDiscountCodes();
  return views.find((view) => view.id === id);
}

/** Removes a code that was never used. One with redemptions is kept, only disabled. */
export async function deleteDiscountCode(id: string, actor: ConsoleActor): Promise<boolean> {
  const current = await storage.getDiscountCode(id);
  if (!current) {
    return false;
  }

  const deleted = await storage.deleteDiscountCode(id);
  if (!deleted) {
    throw new Error(
      `El código ${current.code} ya se usó ${current.redemptionCount} vez/veces: no se puede borrar. ` +
        'Desactívelo para que nadie más lo use.',
    );
  }

  await recordPlatformChange(actor, 'descuentos', `Descuento ${current.code} eliminado`, {
    code: current.code,
  });
  return true;
}

/**
 * Validates a customer-typed code against a plan and an amount.
 *
 * Used by the checkout *and* by the small preview the dialog calls to show "con PRO10
 * pagas S/ 26.10" before sending anyone to a payment page. The checkout re-validates:
 * a preview is a courtesy, never the basis for a charge.
 *
 * An unknown code and an expired one are answered differently - "no existe" and
 * "venció" - because the customer can act on the difference.
 */
export async function evaluateDiscountForCheckout(
  rawCode: string,
  context: { planId: string; amountCents: number },
): Promise<DiscountEvaluation & { rule?: { id: string; code: string } }> {
  const code = normalizeDiscountCode(rawCode);
  const refuse = (reason: string): DiscountEvaluation => ({
    ok: false,
    reason,
    label: '',
    amountOffCents: 0,
    finalAmountCents: context.amountCents,
  });

  if (!code) {
    return refuse('Escriba un código de descuento.');
  }

  const row = await storage.getDiscountCodeByCode(code);
  if (!row) {
    return refuse('Ese código no existe.');
  }

  const evaluation = evaluateDiscount(
    {
      code: row.code,
      kind: isDiscountKind(row.kind) ? row.kind : 'percent',
      value: row.value,
      planIds: Array.isArray(row.planIds) ? row.planIds : [],
      maxRedemptions: row.maxRedemptions,
      redemptionCount: row.redemptionCount,
      expiresAt: row.expiresAt,
      isActive: row.isActive,
    },
    context,
  );

  return { ...evaluation, rule: evaluation.ok ? { id: row.id, code: row.code } : undefined };
}

/**
 * Counts the redemption of a confirmed payment.
 *
 * Called from `settlePayment`, i.e. after the money is in: the payment is already
 * `paid` at that point, so the worst case here is a capped code that ends up one over
 * its limit and a loud log line - never a customer who paid and got nothing.
 */
export async function redeemDiscountForPayment(payment: Payment): Promise<void> {
  if (!payment.discountCodeId || payment.status !== 'paid') {
    return;
  }

  const counted = await storage.redeemDiscountCode(payment.discountCodeId);
  if (!counted) {
    console.error(
      `[payments] el código ${payment.discountCode ?? payment.discountCodeId} superó su límite de usos ` +
        `con el pago ${payment.reference}: el pago está confirmado, el contador no se pudo incrementar.`,
    );
  }
}
