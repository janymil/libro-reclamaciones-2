import type {
  User,
  InsertUser,
  Business,
  InsertBusiness,
  Establishment,
  InsertEstablishment,
  Book,
  InsertBook,
  Complaint,
  InsertComplaint,
  ComplaintAuditLog,
  ComplaintAttachment,
  ArcoRequest,
  InsertArcoRequest,
  ComplianceTracking,
  InsertComplianceTracking,
  DataProcessingActivity,
  InsertDataProcessingActivity,
  Notification,
  InsertNotification,
  LoginAttempt,
  InsertLoginAttempt,
  AuthAuditLog,
  InsertAuthAuditLog,
  LibroConfiguration,
  InsertLibroConfiguration,
  UserBusinessAccess,
  InsertUserBusinessAccess,
  BusinessAccessRequest,
  InsertBusinessAccessRequest,
  ApiKeyPublic,
  Webhook,
  InsertWebhook,
  WebhookDelivery,
  Payment,
  InsertPayment,
  Subscription,
  InsertSubscription,
  Comprobante,
  InsertComprobante,
  PlatformPaymentSettings,
  PlatformSettings,
  PlanPricing,
  DiscountCode,
  InsertDiscountCode,
  PlatformConfigAudit,
  InsertPlatformConfigAudit,
  AIUsage,
  InsertAIUsage,
  AIFeedback,
  InsertAIFeedback,
} from "@shared/schema";
import type { RnpdDeclaration } from "@shared/rnpd";
import type {
  CompleteOnboardingInput,
  CompleteOnboardingResult,
} from "./onboarding.storage";
import type { AccessRequestWithBusiness } from "./accessRequest.storage";
import type { PlatformPaymentSettingsInput } from "./paymentSettings.storage";
import type { ComprobanteWithBusiness } from "./comprobante.storage";
import type { PlatformSettingsInput } from "./platformSettings.storage";
import type { PlanPricingInput } from "./planPricing.storage";
import type { MonthlyReport } from "@shared/monthly-reports";



// Application version reported alongside the derived system-change entries.
export const APP_VERSION = "1.2.0";

export interface AIUsageSummary {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  byFeature: Array<{
    feature: string;
    calls: number;
    totalTokens: number;
    estimatedCostUsd: number;
  }>;
}

