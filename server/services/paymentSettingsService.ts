import {
  hasPaymentDetails,
  normalizePaymentDetails,
  type PaymentCollectionDetails,
} from "@shared/payment-details";

import { storage } from "../storage";
import type { PlatformPaymentSettingsInput } from "../storage/paymentSettings.storage";

/**
 * The platform's own collection details (Phase 2.7, step 3).
 *
 * Sits between three places that must agree: the console (Configuración), the
 * singleton row in `platform_payment_settings`, and the checkout that tells a
 * customer where to send the money.
 *
 * The one rule worth stating: a half-filled record is treated as no record. A
 * holder name with no Yape number and no account number cannot be paid, so
 * `readTransferDetails` answers `undefined` and the gateway falls back to
 * `PAYMENTS_MANUAL_INSTRUCTIONS` - the honest "ask us" path - instead of printing
 * an instruction nobody can follow.
 */

/** Everything the console needs, in the shape the form and the preview use. */
export interface PaymentSettingsView {
  settings: PaymentCollectionDetails;
  /** True when these details can actually be paid (see `hasPaymentDetails`). */
  hasDetails: boolean;
  /** True when the row exists at all: distinguishes "never saved" from "saved empty". */
  saved: boolean;
  updatedAt: string | null;
  /** E-mail of the operator who saved it last, when they still exist. */
  updatedByEmail: string | null;
}

/**
 * The stored details, or `undefined` when nothing usable is configured.
 *
 * Fail-safe on purpose: if the settings table cannot be read (a deployment that
 * has not run `migrations/0008_platform_payment_settings.sql` yet, a transient
 * database error), a CUSTOMER must still be able to pay. We log it and answer
 * `undefined`, which makes the gateway fall back to
 * `PAYMENTS_MANUAL_INSTRUCTIONS`. The console screens are not as forgiving - they
 * surface the error - so the operator finds out.
 */
export async function readTransferDetails(): Promise<PaymentCollectionDetails | undefined> {
  let row: Awaited<ReturnType<typeof storage.getPlatformPaymentSettings>>;
  try {
    row = await storage.getPlatformPaymentSettings();
  } catch (error) {
    console.error(
      '[payments] no se pudo leer platform_payment_settings (¿migración 0008 sin aplicar?). ' +
        'Se usa PAYMENTS_MANUAL_INSTRUCTIONS como respaldo.',
      error,
    );
    return undefined;
  }

  if (!row) {
    return undefined;
  }

  const details = normalizePaymentDetails(row);
  return hasPaymentDetails(details) ? details : undefined;
}

/**
 * The console's view of the settings.
 *
 * Reads the row with its audit trail (who changed it and when) because that is
 * what makes a wrong number traceable: "the Yape number is wrong" is answerable
 * only if the console says who typed it and when.
 */
export async function readPaymentSettings(): Promise<PaymentSettingsView> {
  const row = await storage.getPlatformPaymentSettings();
  const details = normalizePaymentDetails(row);

  let updatedByEmail: string | null = null;
  if (row?.updatedByUserId) {
    const operator = await storage.getUser(row.updatedByUserId).catch(() => undefined);
    updatedByEmail = operator?.email ?? null;
  }

  return {
    settings: details,
    hasDetails: hasPaymentDetails(details),
    saved: Boolean(row),
    updatedAt: row ? row.updatedAt.toISOString() : null,
    updatedByEmail,
  };
}

/** Writes the row and answers with what was actually stored (normalized). */
export async function savePaymentSettings(
  input: PlatformPaymentSettingsInput,
  updatedByUserId: string,
): Promise<PaymentSettingsView> {
  await storage.savePlatformPaymentSettings(input, updatedByUserId);
  return readPaymentSettings();
}

/**
 * Whether the environment variable carries a usable fallback text.
 *
 * Kept next to the service because the console reports it: an operator who has not
 * configured anything yet should know that customers still read *something*
 * (the env text) rather than the generic "ask us for the payment data".
 */
export function envFallbackConfigured(): boolean {
  return Boolean((process.env.PAYMENTS_MANUAL_INSTRUCTIONS ?? "").trim());
}

/** True when the customer would currently see nothing but "ask us". */
export function isUnconfigured(view: PaymentSettingsView): boolean {
  return !view.hasDetails && !envFallbackConfigured();
}
