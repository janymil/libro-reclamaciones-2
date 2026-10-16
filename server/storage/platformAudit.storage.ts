import { desc } from "drizzle-orm";

import {
  platformConfigAudit,
  type InsertPlatformConfigAudit,
  type PlatformConfigAudit,
} from "@shared/schema";

import { db } from "../db";

/**
 * The console's change history (Phase 2.7, step 4).
 *
 * Append-only by design: nothing here is updated or deleted, because the point of
 * the table is that a questionable change ("why is the plan free for this customer?",
 * "who raised the price?") can still be answered months later.
 *
 * Writes never throw at the caller: failing to record an audit line must not undo a
 * change the operator already made. It is logged loudly instead.
 */
export const platformAuditStorage = {
  async recordPlatformConfigChange(data: InsertPlatformConfigAudit): Promise<void> {
    try {
      await db.insert(platformConfigAudit).values(data);
    } catch (error) {
      // The change itself already happened (or will): never fail the request for the
      // audit line, but make the gap visible in the logs.
      console.error('[console] no se pudo registrar el cambio en el historial:', error);
    }
  },

  async listPlatformConfigChanges(limit = 50): Promise<PlatformConfigAudit[]> {
    return await db
      .select()
      .from(platformConfigAudit)
      .orderBy(desc(platformConfigAudit.createdAt))
      .limit(limit);
  },
};