export interface AIFeedbackSummary {
  total: number;
  positive: number;
  negative: number;
  /** positive / (positive + negative); null when there is no feedback yet. */
  acceptanceRate: number | null;
  byFeature: Array<{
    feature: string;
    total: number;
    positive: number;
    negative: number;
  }>;
}

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser & { password: string }): Promise<User>;
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User>;
  
  // Auth security operations
  incrementFailedLoginAttempts(userId: string): Promise<void>;
  resetFailedLoginAttempts(userId: string): Promise<void>;
  lockUserAccount(userId: string, lockUntil: Date): Promise<void>;
  updateLastLogin(userId: string): Promise<void>;
  setPasswordResetToken(email: string, token: string, expires: Date): Promise<void>;
  /** Resolves the account owning a non-expired reset token (or undefined). */
  getUserByPasswordResetToken(token: string): Promise<User | undefined>;
  /**
   * Atomically sets the new password hash and clears the reset token, its
   * expiry and any lockout — so the token can never be replayed.
   */
  completePasswordReset(userId: string, hashedPassword: string): Promise<void>;
  getFailedLoginAttempts(email: string, ipAddress: string, since: Date): Promise<number>;

  // Email verification: confirms the mailbox that receives every notification.
  setEmailVerificationToken(userId: string, token: string, expires: Date): Promise<void>;
  getUserByEmailVerificationToken(token: string): Promise<User | undefined>;
  completeEmailVerification(userId: string): Promise<void>;

  // One-time login code (email + code sign-in)
  setLoginCode(userId: string, codeHash: string, expires: Date): Promise<void>;
  clearLoginCode(userId: string): Promise<void>;
  /** Counts a wrong code and returns the new total for that code. */
  registerFailedLoginCodeAttempt(userId: string): Promise<number>;

  // Irreversible deletion ("abandon the app")
  /** Removes one login: its business grants and the account row. */
  deleteUserAccount(userId: string): Promise<void>;
  /** Erases a tenant and its logins. Caller must have checked it holds no records. */
  purgeBusiness(businessId: string): Promise<void>;
  
  // Auth audit logging
  createAuthAuditLog(auditLog: InsertAuthAuditLog): Promise<AuthAuditLog>;
  createLoginAttempt(loginAttempt: InsertLoginAttempt): Promise<LoginAttempt>;
  
  // Libro configuration for onboarding step 2
  createLibroConfiguration(config: InsertLibroConfiguration): Promise<LibroConfiguration>;
  getLibroConfiguration(businessId: string): Promise<LibroConfiguration | undefined>;
  getLibroConfigurationBySlug(slug: string): Promise<LibroConfiguration | undefined>;
  /** Active configurations across tenants: the WhatsApp webhook resolves the sender number with this. */
  getActiveLibroConfigurations(): Promise<LibroConfiguration[]>;
  updateLibroConfiguration(id: string, updates: Partial<InsertLibroConfiguration>): Promise<LibroConfiguration>;

  /**
   * Commits the whole of onboarding (tenant + libro + first establishment + the
   * user link) in one transaction, and can resume a tenant created by an earlier
   * failed attempt. See `server/storage/onboarding.storage.ts`.
   */
  completeOnboarding(input: CompleteOnboardingInput): Promise<CompleteOnboardingResult>;
  
  // Business operations
  getBusiness(id: string): Promise<Business | undefined>;
  getBusinessByRuc(ruc: string): Promise<Business | undefined>;
  createBusiness(business: InsertBusiness): Promise<Business>;
  updateBusiness(id: string, updates: Partial<InsertBusiness>): Promise<Business>;
  
  // Establishment operations
  getEstablishment(id: string): Promise<Establishment | undefined>;
  /** Active establishments only: public portal, quotas, DS compliance. */
  getEstablishmentsByBusiness(businessId: string): Promise<Establishment[]>;
  /** Every establishment, inactive included: the admin list must show them to reactivate. */
  getAllEstablishmentsByBusiness(businessId: string): Promise<Establishment[]>;
  createEstablishment(establishment: InsertEstablishment): Promise<Establishment>;
  /**
   * Sucursal + the Libro de Reclamaciones it needs, committed together so a
   * failure never leaves a book-less sucursal. See
   * `server/storage/establishment.storage.ts`.
   */
  createEstablishmentWithBook(
    establishment: InsertEstablishment,
  ): Promise<{ establishment: Establishment; book: Book }>;
  updateEstablishment(id: string, updates: Partial<InsertEstablishment>): Promise<Establishment>;
  
  // Complaint operations
  getComplaint(id: string): Promise<Complaint | undefined>;
  findComplaintByCorrelative(businessId: string, correlativeNumber: string, documentNumber: string): Promise<Complaint | undefined>;
  getComplaintsByBusiness(businessId: string, filters?: ComplaintFilters): Promise<Complaint[]>;
  /**
   * SQL-level page of complaints plus the total for the filtered set.
   *
   * The public API used to load every complaint of the tenant and slice the
   * array in memory, which stops scaling at a few thousand records. This keeps
   * the LIMIT/OFFSET in PostgreSQL.
   */
  getComplaintsPage(
    businessId: string,
    filters: ComplaintFilters | undefined,
    limit: number,
    offset: number,
  ): Promise<{ items: Complaint[]; total: number }>;
  getComplaintsByEstablishment(establishmentId: string): Promise<Complaint[]>;
  /** Tenant-scoped uniqueness probe for the legal correlative number. */
  complaintCorrelativeExists(businessId: string, correlativeNumber: string): Promise<boolean>;
  createComplaint(complaint: InsertComplaint): Promise<Complaint>;
  updateComplaint(id: string, updates: Partial<InsertComplaint>): Promise<Complaint>;
  getComplaintStats(businessId: string): Promise<ComplaintStats>;
  getOverdueComplaints(businessId: string): Promise<Complaint[]>;
  
  // Audit log operations
  createAuditLog(auditLog: Omit<ComplaintAuditLog, 'id' | 'createdAt'>): Promise<ComplaintAuditLog>;
  getAuditLogsByComplaint(complaintId: string): Promise<ComplaintAuditLog[]>;

  // Attachment operations (evidence files, Phase 1.1)
  createAttachment(data: Omit<ComplaintAttachment, 'id' | 'uploadedAt' | 'deletedAt'>): Promise<ComplaintAttachment>;
  getAttachment(id: string): Promise<ComplaintAttachment | undefined>;
  getAttachmentsByComplaint(complaintId: string): Promise<ComplaintAttachment[]>;
  countAttachmentsByComplaint(complaintId: string): Promise<number>;
  softDeleteAttachment(id: string): Promise<ComplaintAttachment | undefined>;
  findAttachmentComplaintIdsOlderThan(cutoff: Date): Promise<string[]>;

  // Complaint extras: quota usage, retention and reincidence
  countComplaintsSince(businessId: string, since: Date): Promise<number>;
  findComplaintsOlderThan(cutoff: Date, limit?: number): Promise<Complaint[]>;
  anonymizeComplaint(id: string): Promise<Complaint | undefined>;
  getReincidenceReport(businessId: string): Promise<ReincidenceReport>;

  // Multi-RUC access (Phase 2.7)
  grantBusinessAccess(access: InsertUserBusinessAccess): Promise<UserBusinessAccess>;
  getUserBusinessAccess(userId: string): Promise<Array<UserBusinessAccess & { businessName: string; ruc: string }>>;
  hasBusinessAccess(userId: string, businessId: string): Promise<boolean>;

  // API keys (Phase 3.12)
  createApiKey(data: { businessId: string; name: string; keyPrefix: string; keyHash: string }): Promise<ApiKeyPublic>;
  getApiKeysByBusiness(businessId: string): Promise<ApiKeyPublic[]>;
  getApiKeyByKeyHash(keyHash: string): Promise<ApiKeyPublic & { businessId: string } | undefined>;
  markApiKeyUsed(id: string): Promise<void>;
  revokeApiKey(id: string, businessId: string): Promise<ApiKeyPublic | undefined>;
  /** Replaces the secret of an existing key in place (old key stops working). */
  rotateApiKey(
    id: string,
    businessId: string,
    data: { keyPrefix: string; keyHash: string },
  ): Promise<ApiKeyPublic | undefined>;

  // AI usage meter + draft feedback (append-only)
  recordAIUsage(data: InsertAIUsage): Promise<AIUsage>;
  getAIUsageSummary(businessId: string, since: Date): Promise<AIUsageSummary>;
  createAIFeedback(data: InsertAIFeedback): Promise<AIFeedback>;
  getAIFeedbackSummary(businessId: string, since: Date): Promise<AIFeedbackSummary>;

  // Webhooks (Phase 3.12)
  createWebhook(data: InsertWebhook): Promise<Webhook>;
  getWebhook(id: string): Promise<Webhook | undefined>;
  getWebhooksByBusiness(businessId: string): Promise<Webhook[]>;
  getActiveWebhooks(businessId: string, event: string): Promise<Webhook[]>;
  updateWebhook(id: string, businessId: string, updates: Partial<InsertWebhook>): Promise<Webhook | undefined>;
  deleteWebhook(id: string, businessId: string): Promise<boolean>;

  // Webhook delivery queue / log (retries + dead-letter)
  createWebhookDeliveries(deliveries: Array<Pick<WebhookDelivery, 'businessId' | 'webhookId' | 'complaintId' | 'event'>>): Promise<WebhookDelivery[]>;
  releaseStaleWebhookDeliveries(staleBefore: Date): Promise<number>;
  claimDueWebhookDeliveries(limit: number, now: Date): Promise<WebhookDelivery[]>;
  markWebhookDelivered(id: string): Promise<void>;
  markWebhookFailed(
    id: string,
    data: { attempts: number; nextAttemptAt: Date; lastStatusCode: number | null; lastError: string },
  ): Promise<void>;
  markWebhookDead(id: string, data: { attempts: number; lastStatusCode: number | null; lastError: string }): Promise<void>;
  getWebhookDeliveriesByBusiness(businessId: string, limit: number): Promise<Array<WebhookDelivery & { url: string }>>;
  getWebhookDelivery(id: string): Promise<WebhookDelivery | undefined>;
  retryWebhookDelivery(id: string, businessId: string): Promise<WebhookDelivery | undefined>;

  // Payments (Phase 2.7)
  createPayment(data: InsertPayment): Promise<Payment>;
  getPayment(id: string): Promise<Payment | undefined>;
  getPaymentByReference(reference: string): Promise<Payment | undefined>;
  getPaymentByProviderRef(provider: string, providerRef: string): Promise<Payment | undefined>;
  getPaymentsByBusiness(businessId: string): Promise<Payment[]>;
  /** Operator work queue: pending transfers/Yape across every tenant. */
  listPendingManualPayments(): Promise<Payment[]>;
  /** Operator view: every payment of every tenant, newest first. */
  listAllPayments(limit?: number): Promise<Payment[]>;
  /** Operator view: every recurring agreement of every tenant. */
  listAllSubscriptions(limit?: number): Promise<Subscription[]>;
  updatePayment(id: string, updates: Partial<InsertPayment>): Promise<Payment | undefined>;

  // Comprobantes (Phase 1: emisión manual)
  createComprobante(data: InsertComprobante): Promise<Comprobante>;
  getComprobante(id: string): Promise<Comprobante | undefined>;
  getComprobanteByPaymentId(paymentId: string): Promise<Comprobante | undefined>;
  /** Duplicate guard: a correlativo cannot repeat inside a serie. */
  getComprobanteByNumber(
    docType: string,
    serie: string,
    number: string,
  ): Promise<Comprobante | undefined>;
  getComprobantesByBusiness(businessId: string): Promise<Comprobante[]>;
  /** Operator queue: every tenant's comprobantes, newest first. */
  listAllComprobantes(limit?: number): Promise<Comprobante[]>;
  /** Same list with the buyer's name/RUC, for the console table. */
  listAllComprobantesWithBusiness(limit?: number): Promise<ComprobanteWithBusiness[]>;
  updateComprobante(
    id: string,
    updates: Partial<InsertComprobante>,
  ): Promise<Comprobante | undefined>;
  /** Highest correlativo already used in a serie (0 when the serie is new). */
  maxComprobanteNumber(docType: string, serie: string): Promise<number>;
  countComprobantesByStatus(): Promise<Record<string, number>>;
  /** Paid charges with no comprobante row yet (backfill queue). */
  listPaymentsWithoutComprobante(limit?: number): Promise<Payment[]>;

  // Recurring agreements (Phase 2.7, step 2)
  createSubscription(data: InsertSubscription): Promise<Subscription>;
  getSubscription(id: string): Promise<Subscription | undefined>;
  getSubscriptionByProviderRef(provider: string, providerRef: string): Promise<Subscription | undefined>;
  getLatestSubscriptionByBusiness(businessId: string): Promise<Subscription | undefined>;
  getSubscriptionsByBusiness(businessId: string): Promise<Subscription[]>;
  getSubscriptionByReference(reference: string): Promise<Subscription | undefined>;
  updateSubscription(id: string, updates: Partial<InsertSubscription>): Promise<Subscription | undefined>;

  // Where the platform itself collects money (Phase 2.7, step 3)
  /** The singleton row with our own Yape number / bank accounts, if configured. */
  getPlatformPaymentSettings(): Promise<PlatformPaymentSettings | undefined>;
  /** Upserts that row (id = 1) and records which operator wrote it. */
  savePlatformPaymentSettings(
    data: PlatformPaymentSettingsInput,
    updatedByUserId?: string | null,
  ): Promise<PlatformPaymentSettings>;

  // Platform configuration (Phase 2.7, step 4): identity, alerts, flags
  /** The singleton row with the console's operational settings, if ever saved. */
  getPlatformSettings(): Promise<PlatformSettings | undefined>;
  savePlatformSettings(
    data: PlatformSettingsInput,
    updatedByUserId?: string | null,
  ): Promise<PlatformSettings>;

  // Price list (Phase 2.7, step 4)
  listPlanPricing(): Promise<PlanPricing[]>;
  getPlanPricing(planId: string): Promise<PlanPricing | undefined>;
  savePlanPricing(input: PlanPricingInput): Promise<PlanPricing>;
  /** Drops the override so the plan goes back to the catalogue price. */
  resetPlanPricing(planId: string): Promise<boolean>;

  // Discount codes (Phase 2.7, step 4)
  listDiscountCodes(limit?: number): Promise<DiscountCode[]>;
  getDiscountCode(id: string): Promise<DiscountCode | undefined>;
  getDiscountCodeByCode(code: string): Promise<DiscountCode | undefined>;
  createDiscountCode(data: InsertDiscountCode): Promise<DiscountCode>;
  updateDiscountCode(id: string, updates: Partial<InsertDiscountCode>): Promise<DiscountCode | undefined>;
  /** Only deletes a code that was never redeemed. */
  deleteDiscountCode(id: string): Promise<boolean>;
  /** Atomic increment, false when the cap is already reached. */
  redeemDiscountCode(id: string): Promise<boolean>;

  // Console audit (Phase 2.7, step 4)
  recordPlatformConfigChange(data: InsertPlatformConfigAudit): Promise<void>;
  listPlatformConfigChanges(limit?: number): Promise<PlatformConfigAudit[]>;

  
  // ARCO request operations
  getArcoRequests(businessId: string): Promise<ArcoRequest[]>;
  createArcoRequest(request: InsertArcoRequest): Promise<ArcoRequest>;
  updateArcoRequest(id: string, updates: Partial<InsertArcoRequest>): Promise<ArcoRequest>;
  
  // Compliance tracking operations
  getComplianceTracking(businessId: string): Promise<ComplianceTracking[]>;
  createComplianceTracking(tracking: InsertComplianceTracking): Promise<ComplianceTracking>;
  updateComplianceTracking(id: string, updates: Partial<InsertComplianceTracking>): Promise<ComplianceTracking>;
  /**
   * Upserts the business's declaration about the RNPD (SIPDP) inscription as a
   * `rnpd_registration` row. Declaring "not yet" stores `pending`, so the answer
   * is remembered (that is what makes it visible as pending instead of unknown).
   */
  setRnpdRegistration(
    businessId: string,
    declaration: RnpdDeclaration,
  ): Promise<ComplianceTracking>;
  
  // Data processing activities operations
  getDataProcessingActivities(businessId: string): Promise<DataProcessingActivity[]>;
  createDataProcessingActivity(activity: InsertDataProcessingActivity): Promise<DataProcessingActivity>;
  updateDataProcessingActivity(id: string, updates: Partial<InsertDataProcessingActivity>): Promise<DataProcessingActivity>;
  
  // Notification operations
  getNotifications(businessId: string, userId?: string): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: string, businessId: string): Promise<boolean>;
  
  // Analytics and reporting
  getDashboardMetrics(businessId: string): Promise<DashboardMetrics>;
  getReportStats(businessId: string): Promise<ReportStats>;
  getMonthlyReports(businessId: string): Promise<MonthlyReport[]>;

  // User administration
  /** INTERNAL use only - spans every tenant. Never return over HTTP. */
  getAllUsers(): Promise<UserWithBusiness[]>;
  /** Logins flagged as platform staff (`users.is_platform_admin`). */
  listPlatformAdmins(): Promise<User[]>;
  setPlatformAdmin(userId: string, isPlatformAdmin: boolean): Promise<User | undefined>;
  /** Tenant-scoped listing for HTTP handlers. */
  getUsersByBusinessIds(businessIds: string[]): Promise<UserWithBusiness[]>;
  getUserStats(userId: string): Promise<UserStats>;
  updateUserStatus(id: string, isActive: boolean): Promise<User>;
  updateUserProfile(id: string, data: UpdateUserProfileData): Promise<User>;
  changeUserPassword(id: string, currentPassword: string, newPassword: string): Promise<void>;

  // Business administration
  getAllBusinesses(): Promise<BusinessWithStats[]>;
  getBusinessById(id: string): Promise<Business | undefined>;

  // Business access requests (a login asking for access to an existing RUC)
  createAccessRequest(request: InsertBusinessAccessRequest): Promise<BusinessAccessRequest>;
  getAccessRequest(id: string): Promise<AccessRequestWithBusiness | undefined>;
  getPendingAccessRequest(businessId: string, requesterUserId: string): Promise<BusinessAccessRequest | undefined>;
  getAccessRequestsByBusinessIds(businessIds: string[]): Promise<AccessRequestWithBusiness[]>;
  getAccessRequestsByRequester(requesterUserId: string): Promise<AccessRequestWithBusiness[]>;
  decideAccessRequest(
    id: string,
    decision: { status: "approved" | "rejected"; decidedByUserId: string },
  ): Promise<BusinessAccessRequest | undefined>;

  // Books (one libro de reclamaciones per establishment)
  getBooks(businessId: string): Promise<BookSummary[]>;
  createBook(book: InsertBook): Promise<Book>;
  updateBook(id: string, updates: Partial<InsertBook>): Promise<Book>;

  // History and activity
  getActivityHistory(businessId: string, filters: HistoryFilters): Promise<ActivityEntry[]>;
  getAuditLogs(businessId: string, filters: HistoryFilters): Promise<AuditLogEntry[]>;
  getSystemChanges(businessId: string, filters: HistoryFilters): Promise<SystemChange[]>;
}

