import { storage } from '../storage';

/**
 * Mailbox-verification policy for tenants.
 *
 * A complaint is a legal notice that arrives by email, so the address that
 * receives it is not cosmetic: an unconfirmed (or mistyped) inbox means the
 * company can be notified into the void while the consumer's 15-business-day
 * clock keeps running. The rule is therefore:
 *
 *   a business publishes its Libro de Reclamaciones only once at least one
 *   ACTIVE ADMINISTRATOR of that tenant has confirmed their mailbox.
 *
 * Enforced in two places:
 *   * `POST /api/auth/complete-onboarding` - a company/libro cannot be created
 *     from an unverified account (the requirement at signup), and
 *   * `POST /api/public/complaints` - the public book refuses consumer
 *     submissions while no administrator is verified. That second check is also
 *     what covers tenants created before the rule existed.
 *
 * `ALLOW_UNVERIFIED_BUSINESSES=true` turns both checks off, for a legacy tenant
 * whose book is already live: turning the policy on must never take a running
 * Libro offline. The shared demo tenant is always published (its credentials are
 * public and its inbox is ours). Documented in RUNBOOK.md.
 */
export function allowsUnverifiedBusinesses(): boolean {
  return process.env.ALLOW_UNVERIFIED_BUSINESSES === 'true';
}

/** Whether the tenant may receive complaints from consumers. */
export async function isBusinessPublished(businessId: string): Promise<boolean> {
  if (allowsUnverifiedBusinesses()) {
    return true;
  }

  const members = await storage.getUsersByBusinessIds([businessId]);

  // The shared demo tenant is published by definition: its credentials are
  // public (nobody can confirm them), and the inbox it notifies is maintained by
  // us. Real tenants never hold a demo member.
  if (members.some((user) => user.isDemo)) {
    return true;
  }

  return members.some(
    (user) => user.role === 'admin' && user.isActive && user.isEmailVerified,
  );
}
