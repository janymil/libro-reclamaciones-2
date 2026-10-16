import { eq } from "drizzle-orm";

import {
  platformPaymentSettings,
  type PlatformPaymentSettings,
} from "@shared/schema";

import { db } from "../db";

/**
 * The platform's own collection details (Phase 2.7, step 3).
 *
 * A singleton: exactly one row, always `id = 1`, so "which account do we tell the
 * customer about?" has a single answer and the console never has to pick between
 * rows. `save` is therefore an upsert, not an insert - the first operator to open
 * Configuración creates the row and everyone after them updates it.
 *
 * Template-free by design: the shape of what is stored (what counts as a usable
 * bank account, how the text is built) lives in `@shared/payment-details`, and
 * this module only moves bytes.
 */

/** The one and only row. Exported for tests and for the upsert target. */
export const PLATFORM_PAYMENT_SETTINGS_ID = 1;

/** What a caller may write. The id, the timestamps and the audit column are ours. */
export type PlatformPaymentSettingsInput = Partial<
  Omit<PlatformPaymentSettings, "id" | "createdAt" | "updatedAt" | "updatedByUserId">
>;

export const paymentSettingsStorage = {
  /**
   * The stored details, or `undefined` before anybody has configured them.
   *
   * `undefined` is a normal answer, not an error: the instructions then fall back
   * to `PAYMENTS_MANUAL_INSTRUCTIONS`, and failing that to the generic "ask us for
   * the payment data" text.
   */
  async getPlatformPaymentSettings(): Promise<PlatformPaymentSettings | undefined> {
    const [row] = await db
      .select()
      .from(platformPaymentSettings)
      .where(eq(platformPaymentSettings.id, PLATFORM_PAYMENT_SETTINGS_ID));
    return row;
  },

  /** Creates the row the first time an operator saves, updates it afterwards. */
  async savePlatformPaymentSettings(
    data: PlatformPaymentSettingsInput,
    updatedByUserId?: string | null,
  ): Promise<PlatformPaymentSettings> {
    const [row] = await db
      .insert(platformPaymentSettings)
      .values({
        id: PLATFORM_PAYMENT_SETTINGS_ID,
        ...data,
        updatedByUserId: updatedByUserId ?? null,
      })
      .onConflictDoUpdate({
        target: platformPaymentSettings.id,
        set: { ...data, updatedByUserId: updatedByUserId ?? null, updatedAt: new Date() },
      })
      .returning();
    return row;
  },
};
