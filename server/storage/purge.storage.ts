import { db } from "../db";
import { eq, inArray } from "drizzle-orm";
import {
  apiKeys,
  arcoRequests,
  books,
  businessAccessRequests,
  businesses,
  complaintAttachments,
  complaintAuditLog,
  complaints,
  complianceTracking,
  dataProcessingActivities,
  establishments,
  libroConfiguration,
  notifications,
  userBusinessAccess,
  users,
  webhooks,
} from "@shared/schema";

/**
 * Permanent deletion of a tenant.
 *
 * "Eliminar mi empresa" is a real request (a customer who abandons the app) and
 * the honest answer depends on what the tenant holds:
 *
 *   * nothing legal to keep (zero complaints) -> erase everything, here;
 *   * complaints on record -> the Libro de Reclamaciones is a legal record the
 *     provider must keep for 2 years (the retention the landing page promises),
 *     so the tenant is *closed* instead (see closes/`POST
 *     /api/businesses/:id/close`) and purged when that window expires. The
 *     route decides; this module only erases.
 *
 * Two families are deliberately NOT touched, and they are the only ones:
 *   * `payments` / `subscriptions` - accounting and the provider agreement that
 *     charged the customer. Deleting them would rewrite the books.
 *   * `auth_audit_log` / `login_attempts` - the security trail (who logged in
 *     from where). It is keyed by email, holds no consumer data, and is what
 *     makes an abuse investigation possible after the account is gone.
 *
 * Everything else that carries a `business_id` goes, so no orphan row can make
 * the app show a tenant that no longer exists.
 */
export const purgeStorage = {
  async purgeBusiness(businessId: string): Promise<void> {
    await db.transaction(async (tx) => {
      // Logins of the tenant: their grants first, then the rows themselves.
      const members = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.businessId, businessId));

      const memberIds = members.map((member) => member.id);
      if (memberIds.length > 0) {
        await tx.delete(userBusinessAccess).where(inArray(userBusinessAccess.userId, memberIds));
      }
      await tx.delete(userBusinessAccess).where(eq(userBusinessAccess.businessId, businessId));

      await tx.delete(businessAccessRequests).where(eq(businessAccessRequests.businessId, businessId));
      await tx.delete(apiKeys).where(eq(apiKeys.businessId, businessId));
      await tx.delete(webhooks).where(eq(webhooks.businessId, businessId));
      await tx.delete(notifications).where(eq(notifications.businessId, businessId));

      // Complaints (empty by the caller's guard), their evidence and their trail.
      const tenantComplaints = await tx
        .select({ id: complaints.id })
        .from(complaints)
        .where(eq(complaints.businessId, businessId));

      const complaintIds = tenantComplaints.map((complaint) => complaint.id);
      if (complaintIds.length > 0) {
        await tx.delete(complaintAttachments).where(inArray(complaintAttachments.complaintId, complaintIds));
        await tx.delete(complaintAuditLog).where(inArray(complaintAuditLog.complaintId, complaintIds));
      }
      await tx.delete(complaints).where(eq(complaints.businessId, businessId));

      // Compliance bookkeeping tied to the tenant.
      await tx.delete(arcoRequests).where(eq(arcoRequests.businessId, businessId));
      await tx.delete(complianceTracking).where(eq(complianceTracking.businessId, businessId));
      await tx.delete(dataProcessingActivities).where(eq(dataProcessingActivities.businessId, businessId));

      // The book itself.
      await tx.delete(establishments).where(eq(establishments.businessId, businessId));
      await tx.delete(books).where(eq(books.businessId, businessId));
      await tx.delete(libroConfiguration).where(eq(libroConfiguration.businessId, businessId));

      await tx.delete(users).where(eq(users.businessId, businessId));
      await tx.delete(businesses).where(eq(businesses.id, businessId));
    });
  },

  /**
   * Removes one login for good: its business grants and the account row.
   *
   * Used by "Eliminar usuario" and by "Eliminar mi cuenta". Complaint records
   * never reference the row by constraint, so history survives; an assignment
   * left behind simply reads as unassigned.
   */
  async deleteUserAccount(userId: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(userBusinessAccess).where(eq(userBusinessAccess.userId, userId));
      await tx.delete(users).where(eq(users.id, userId));
    });
  },
};
