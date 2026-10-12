import type { IStorage } from "./storage/types";
import { userStorage } from "./storage/user.storage";
import { authStorage } from "./storage/auth.storage";
import { libroStorage } from "./storage/libro.storage";
import { businessStorage } from "./storage/business.storage";
import { establishmentStorage } from "./storage/establishment.storage";
import { complaintStorage } from "./storage/complaint.storage";
import { arcoStorage } from "./storage/arco.storage";
import { complianceStorage } from "./storage/compliance.storage";
import { notificationStorage } from "./storage/notification.storage";
import { reportingStorage } from "./storage/reporting.storage";
import { bookStorage } from "./storage/book.storage";
import { historyStorage } from "./storage/history.storage";

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
  ...arcoStorage,
  ...complianceStorage,
  ...notificationStorage,
  ...reportingStorage,
  ...bookStorage,
  ...historyStorage,
};

export type DatabaseStorage = typeof storage;
