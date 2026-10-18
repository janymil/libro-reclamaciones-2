import type { IStorage } from "./storage/types";
import { userStorage } from "./storage/user.storage";
import { authStorage } from "./storage/auth.storage";
import { libroStorage } from "./storage/libro.storage";
import { businessStorage } from "./storage/business.storage";
import { establishmentStorage } from "./storage/establishment.storage";
import { complaintStorage } from "./storage/complaint.storage";
import { attachmentStorage } from "./storage/attachment.storage";
import { accessStorage } from "./storage/access.storage";
import { integrationStorage } from "./storage/integration.storage";
import { paymentStorage } from "./storage/payment.storage";
import { comprobanteStorage } from "./storage/comprobante.storage";
import { paymentSettingsStorage } from "./storage/paymentSettings.storage";
import { platformSettingsStorage } from "./storage/platformSettings.storage";
import { planPricingStorage } from "./storage/planPricing.storage";
import { discountStorage } from "./storage/discount.storage";
import { platformAuditStorage } from "./storage/platformAudit.storage";
import { arcoStorage } from "./storage/arco.storage";
import { complianceStorage } from "./storage/compliance.storage";
import { notificationStorage } from "./storage/notification.storage";
import { reportingStorage } from "./storage/reporting.storage";
import { bookStorage } from "./storage/book.storage";
import { historyStorage } from "./storage/history.storage";
import { onboardingStorage } from "./storage/onboarding.storage";
import { accessRequestStorage } from "./storage/accessRequest.storage";
import { purgeStorage } from "./storage/purge.storage";
import { aiStorage } from "./storage/ai.storage";

export * from "./storage/types";

/**
 * The single data access entry point.
 *
 * Implemented as one module per aggregate under `server/storage/` and composed
 * here, so `IStorage` stays the one contract the rest of the server depends on
 * while the 128 method implementations can be navigated per aggregate.
 */
export const storage: IStorage = {
  ...userStorage,
  ...authStorage,
  ...libroStorage,
  ...businessStorage,
  ...establishmentStorage,
  ...complaintStorage,
  ...attachmentStorage,
  ...accessStorage,
  ...integrationStorage,
  ...paymentStorage,
  ...comprobanteStorage,
  ...paymentSettingsStorage,
  ...platformSettingsStorage,
  ...planPricingStorage,
  ...discountStorage,
  ...platformAuditStorage,

  ...arcoStorage,
  ...complianceStorage,
  ...notificationStorage,
  ...reportingStorage,
  ...bookStorage,
  ...historyStorage,
  ...onboardingStorage,
  ...accessRequestStorage,
  ...purgeStorage,
  ...aiStorage,
};

export type DatabaseStorage = typeof storage;
