import type { InsertPlatformConfigAudit, PlatformConfigAudit } from "@shared/schema";

import { storage } from "../storage";

/**
 * The console's change history (Phase 2.7, step 4).
 *
 * Every write from the operator console goes through here, because two of the things
 * the console can change are dangerous (a price, and the flag that activates a plan
 * without money) and because "who typed that Yape number?" is a real support
 * question that a log file cannot answer once it has rotated.
 *
 * Recording never throws: an audit line that cannot be written must not undo a change
 * the operator already made - it is logged loudly instead (see the storage module).
 */

/** Who made the change. The e-mail is stored with the row: users can be deleted. */
export interface ConsoleActor {
  userId: string;
  email: string | null;
}

/** The areas the console writes to, so the history can be filtered and read. */
export type ConfigArea =
  | 'pago'
  | 'identidad'
  | 'planes'
  | 'descuentos'
  | 'operacion'
  | 'equipo';

export const CONFIG_AREA_LABELS: Record<ConfigArea, string> = {
  pago: 'Datos de pago',
  identidad: 'Identidad',
  planes: 'Planes y precios',
  descuentos: 'Descuentos',
  operacion: 'Operación',
  equipo: 'Equipo',
};

export async function recordPlatformChange(
  actor: ConsoleActor,
  area: ConfigArea,
  summary: string,
  details?: Record<string, unknown>,
): Promise<void> {
  const row: InsertPlatformConfigAudit = {
    userId: actor.userId,
    email: actor.email,
    area,
    summary,
    details: details ?? null,
  };
  await storage.recordPlatformConfigChange(row);
}

/** The most recent changes, newest first: what the console shows. */
export async function listPlatformChanges(limit = 50): Promise<PlatformConfigAudit[]> {
  return await storage.listPlatformConfigChanges(Math.min(Math.max(limit, 1), 200));
}