export interface ComplaintFilters {
  status?: string;
  type?: string;
  priority?: string;
  assignedToUserId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  establishmentId?: string;
}

export interface ComplaintStats {
  total: number;
  new: number;
  inProgress: number;
  responded: number;
  resolved: number;
  overdue: number;
  /** Complaints with a provider response. */
  answered: number;
  avgResponseTime: number;
  /**
   * Share of complaints answered within the legal deadline (15 business days).
   * `null` = no complaints yet, which is NOT the same as 0%.
   */
  slaOnTimeRate: number | null;
}

// Phase 3.11: reincidence (repeat complaints by product/store)
export interface ReincidenceEntry {
  key: string;
  total: number;
  resolved: number;
  overdue: number;
}

export interface ReincidenceReport {
  byProduct: ReincidenceEntry[];
  byEstablishment: ReincidenceEntry[];
}

/**
 * A complaint plus the public name of its establishment. The dashboard must show
 * "Local Miraflores", never the raw `establishmentId` UUID.
 */
export type ComplaintWithEstablishment = Complaint & { establishmentName: string | null };

export interface DashboardMetrics {
  activeComplaints: number;
  urgentComplaints: number;
  overdueComplaints: number;
  /** Complaints received by the business (0 = no data for the rate metrics). */
  totalComplaints: number;
  /** `null` when there are no complaints yet; never report that as 0%. */
  slaCompliance: number | null;
  resolvedThisMonth: number;
  resolutionRate: number;
  averageResponseTime: number;
  recentComplaints: ComplaintWithEstablishment[];
  urgentAlerts: ComplaintWithEstablishment[];
}

