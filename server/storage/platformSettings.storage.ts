import { eq } from "drizzle-orm";

import { platformSettings, type PlatformSettings } from "@shared/schema";

import { db } from "../db";

/**
 * Operational settings of the platform (singleton, `id = 1`).
 *
 * Companion to `paymentSettings.storage.ts`: that one holds *where customers pay*,
 * this one holds *how the platform behaves and who it is* (alerts, identity, trial
 * length, the free-plan-change flag). Same shape of access: one row, upserted, never
 * listed.
 */

/** The one and only row. Exported for tests and for the upsert target. */
export const PLATFORM_SETTINGS_ID = 1;

/** What a caller may write; id, timestamps and the actor are ours. */
export type PlatformSettingsInput = Partial<
  Omit<PlatformSettings, "id" | "createdAt" | "updatedAt" | "updatedByUserId">
>;

export const platformSettingsStorage = {
  async getPlatformSettings(): Promise<PlatformSettings | undefined> {
    const [row] = await db
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.id, PLATFORM_SETTINGS_ID));
    return row;
  },

  /** Creates the row the first time an operator saves, updates it afterwards. */
  async savePlatformSettings(
    data: PlatformSettingsInput,
    updatedByUserId?: string | null,
  ): Promise<PlatformSettings> {
    const [row] = await db
      .insert(platformSettings)
      .values({
        id: PLATFORM_SETTINGS_ID,
        ...data,
        updatedByUserId: updatedByUserId ?? null,
      })
      .onConflictDoUpdate({
        target: platformSettings.id,
        set: { ...data, updatedByUserId: updatedByUserId ?? null, updatedAt: new Date() },
      })
      .returning();
    return row;
  },
};
