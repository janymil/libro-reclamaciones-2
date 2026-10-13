import type { User } from "@shared/schema";
import { storage } from "../storage";

/**
 * The set of businesses a login may manage: its active tenant plus every
 * multi-RUC grant (user_business_access).
 *
 * This is THE trusted tenant context for administrative operations. Client
 * supplied business ids are only ever accepted after being checked against
 * this set - never the other way around.
 *
 * Public demo accounts are pinned to their own tenant: their credentials are
 * published to anyone who visits the marketing site, so a stray or
 * misconfigured `user_business_access` row must never widen what an anonymous
 * visitor can list (this is the exact "demo account sees every company's
 * users" regression).
 */
export async function getManageableBusinessIds(
  user: Pick<User, "id" | "businessId" | "isDemo">,
): Promise<Set<string>> {
  if (user.isDemo) {
    return new Set(user.businessId ? [user.businessId] : []);
  }

  const access = await storage.getUserBusinessAccess(user.id);
  const allowed = new Set(access.map((entry) => entry.businessId));
  if (user.businessId) {
    allowed.add(user.businessId);
  }
  return allowed;
}