export type ComplianceStandardStatus = 'compliant' | 'pending' | 'overdue' | 'not_applicable';

/**
 * One legal obligation, with the evidence that decided its status and the
 * concrete fix. `not_applicable` is a first-class state: with zero complaints
 * there is nothing to be late on, so the 15-day deadline must NOT be counted as
 * "compliant" (that inflated a brand-new business to 67%).
 */
export interface ComplianceStandard {
  id: 'ds_011' | 'ds_101' | 'ley_29733' | 'rnpd';
  label: string;
  status: ComplianceStandardStatus;
  /** Evidence in plain language, with real numbers (never a placeholder). */
  detail: string;
  /** What the business must do; null when there is nothing to fix. */
  action: string | null;
  /** In-app destination that fixes it, when one exists. */
  href: string | null;
  /**
   * In-app assistant that fixes it when a page is not enough. `rnpd-assistant`
   * opens the processing-activities dialog (the fix is one click, not a form).
   */
  actionTarget?: 'rnpd-assistant';
  /**
   * Official procedure the platform cannot complete on the client's behalf
   * (for example the RNPD inscription, which is filed by the business itself).
   */
  external?: { href: string; label: string };
}

export interface ComplianceReport {
  standards: ComplianceStandard[];
  /** Obligations that apply today (excludes "no complaints yet"). */
  applicableStandards: number;
  compliantStandards: number;
  /** Checklist rows stored for the business (optional paperwork record). */
  checklistItems: number;
  nextActions: string[];
  overdueItems: ComplianceTracking[];
  /**
   * What the business declared about the RNPD (SIPDP) inscription.
   * `registered` is a declaration, never a verification: the platform does not
   * and cannot check the State registry.
   */
  rnpd: {
    registered: boolean;
    /** Whether the business answered at all (onboarding or the dialog). */
    answered: boolean;
    code: string | null;
    completedDate: string | null;
  };
}

