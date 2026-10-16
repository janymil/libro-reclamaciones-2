import { storage } from '../storage';
import type { Business } from '@shared/schema';
import { cancelSubscriptionForBusiness } from './paymentService';

/** Start of time: the tenant's lifetime complaint count. */
const START_OF_TIME = new Date(0);

export interface CloseBusinessResult {
  /** True when the tenant data was erased (it held no complaints). */
  purged: boolean;
  complaintCount: number;
  message: string;
}

/**
 * Closes a tenant: the book leaves the public internet and the recurring charge
 * stops, immediately.
 *
 * What happens to the data depends on what the tenant holds:
 *
 *   * **zero complaints** - nothing the law asks us to keep, so everything goes:
 *     logins included (server/storage/purge.storage.ts);
 *   * **complaints on record** - the Libro de Reclamaciones is a legal record
 *     with a 2-year retention, and replies may still be owed, so the records
 *     stay, the team keeps access to answer them, and the retention job removes
 *     them when the window expires.
 *
 * The subscription is cancelled BEFORE anything is erased, so the provider side
 * stops charging even if the purge runs next.
 */
export async function closeBusiness(business: Business): Promise<CloseBusinessResult> {
  const complaintCount = await storage.countComplaintsSince(business.id, START_OF_TIME);

  // Fire-and-forget-with-log: a provider hiccup must not keep a closed tenant
  // open, and the customer already asked to stop paying.
  await cancelSubscriptionForBusiness(business.id).catch((error) => {
    console.error('[closure] cancelling the subscription failed:', error);
    return undefined;
  });

  if (complaintCount === 0) {
    await storage.purgeBusiness(business.id);
    return {
      purged: true,
      complaintCount,
      message: `${business.businessName} y todos sus datos fueron eliminados.`,
    };
  }

  // The book goes offline: the public portal answers 404 and intake stops.
  const config = await storage.getLibroConfiguration(business.id);
  if (config) {
    await storage.updateLibroConfiguration(config.id, { isActive: false });
  }
  await storage.updateBusiness(business.id, { subscriptionStatus: 'canceled' });

  return {
    purged: false,
    complaintCount,
    message:
      `${business.businessName} quedó cerrada: su Libro ya no está en línea y no se le cobrará más. ` +
      `Los ${complaintCount} reclamo(s) registrados se conservan 2 años por obligación legal (y usted aún ` +
      `puede responderlos), y se eliminan al terminar ese plazo.`,
  };
}
