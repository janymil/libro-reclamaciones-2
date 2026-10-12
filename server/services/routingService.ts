import { and, count, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "../db";
import { complaints, users } from "@shared/schema";
import type { Complaint } from "@shared/schema";

/**
 * Auto-assignment / routing by complaint category.
 *
 * Assigns a new complaint to the active non-viewer user of the business with
 * the fewest open complaints (load balancing). Ties are broken by a stable
 * hash of "category:userId", so each category consistently routes to the same
 * person - a virtual queue per category - without requiring per-user
 * specialty configuration.
 */

function stableHash(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export interface RoutingResult {
  userId: string;
  userName: string;
}

export const routingService = {
  /**
   * Picks the assignee for a complaint given its (AI or heuristic) category.
   * Returns null when the business has no active assignable users, in which
   * case the complaint stays unassigned for an admin to pick up.
   */
  async autoAssign(complaint: Complaint, category: string): Promise<RoutingResult | null> {
    const staff = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
      })
      .from(users)
      .where(and(eq(users.businessId, complaint.businessId), eq(users.isActive, true)));

    const assignable = staff.filter((user) => user.role !== 'viewer');
    if (assignable.length === 0) {
      return null;
    }

    const openCounts = await db
      .select({ userId: complaints.assignedToUserId, openCount: count() })
      .from(complaints)
      .where(
        and(
          eq(complaints.businessId, complaint.businessId),
          inArray(complaints.status, ['new', 'in_progress']),
          isNotNull(complaints.assignedToUserId)
        )
      )
      .groupBy(complaints.assignedToUserId);

    const load = new Map<string, number>();
    for (const row of openCounts) {
      if (row.userId) {
        load.set(row.userId, Number(row.openCount));
      }
    }

    const ranked = assignable
      .map((user) => ({
        user,
        openLoad: load.get(user.id) ?? 0,
        tieBreak: stableHash(`${category}:${user.id}`),
      }))
      .sort((a, b) => a.openLoad - b.openLoad || a.tieBreak - b.tieBreak);

    const chosen = ranked[0].user;
    return {
      userId: chosen.id,
      userName: [chosen.firstName, chosen.lastName].filter(Boolean).join(' ') || 'usuario',
    };
  },
};