export interface UserStats {
  totalLogins: number;
  actionsPerformed: number;
  lastLogin: Date | null;
  complaintsManaged: number;
}

/**
 * The account's own identity fields. The company's phone and address are NOT
 * here: they belong to the business record and are edited through
 * `PATCH /api/businesses/:id` ("Mi empresa"), so company data has exactly one
 * write path instead of two that could disagree.
 */
export interface UpdateUserProfileData {
  email?: string;
  firstName?: string;
  lastName?: string;
}

export interface UserWithBusiness {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  businessId: string | null;
  isActive: boolean;
  isEmailVerified: boolean;
  /** Shared demo account: its credentials are public and nobody can confirm it. */
  isDemo: boolean;
  onboardingStep: number;
  onboardingCompleted: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  businessName: string | null;
}

export interface BusinessWithStats extends Business {
  establishmentCount: number;
  userCount: number;
}

export interface BookSummary {
  id: string;
  businessId: string;
  establishmentId: string;
  establishmentName: string;
  bookType: string;
  description: string | null;
  entriesCount: number;
  isActive: boolean;
  createdAt: Date;
}

export interface HistoryFilters {
  filterType?: string;
  dateRange?: number;
  searchTerm?: string;
}

export interface ActivityEntry {
  id: string;
  action: string;
  description: string;
  username: string;
  module: string;
  timestamp: Date;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  username: string;
  recordId: string;
  entityType: string;
  oldValues: unknown;
  newValues: unknown;
  timestamp: Date;
}

export interface SystemChange {
  id: string;
  title: string;
  description: string;
  type: string;
  version: string;
  timestamp: Date;
}

export interface ReportStats {
  totalComplaints: number;
  complaintsGrowth: number;
  averageResponseTime: number;
  resolutionRate: number;
  /**
   * Complaint-handling compliance: share of complaints answered within the 15
   * business days of DS 101-2022-PCM. null = no complaints (no data), which is
   * deliberately different from 0%.
   */
  slaOnTimeRate: number | null;
  /** Complaints with a provider response. */
  answeredComplaints: number;
  /** Complaints past the legal deadline without a response. */
  overdueComplaints: number;
  /** Same as slaOnTimeRate, as a plain number (0 when there is no data). */
  complianceRate: number;
}

/** Built by `@shared/monthly-reports`, which also owns the aggregation. */
export type { MonthlyReport } from "@shared/monthly-reports";
