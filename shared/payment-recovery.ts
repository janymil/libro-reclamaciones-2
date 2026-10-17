import type { PlanPeriod } from "./payments";

/**
 * "Finish your payment" email (Phase 2.7, step 5).
 *
 * A declined card is not a lost customer: most of the time the same person will
 * pay with another card, a transfer or Yape five minutes later - if somebody
 * tells them how. This module is the single, framework-free place that decides
 * WHAT that message says, so
 *
 *   * the automatic email (a payment turned `failed`),
 *   * the operator's "send the payment link" button in the console,
 *
 * produce byte-for-byte the same text, and it can be unit-tested without a mail
 * server.
 *
 * Two links travel in it, on purpose:
 *
 *   1. `checkoutUrl` - the exact URL the customer was sent to the first time
 *      (Mercado Pago's `init_point`, stored on the payment). Resuming there keeps
 *      the amount, the discount and the reference they already saw.
 *   2. `resumeUrl` - our own `/suscribir?plan=…` page, which always exists and
 *      re-creates a checkout for the same plan if the provider link expired.
 *
 * The transfer/Yape block is passed in already rendered (`buildTransferInstructions`)
 * because the reference and the amount printed in it must be the same ones stored
 * on the payment.
 */

/** The in-app page that starts a checkout; also used by the client's share links. */
export const PAYMENT_RESUME_PATH = "/suscribir";

/** Where a customer starts the same purchase again, inside the app. */
export function buildPaymentResumeUrl(
  baseUrl: string,
  planId: string,
  period: PlanPeriod,
): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}${PAYMENT_RESUME_PATH}?plan=${encodeURIComponent(planId)}&periodo=${encodeURIComponent(period)}`;
}

export interface PaymentRecoveryMessageInput {
  /** Customer's first name; may be empty (then the greeting is neutral). */
  firstName: string;
  businessName: string;
  planName: string;
  periodLabel: string;
  /** "S/ 5.00", already formatted with the currency symbol. */
  amountLabel: string;
  reference: string;
  /** The provider checkout the customer used, when it is still usable. */
  checkoutUrl: string | null;
  /** Our own page that starts the purchase again. Always present. */
  resumeUrl: string;
  /** Rendered transfer/Yape instructions for this exact amount and reference. */
  transferInstructions: string | null;
  /** Why the first attempt failed, in the customer's words. */
  reason: string | null;
  /** The platform's legal/contact lines, as printed on a receipt. */
  footerLines: string[];
}

export function paymentRecoverySubject(
  input: Pick<PaymentRecoveryMessageInput, "reference" | "planName">,
): string {
  return `Pago pendiente ${input.reference} - ${input.planName}`;
}

/**
 * Plain-text body.
 *
 * Plain text, like every other message the platform sends itself: it renders the
 * same in Gmail, Outlook and a phone, and it needs no HTML escaping for the
 * company name or the customer's own name.
 */
export function buildPaymentRecoveryText(input: PaymentRecoveryMessageInput): string {
  const greeting = input.firstName.trim() ? `Hola ${input.firstName.trim()},` : "Hola,";

  const lines: string[] = [
    `Pago pendiente - ${input.businessName}`,
    "",
    greeting,
    "",
    `Su pago de ${input.amountLabel} para el ${input.planName} (${input.periodLabel}) no se pudo completar.`,
    `Referencia: ${input.reference}`,
  ];

  if (input.reason) {
    // Indented so it reads as the explanation of the line above, not as a new topic.
    lines.push(`Motivo: ${input.reason}`);
  }

  if (input.checkoutUrl) {
    lines.push(
      "",
      "Puede completarlo con el mismo enlace que usó la primera vez:",
      input.checkoutUrl,
    );
  }

  lines.push(
    "",
    input.checkoutUrl
      ? "Si el enlace ya no funciona, empiece de nuevo aquí:"
      : "Puede empezar de nuevo aquí:",
    input.resumeUrl,
  );

  if (input.transferInstructions) {
    lines.push(
      "",
      "También puede pagar por transferencia, Yape o Plin con estos datos:",
      "",
      input.transferInstructions,
    );
  } else {
    // Nothing configured in the console: still tell them what makes a transfer
    // identifiable, instead of asking them to guess.
    lines.push(
      "",
      `Indique la referencia ${input.reference} en la glosa o motivo del pago: es lo que nos permite identificar su pago.`,
    );
  }

  lines.push(
    "",
    "Si ya realizó el pago, responda a este correo con el comprobante y lo verificaremos.",
    "",
    ...input.footerLines,
  );

  return lines.join("\n");
}
