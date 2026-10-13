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
  ApiKeyPublic,
  Webhook,
  InsertWebhook,
} from "@shared/schema";

// Application version reported alongside the derived system-change entries.
export const APP_VERSION = "1.2.0";

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
  getFailedLoginAttempts(email: string, ipAddress: string, since: Date): Promise<number>;
  
  // Auth audit logging
  createAuthAuditLog(auditLog: InsertAuthAuditLog): Promise<AuthAuditLog>;
  createLoginAttempt(loginAttempt: InsertLoginAttempt): Promise<LoginAttempt>;
  
  // Libro configuration for onboarding step 2
  createLibroConfiguration(config: InsertLibroConfiguration): Promise<LibroConfiguration>;
  getLibroConfiguration(businessId: string): Promise<LibroConfiguration | undefined>;
  getLibroConfigurationBySlug(slug: string): Promise<LibroConfiguration | undefined>;
  updateLibroConfiguration(id: string, updates: Partial<InsertLibroConfiguration>): Promise<LibroConfiguration>;
  
  // Business operations
  getBusiness(id: string): Promise<Business | undefined>;
  getBusinessByRuc(ruc: string): Promise<Business | undefined>;
  createBusiness(business: InsertBusiness): Promise<Business>;
  updateBusiness(id: string, updates: Partial<InsertBusiness>): Promise<Business>;
  
  // Establishment operations
  getEstablishment(id: string): Promise<Establishment | undefined>;
  getEstablishmentsByBusiness(businessId: string): Promise<Establishment[]>;
  createEstablishment(establishment: InsertEstablishment): Promise<Establishment>;
  updateEstablishment(id: string, updates: Partial<InsertEstablishment>): Promise<Establishment>;
  
  // Complaint operations
  getComplaint(id: string): Promise<Complaint | undefined>;
  findComplaintByCorrelative(businessId: string, correlativeNumber: string, documentNumber: string): Promise<Complaint | undefined>;
  getComplaintsByBusiness(businessId: string, filters?: ComplaintFilters): Promise<Complaint[]>;
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

  // Webhooks (Phase 3.12)
  createWebhook(data: InsertWebhook): Promise<Webhook>;
  getWebhooksByBusiness(businessId: string): Promise<Webhook[]>;
  getActiveWebhooks(businessId: string, event: string): Promise<Webhook[]>;
  updateWebhook(id: string, businessId: string, updates: Partial<InsertWebhook>): Promise<Webhook | undefined>;
  deleteWebhook(id: string, businessId: string): Promise<boolean>;
  
  // ARCO request operations
  getArcoRequests(businessId: string): Promise<ArcoRequest[]>;
  createArcoRequest(request: InsertArcoRequest): Promise<ArcoRequest>;
  updateArcoRequest(id: string, updates: Partial<InsertArcoRequest>): Promise<ArcoRequest>;
  
  // Compliance tracking operations
  getComplianceTracking(businessId: string): Promise<ComplianceTracking[]>;
  createComplianceTracking(tracking: InsertComplianceTracking): Promise<ComplianceTracking>;
  updateComplianceTracking(id: string, updates: Partial<InsertComplianceTracking>): Promise<ComplianceTracking>;
  
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
  generateComplianceReport(businessId: string): Promise<ComplianceReport>;
  getReportStats(businessId: string): Promise<ReportStats>;
  getMonthlyReports(businessId: string): Promise<MonthlyReport[]>;

  // User administration
  /** INTERNAL use only - spans every tenant. Never return over HTTP. */
  getAllUsers(): Promise<UserWithBusiness[]>;
  /** Tenant-scoped listing for HTTP handlers. */
  getUsersByBusinessIds(businessIds: string[]): Promise<UserWithBusiness[]>;
  getUserStats(userId: string): Promise<UserStats>;
  updateUserStatus(id: string, isActive: boolean): Promise<User>;
  updateUserProfile(id: string, data: UpdateUserProfileData): Promise<User>;
  changeUserPassword(id: string, currentPassword: string, newPassword: string): Promise<void>;

  // Business administration
  getAllBusinesses(): Promise<BusinessWithStats[]>;
  getBusinessById(id: string): Promise<Business | undefined>;

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
  /** Share of complaints answered within the legal deadline (15 business days). */
  slaCompliance: number;
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

export interface DashboardMetrics {
  activeComplaints: number;
  urgentComplaints: number;
  overdueComplaints: number;
  slaCompliance: number;
  resolvedThisMonth: number;
  resolutionRate: number;
  averageResponseTime: number;
  recentComplaints: Complaint[];
  urgentAlerts: Complaint[];
}

export interface ComplianceReport {
  ds011Status: boolean;
  ds101Status: boolean;
  ley29733Status: boolean;
  nextActions: string[];
  overdueItems: ComplianceTracking[];
}

export interface UserStats {
  totalLogins: number;
  actionsPerformed: number;
  lastLogin: Date | null;
  complaintsManaged: number;
}

export interface UpdateUserProfileData {
  email?: string;
  firstName?: string;
  lastName?: string;
  /** null clears the value on the business record. */
  phone?: string | null;
  address?: string;
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
  /** Paperwork checklist (RNPD, privacy policy, DS 011/101) - NOT a deadline metric. */
  formalComplianceRate: number;
}

export interface MonthlyReport {
  month: string;
  complaints: number;
  resolved: number;
  overdue: number;
}
