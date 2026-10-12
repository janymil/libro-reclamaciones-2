import {
  users,
  businesses,
  establishments,
  books,
  complaints,
  complaintAuditLog,
  arcoRequests,
  complianceTracking,
  dataProcessingActivities,
  notifications,
  loginAttempts,
  authAuditLog,
  libroConfiguration,
  type User,
  type InsertUser,
  type Business,
  type InsertBusiness,
  type Establishment,
  type InsertEstablishment,
  type Book,
  type InsertBook,
  type Complaint,
  type InsertComplaint,
  type ComplaintAuditLog,
  type ArcoRequest,
  type InsertArcoRequest,
  type ComplianceTracking,
  type InsertComplianceTracking,
  type DataProcessingActivity,
  type InsertDataProcessingActivity,
  type Notification,
  type InsertNotification,
  type LoginAttempt,
  type InsertLoginAttempt,
  type AuthAuditLog,
  type InsertAuthAuditLog,
  type LibroConfiguration,
  type InsertLibroConfiguration,
  type UserRegistration,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, count, gte, lte, lt, sql, or, inArray, isNotNull } from "drizzle-orm";
import { businessDayCalculator } from "./services/businessDayCalculator";
import bcrypt from "bcrypt";

/** Application version reported alongside the derived system-change entries. */
const APP_VERSION = "1.2.0";

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
  createComplaint(complaint: InsertComplaint): Promise<Complaint>;
  updateComplaint(id: string, updates: Partial<InsertComplaint>): Promise<Complaint>;
  getComplaintStats(businessId: string): Promise<ComplaintStats>;
  getOverdueComplaints(businessId: string): Promise<Complaint[]>;
  
  // Audit log operations
  createAuditLog(auditLog: Omit<ComplaintAuditLog, 'id' | 'createdAt'>): Promise<ComplaintAuditLog>;
  getAuditLogsByComplaint(complaintId: string): Promise<ComplaintAuditLog[]>;
  
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
  markNotificationAsRead(id: string): Promise<void>;
  
  // Analytics and reporting
  getDashboardMetrics(businessId: string): Promise<DashboardMetrics>;
  generateComplianceReport(businessId: string): Promise<ComplianceReport>;
  getReportStats(businessId: string): Promise<ReportStats>;
  getMonthlyReports(businessId: string): Promise<MonthlyReport[]>;

  // User administration
  getAllUsers(): Promise<UserWithBusiness[]>;
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
  avgResponseTime: number;
  slaCompliance: number;
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
  phone?: string;
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
  complianceRate: number;
}

export interface MonthlyReport {
  month: string;
  complaints: number;
  resolved: number;
  overdue: number;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(userData: InsertUser & { password: string }): Promise<User> {
    // Password is already hashed by AuthService - don't hash again!
    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        password: userData.password, // Already hashed by AuthService
      })
      .returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  // Auth security operations
  async incrementFailedLoginAttempts(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ 
        failedLoginAttempts: sql`${users.failedLoginAttempts} + 1`,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));
  }

  async resetFailedLoginAttempts(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ 
        failedLoginAttempts: 0,
        accountLockedUntil: null,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));
  }

  async lockUserAccount(userId: string, lockUntil: Date): Promise<void> {
    await db
      .update(users)
      .set({ 
        accountLockedUntil: lockUntil,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));
  }

  async updateLastLogin(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ 
        lastLoginAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));
  }

  async setPasswordResetToken(email: string, token: string, expires: Date): Promise<void> {
    await db
      .update(users)
      .set({ 
        passwordResetToken: token,
        passwordResetExpires: expires,
        updatedAt: new Date()
      })
      .where(eq(users.email, email));
  }

  async getFailedLoginAttempts(email: string, ipAddress: string, since: Date): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(loginAttempts)
      .where(and(
        eq(loginAttempts.email, email),
        eq(loginAttempts.ipAddress, ipAddress),
        eq(loginAttempts.success, false),
        gte(loginAttempts.createdAt, since)
      ));
    
    return result[0]?.count || 0;
  }

  // Auth audit logging
  async createAuthAuditLog(auditLogData: InsertAuthAuditLog): Promise<AuthAuditLog> {
    const [auditLog] = await db
      .insert(authAuditLog)
      .values(auditLogData)
      .returning();
    return auditLog;
  }

  async createLoginAttempt(loginAttemptData: InsertLoginAttempt): Promise<LoginAttempt> {
    const [loginAttempt] = await db
      .insert(loginAttempts)
      .values(loginAttemptData)
      .returning();
    return loginAttempt;
  }

  // Libro configuration for onboarding step 2
  async createLibroConfiguration(configData: InsertLibroConfiguration): Promise<LibroConfiguration> {
    const [config] = await db
      .insert(libroConfiguration)
      .values(configData)
      .returning();
    return config;
  }

  async getLibroConfiguration(businessId: string): Promise<LibroConfiguration | undefined> {
    const [config] = await db
      .select()
      .from(libroConfiguration)
      .where(eq(libroConfiguration.businessId, businessId));
    return config;
  }

  async getLibroConfigurationBySlug(slug: string): Promise<LibroConfiguration | undefined> {
    const [config] = await db
      .select()
      .from(libroConfiguration)
      .where(eq(libroConfiguration.urlSlug, slug));
    return config;
  }

  async updateLibroConfiguration(id: string, updates: Partial<InsertLibroConfiguration>): Promise<LibroConfiguration> {
    const [config] = await db
      .update(libroConfiguration)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(libroConfiguration.id, id))
      .returning();
    return config;
  }

  async getBusiness(id: string): Promise<Business | undefined> {
    const [business] = await db.select().from(businesses).where(eq(businesses.id, id));
    return business;
  }

  async getBusinessByRuc(ruc: string): Promise<Business | undefined> {
    const [business] = await db.select().from(businesses).where(eq(businesses.ruc, ruc));
    return business;
  }

  async createBusiness(businessData: InsertBusiness): Promise<Business> {
    const [business] = await db
      .insert(businesses)
      .values(businessData)
      .returning();
    return business;
  }

  async updateBusiness(id: string, updates: Partial<InsertBusiness>): Promise<Business> {
    const [business] = await db
      .update(businesses)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(businesses.id, id))
      .returning();
    return business;
  }

  async getEstablishment(id: string): Promise<Establishment | undefined> {
    const [establishment] = await db.select().from(establishments).where(eq(establishments.id, id));
    return establishment;
  }

  async getEstablishmentsByBusiness(businessId: string): Promise<Establishment[]> {
    return await db.select().from(establishments)
      .where(and(eq(establishments.businessId, businessId), eq(establishments.isActive, true)))
      .orderBy(asc(establishments.name));
  }

  async createEstablishment(establishmentData: InsertEstablishment): Promise<Establishment> {
    const [establishment] = await db
      .insert(establishments)
      .values(establishmentData)
      .returning();
    return establishment;
  }

  async updateEstablishment(id: string, updates: Partial<InsertEstablishment>): Promise<Establishment> {
    const [establishment] = await db
      .update(establishments)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(establishments.id, id))
      .returning();
    return establishment;
  }

  async getComplaint(id: string): Promise<Complaint | undefined> {
    const [complaint] = await db.select().from(complaints).where(eq(complaints.id, id));
    return complaint;
  }

  /**
   * Locates a complaint from the public portal. The consumer must provide both
   * the correlative number and their document number so a third party cannot
   * enumerate other people's complaints.
   */
  async findComplaintByCorrelative(
    businessId: string,
    correlativeNumber: string,
    documentNumber: string
  ): Promise<Complaint | undefined> {
    const [complaint] = await db
      .select()
      .from(complaints)
      .where(and(
        eq(complaints.businessId, businessId),
        eq(complaints.correlativeNumber, correlativeNumber),
        eq(complaints.consumerDocumentNumber, documentNumber)
      ));
    return complaint;
  }

  async getComplaintsByBusiness(businessId: string, filters?: ComplaintFilters): Promise<Complaint[]> {
    const conditions = [eq(complaints.businessId, businessId)];

    if (filters) {
      if (filters.status) {
        conditions.push(eq(complaints.status, filters.status));
      }
      if (filters.type) {
        conditions.push(eq(complaints.complaintType, filters.type));
      }
      if (filters.priority) {
        conditions.push(eq(complaints.priority, filters.priority));
      }
      if (filters.assignedToUserId) {
        conditions.push(eq(complaints.assignedToUserId, filters.assignedToUserId));
      }
      if (filters.establishmentId) {
        conditions.push(eq(complaints.establishmentId, filters.establishmentId));
      }
      if (filters.dateFrom) {
        conditions.push(gte(complaints.submissionDate, filters.dateFrom));
      }
      if (filters.dateTo) {
        conditions.push(lte(complaints.submissionDate, filters.dateTo));
      }
    }

    return await db.select().from(complaints)
      .where(and(...conditions))
      .orderBy(desc(complaints.createdAt));
  }

  async getComplaintsByEstablishment(establishmentId: string): Promise<Complaint[]> {
    return await db.select().from(complaints)
      .where(eq(complaints.establishmentId, establishmentId))
      .orderBy(desc(complaints.createdAt));
  }

  async createComplaint(complaintData: InsertComplaint): Promise<Complaint> {
    const [complaint] = await db
      .insert(complaints)
      .values(complaintData)
      .returning();
    return complaint;
  }

  async updateComplaint(id: string, updates: Partial<InsertComplaint>): Promise<Complaint> {
    const [complaint] = await db
      .update(complaints)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(complaints.id, id))
      .returning();
    return complaint;
  }

  async getComplaintStats(businessId: string): Promise<ComplaintStats> {
    const totalResult = await db
      .select({ count: count() })
      .from(complaints)
      .where(eq(complaints.businessId, businessId));

    const statusCounts = await db
      .select({
        status: complaints.status,
        count: count(),
      })
      .from(complaints)
      .where(eq(complaints.businessId, businessId))
      .groupBy(complaints.status);

    const overdueCount = await db
      .select({ count: count() })
      .from(complaints)
      .where(and(
        eq(complaints.businessId, businessId),
        eq(complaints.isOverdue, true)
      ));

    const statusMap = statusCounts.reduce((acc, { status, count }) => {
      acc[status] = count;
      return acc;
    }, {} as Record<string, number>);

    const total = totalResult[0]?.count || 0;
    const overdue = overdueCount[0]?.count || 0;
    const resolved = statusMap['resolved'] || 0;

    // Answered complaints, used for the SLA and average-response metrics
    const answered = await db
      .select({
        submissionDate: complaints.submissionDate,
        responseDate: complaints.responseDate,
        dueDate: complaints.dueDate,
      })
      .from(complaints)
      .where(and(
        eq(complaints.businessId, businessId),
        isNotNull(complaints.responseDate)
      ));

    // SLA compliance = share of answered complaints answered within the legal
    // deadline (15 business days), i.e. response date on or before the due date.
    const answeredOnTime = answered.filter(
      complaint =>
        complaint.responseDate &&
        complaint.dueDate &&
        new Date(complaint.responseDate) <= new Date(complaint.dueDate)
    ).length;

    const slaCompliance = answered.length > 0
      ? (answeredOnTime / answered.length) * 100
      : 100;

    const avgResponseTime = answered.length > 0
      ? Math.round(
          (answered.reduce(
            (sum, complaint) =>
              sum + businessDayCalculator.getBusinessDaysBetween(
                complaint.submissionDate,
                complaint.responseDate as Date
              ),
            0
          ) / answered.length) * 10
        ) / 10
      : 0;

    return {
      total,
      new: statusMap['new'] || 0,
      inProgress: statusMap['in_progress'] || 0,
      responded: statusMap['responded'] || 0,
      resolved,
      overdue,
      avgResponseTime,
      slaCompliance: Math.round(slaCompliance),
    };
  }

  async getOverdueComplaints(businessId: string): Promise<Complaint[]> {
    return await db.select().from(complaints)
      .where(and(
        eq(complaints.businessId, businessId),
        or(
          eq(complaints.isOverdue, true),
          and(
            lte(complaints.dueDate, new Date()),
            or(
              eq(complaints.status, 'new'),
              eq(complaints.status, 'in_progress')
            )
          )
        )
      ))
      .orderBy(asc(complaints.dueDate));
  }

  async createAuditLog(auditLogData: Omit<ComplaintAuditLog, 'id' | 'createdAt'>): Promise<ComplaintAuditLog> {
    const [auditLog] = await db
      .insert(complaintAuditLog)
      .values(auditLogData)
      .returning();
    return auditLog;
  }

  async getAuditLogsByComplaint(complaintId: string): Promise<ComplaintAuditLog[]> {
    return await db.select().from(complaintAuditLog)
      .where(eq(complaintAuditLog.complaintId, complaintId))
      .orderBy(desc(complaintAuditLog.createdAt));
  }

  async getArcoRequests(businessId: string): Promise<ArcoRequest[]> {
    return await db.select().from(arcoRequests)
      .where(eq(arcoRequests.businessId, businessId))
      .orderBy(desc(arcoRequests.createdAt));
  }

  async createArcoRequest(requestData: InsertArcoRequest): Promise<ArcoRequest> {
    const [request] = await db
      .insert(arcoRequests)
      .values(requestData)
      .returning();
    return request;
  }

  async updateArcoRequest(id: string, updates: Partial<InsertArcoRequest>): Promise<ArcoRequest> {
    const [request] = await db
      .update(arcoRequests)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(arcoRequests.id, id))
      .returning();
    return request;
  }

  async getComplianceTracking(businessId: string): Promise<ComplianceTracking[]> {
    return await db.select().from(complianceTracking)
      .where(eq(complianceTracking.businessId, businessId))
      .orderBy(asc(complianceTracking.dueDate));
  }

  async createComplianceTracking(trackingData: InsertComplianceTracking): Promise<ComplianceTracking> {
    const [tracking] = await db
      .insert(complianceTracking)
      .values(trackingData)
      .returning();
    return tracking;
  }

  async updateComplianceTracking(id: string, updates: Partial<InsertComplianceTracking>): Promise<ComplianceTracking> {
    const [tracking] = await db
      .update(complianceTracking)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(complianceTracking.id, id))
      .returning();
    return tracking;
  }

  async getDataProcessingActivities(businessId: string): Promise<DataProcessingActivity[]> {
    return await db.select().from(dataProcessingActivities)
      .where(and(
        eq(dataProcessingActivities.businessId, businessId),
        eq(dataProcessingActivities.isActive, true)
      ))
      .orderBy(asc(dataProcessingActivities.activityName));
  }

  async createDataProcessingActivity(activityData: InsertDataProcessingActivity): Promise<DataProcessingActivity> {
    const [activity] = await db
      .insert(dataProcessingActivities)
      .values(activityData)
      .returning();
    return activity;
  }

  async updateDataProcessingActivity(id: string, updates: Partial<InsertDataProcessingActivity>): Promise<DataProcessingActivity> {
    const [activity] = await db
      .update(dataProcessingActivities)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(dataProcessingActivities.id, id))
      .returning();
    return activity;
  }

  async getNotifications(businessId: string, userId?: string): Promise<Notification[]> {
    const conditions = [eq(notifications.businessId, businessId)];
    
    if (userId) {
      const userCondition = or(
        eq(notifications.userId, userId),
        sql`${notifications.userId} IS NULL`
      );
      if (userCondition) {
        conditions.push(userCondition);
      }
    }
    
    return await db.select().from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  }

  async createNotification(notificationData: InsertNotification): Promise<Notification> {
    const [notification] = await db
      .insert(notifications)
      .values(notificationData)
      .returning();
    return notification;
  }

  async markNotificationAsRead(id: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id));
  }

  async getDashboardMetrics(businessId: string): Promise<DashboardMetrics> {
    const stats = await this.getComplaintStats(businessId);
    const urgentComplaints = await db.select().from(complaints)
      .where(and(
        eq(complaints.businessId, businessId),
        eq(complaints.priority, 'urgent')
      ))
      .limit(10);

    const recentComplaints = await db.select().from(complaints)
      .where(eq(complaints.businessId, businessId))
      .orderBy(desc(complaints.createdAt))
      .limit(5);

    // Get complaints due within 2 days for urgent alerts
    const urgentAlerts = await db.select().from(complaints)
      .where(and(
        eq(complaints.businessId, businessId),
        lte(complaints.dueDate, new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)),
        or(eq(complaints.status, 'new'), eq(complaints.status, 'in_progress'))
      ))
      .orderBy(asc(complaints.dueDate));

    // Complaints resolved during the current month
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [resolvedThisMonthResult] = await db
      .select({ count: count() })
      .from(complaints)
      .where(and(
        eq(complaints.businessId, businessId),
        eq(complaints.status, 'resolved'),
        gte(complaints.updatedAt, monthStart)
      ));

    const resolutionRate = stats.total > 0
      ? Math.round(((stats.responded + stats.resolved) / stats.total) * 100)
      : 0;

    return {
      activeComplaints: stats.new + stats.inProgress,
      urgentComplaints: urgentComplaints.length,
      overdueComplaints: stats.overdue,
      slaCompliance: stats.slaCompliance,
      resolvedThisMonth: resolvedThisMonthResult?.count ?? 0,
      resolutionRate,
      averageResponseTime: stats.avgResponseTime,
      recentComplaints,
      urgentAlerts,
    };
  }

  async generateComplianceReport(businessId: string): Promise<ComplianceReport> {
    const tracking = await this.getComplianceTracking(businessId);
    
    const ds011Status = tracking.some(t => t.complianceType === 'ds_011_2011_pcm' && t.status === 'compliant');
    const ds101Status = tracking.some(t => t.complianceType === 'ds_101_2022_pcm' && t.status === 'compliant');
    const ley29733Status = tracking.some(t => t.complianceType === 'ley_29733' && t.status === 'compliant');
    
    const overdueItems = tracking.filter(t => 
      t.status !== 'compliant' && 
      t.dueDate && 
      new Date(t.dueDate) < new Date()
    );
    
    const nextActions = [
      !ley29733Status ? 'Registro RNPD - Vence 30/03/2025' : null,
      'Actualizar Política de Privacidad',
      'Capacitación derechos ARCO'
    ].filter(Boolean) as string[];

    return {
      ds011Status,
      ds101Status,
      ley29733Status,
      nextActions,
      overdueItems,
    };
  }
  async getReportStats(businessId: string): Promise<ReportStats> {
    const stats = await this.getComplaintStats(businessId);

    const thisMonthStart = new Date();
    thisMonthStart.setDate(1);
    thisMonthStart.setHours(0, 0, 0, 0);

    const lastMonthStart = new Date(thisMonthStart);
    lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);

    const [thisMonthResult] = await db
      .select({ count: count() })
      .from(complaints)
      .where(and(
        eq(complaints.businessId, businessId),
        gte(complaints.submissionDate, thisMonthStart)
      ));

    const [lastMonthResult] = await db
      .select({ count: count() })
      .from(complaints)
      .where(and(
        eq(complaints.businessId, businessId),
        gte(complaints.submissionDate, lastMonthStart),
        lt(complaints.submissionDate, thisMonthStart)
      ));

    const thisMonth = thisMonthResult?.count ?? 0;
    const lastMonth = lastMonthResult?.count ?? 0;

    const complaintsGrowth = lastMonth > 0
      ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100)
      : (thisMonth > 0 ? 100 : 0);

    // Average response time, measured in business days (Peruvian calendar)
    const responded = await db
      .select({
        submissionDate: complaints.submissionDate,
        responseDate: complaints.responseDate,
      })
      .from(complaints)
      .where(and(
        eq(complaints.businessId, businessId),
        isNotNull(complaints.responseDate)
      ));

    const averageResponseTime = responded.length > 0
      ? Math.round(
          (responded.reduce(
            (total, complaint) =>
              total + businessDayCalculator.getBusinessDaysBetween(
                complaint.submissionDate,
                complaint.responseDate as Date
              ),
            0
          ) / responded.length) * 10
        ) / 10
      : 0;

    const resolutionRate = stats.total > 0
      ? Math.round(((stats.resolved + stats.responded) / stats.total) * 100)
      : 0;

    const compliance = await this.generateComplianceReport(businessId);
    const compliantCount = [
      compliance.ds011Status,
      compliance.ds101Status,
      compliance.ley29733Status,
    ].filter(Boolean).length;

    return {
      totalComplaints: stats.total,
      complaintsGrowth,
      averageResponseTime,
      resolutionRate,
      complianceRate: Math.round((compliantCount / 3) * 100),
    };
  }

  async getMonthlyReports(businessId: string): Promise<MonthlyReport[]> {
    const rows = await db
      .select({
        submissionDate: complaints.submissionDate,
        status: complaints.status,
        isOverdue: complaints.isOverdue,
      })
      .from(complaints)
      .where(eq(complaints.businessId, businessId));

    const now = new Date();
    const reports: MonthlyReport[] = [];

    // Report on the last 6 months, most recent first
    for (let offset = 0; offset < 6; offset++) {
      const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);

      const inMonth = rows.filter(row => {
        const submitted = new Date(row.submissionDate);
        return submitted >= start && submitted < end;
      });

      reports.push({
        month: start.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' }),
        complaints: inMonth.length,
        resolved: inMonth.filter(row => row.status === 'resolved').length,
        overdue: inMonth.filter(row => row.isOverdue).length,
      });
    }

    return reports;
  }
  async getAllBusinesses(): Promise<BusinessWithStats[]> {
    const allBusinesses = await db
      .select()
      .from(businesses)
      .orderBy(asc(businesses.businessName));

    const establishmentCounts = await db
      .select({ businessId: establishments.businessId, count: count() })
      .from(establishments)
      .groupBy(establishments.businessId);

    const userCounts = await db
      .select({ businessId: users.businessId, count: count() })
      .from(users)
      .groupBy(users.businessId);

    const establishmentMap = new Map<string, number>(
      establishmentCounts.map((row): [string, number] => [row.businessId, row.count])
    );
    const userMap = new Map<string, number>(
      userCounts.map((row): [string, number] => [row.businessId ?? '', row.count])
    );

    return allBusinesses.map(business => ({
      ...business,
      establishmentCount: establishmentMap.get(business.id) ?? 0,
      userCount: userMap.get(business.id) ?? 0,
    }));
  }

  async getBusinessById(id: string): Promise<Business | undefined> {
    return this.getBusiness(id);
  }

  async getBooks(businessId: string): Promise<BookSummary[]> {
    const bookRows = await db
      .select()
      .from(books)
      .where(eq(books.businessId, businessId))
      .orderBy(desc(books.createdAt));

    if (bookRows.length === 0) {
      return [];
    }

    const establishmentRows = await db
      .select({ id: establishments.id, name: establishments.name })
      .from(establishments)
      .where(eq(establishments.businessId, businessId));
    const establishmentNames = new Map<string, string>(
      establishmentRows.map((row): [string, string] => [row.id, row.name])
    );

    const entryCounts = await db
      .select({ establishmentId: complaints.establishmentId, count: count() })
      .from(complaints)
      .where(eq(complaints.businessId, businessId))
      .groupBy(complaints.establishmentId);
    const entriesMap = new Map<string, number>(
      entryCounts.map((row): [string, number] => [row.establishmentId, row.count])
    );

    return bookRows.map(book => ({
      id: book.id,
      businessId: book.businessId,
      establishmentId: book.establishmentId,
      establishmentName: establishmentNames.get(book.establishmentId) ?? 'Establecimiento principal',
      bookType: book.bookType,
      description: book.description,
      entriesCount: entriesMap.get(book.establishmentId) ?? 0,
      isActive: book.isActive,
      createdAt: book.createdAt,
    }));
  }

  async createBook(bookData: InsertBook): Promise<Book> {
    const [book] = await db
      .insert(books)
      .values(bookData)
      .returning();
    return book;
  }

  async updateBook(id: string, updates: Partial<InsertBook>): Promise<Book> {
    const [book] = await db
      .update(books)
      .set({ ...updates })
      .where(eq(books.id, id))
      .returning();
    return book;
  }
  async getAllUsers(): Promise<UserWithBusiness[]> {
    return await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        businessId: users.businessId,
        isActive: users.isActive,
        isEmailVerified: users.isEmailVerified,
        onboardingStep: users.onboardingStep,
        onboardingCompleted: users.onboardingCompleted,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        businessName: businesses.businessName,
      })
      .from(users)
      .leftJoin(businesses, eq(users.businessId, businesses.id))
      .orderBy(asc(users.firstName), asc(users.lastName));
  }

  async getUserStats(userId: string): Promise<UserStats> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));

    const [logins] = await db
      .select({ count: count() })
      .from(authAuditLog)
      .where(and(
        eq(authAuditLog.userId, userId),
        eq(authAuditLog.action, 'login_success')
      ));

    const [actions] = await db
      .select({ count: count() })
      .from(complaintAuditLog)
      .where(eq(complaintAuditLog.userId, userId));

    const [managed] = await db
      .select({ count: count() })
      .from(complaints)
      .where(eq(complaints.assignedToUserId, userId));

    return {
      totalLogins: logins?.count ?? 0,
      actionsPerformed: actions?.count ?? 0,
      lastLogin: user?.lastLoginAt ?? null,
      complaintsManaged: managed?.count ?? 0,
    };
  }

  async updateUserStatus(id: string, isActive: boolean): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserProfile(id: string, data: UpdateUserProfileData): Promise<User> {
    const [existing] = await db.select().from(users).where(eq(users.id, id));
    if (!existing) {
      throw new Error('Usuario no encontrado');
    }

    const userUpdates: Partial<InsertUser> = {};
    if (data.firstName !== undefined) userUpdates.firstName = data.firstName;
    if (data.lastName !== undefined) userUpdates.lastName = data.lastName;
    if (data.email !== undefined) userUpdates.email = data.email;

    const [user] = await db
      .update(users)
      .set({ ...userUpdates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    // Phone and address belong to the business record, not the user
    if (existing.businessId && (data.phone !== undefined || data.address !== undefined)) {
      const businessUpdates: Partial<InsertBusiness> = {};
      if (data.phone !== undefined) businessUpdates.phone = data.phone;
      if (data.address !== undefined) businessUpdates.address = data.address;

      await db
        .update(businesses)
        .set({ ...businessUpdates, updatedAt: new Date() })
        .where(eq(businesses.id, existing.businessId));
    }

    return user;
  }

  async changeUserPassword(id: string, currentPassword: string, newPassword: string): Promise<void> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      throw new Error('La contraseña actual es incorrecta');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await db
      .update(users)
      .set({ password: hashedPassword, updatedAt: new Date() })
      .where(eq(users.id, id));
  }
  async getActivityHistory(businessId: string, filters: HistoryFilters): Promise<ActivityEntry[]> {
    const dateRange = filters.dateRange && filters.dateRange > 0 ? filters.dateRange : 30;
    const since = new Date(Date.now() - dateRange * 24 * 60 * 60 * 1000);

    const businessUsers = await db
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
      .from(users)
      .where(eq(users.businessId, businessId));

    const nameById = new Map<string, string>(
      businessUsers.map((user): [string, string] => [
        user.id,
        `${user.firstName} ${user.lastName}`.trim() || user.email,
      ])
    );

    const entries: ActivityEntry[] = [];

    if (businessUsers.length > 0) {
      const authRows = await db
        .select()
        .from(authAuditLog)
        .where(and(
          inArray(authAuditLog.userId, businessUsers.map(user => user.id)),
          gte(authAuditLog.createdAt, since)
        ))
        .orderBy(desc(authAuditLog.createdAt))
        .limit(100);

      for (const row of authRows) {
        entries.push({
          id: row.id,
          action: row.action,
          description: `${row.action} · ${row.email}${row.success ? '' : ` (${row.failureReason ?? 'fallido'})`}`,
          username: (row.userId && nameById.get(row.userId)) || row.email,
          module: 'autenticación',
          timestamp: row.createdAt,
        });
      }
    }

    const complaintRows = await db
      .select({
        log: complaintAuditLog,
        correlativeNumber: complaints.correlativeNumber,
      })
      .from(complaintAuditLog)
      .innerJoin(complaints, eq(complaintAuditLog.complaintId, complaints.id))
      .where(and(
        eq(complaints.businessId, businessId),
        gte(complaintAuditLog.createdAt, since)
      ))
      .orderBy(desc(complaintAuditLog.createdAt))
      .limit(100);

    for (const row of complaintRows) {
      entries.push({
        id: row.log.id,
        action: row.log.action,
        description: `${row.log.action} · Reclamación ${row.correlativeNumber}`,
        username: (row.log.userId && nameById.get(row.log.userId)) || 'Sistema',
        module: 'reclamaciones',
        timestamp: row.log.createdAt,
      });
    }

    let result = entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (filters.filterType && filters.filterType !== 'all') {
      result = result.filter(entry =>
        entry.module === filters.filterType || entry.action.includes(filters.filterType as string)
      );
    }

    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      result = result.filter(entry =>
        entry.description.toLowerCase().includes(term) || entry.username.toLowerCase().includes(term)
      );
    }

    return result.slice(0, 200);
  }

  async getAuditLogs(businessId: string, filters: HistoryFilters): Promise<AuditLogEntry[]> {
    const dateRange = filters.dateRange && filters.dateRange > 0 ? filters.dateRange : 30;
    const since = new Date(Date.now() - dateRange * 24 * 60 * 60 * 1000);

    const rows = await db
      .select({
        log: complaintAuditLog,
        correlativeNumber: complaints.correlativeNumber,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        userEmail: users.email,
      })
      .from(complaintAuditLog)
      .innerJoin(complaints, eq(complaintAuditLog.complaintId, complaints.id))
      .leftJoin(users, eq(complaintAuditLog.userId, users.id))
      .where(and(
        eq(complaints.businessId, businessId),
        gte(complaintAuditLog.createdAt, since)
      ))
      .orderBy(desc(complaintAuditLog.createdAt))
      .limit(200);

    return rows.map(row => ({
      id: row.log.id,
      action: row.log.action,
      username: `${row.userFirstName ?? ''} ${row.userLastName ?? ''}`.trim() || row.userEmail || 'Sistema',
      recordId: row.correlativeNumber,
      entityType: 'reclamación',
      oldValues: row.log.oldValues,
      newValues: row.log.newValues,
      timestamp: row.log.createdAt,
    }));
  }

  async getSystemChanges(businessId: string, filters: HistoryFilters): Promise<SystemChange[]> {
    // Instead of a hardcoded changelog this derives the entries from the real
    // records registered for the business: company, libro configuration,
    // branches, books and users.
    const dateRange = filters.dateRange && filters.dateRange > 0 ? filters.dateRange : 30;
    const since = new Date(Date.now() - dateRange * 24 * 60 * 60 * 1000);

    const changes: SystemChange[] = [];
    const push = (
      id: string,
      title: string,
      description: string,
      type: string,
      timestamp: Date | null | undefined,
    ) => {
      if (timestamp && timestamp >= since) {
        changes.push({ id, title, description, type, version: APP_VERSION, timestamp });
      }
    };

    const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId));
    if (business) {
      push(
        'sys-business',
        'Empresa registrada',
        `${business.businessName} (RUC ${business.ruc}) fue dada de alta en la plataforma.`,
        'registro',
        business.createdAt,
      );
    }

    const config = await this.getLibroConfiguration(businessId);
    if (config) {
      push(
        'sys-libro-config',
        'Libro de Reclamaciones configurado',
        `Se habilitó el libro "${config.libroName}" en librovirtual.pe/${config.urlSlug}.`,
        'configuración',
        config.createdAt,
      );
    }

    const establishmentRows = await db
      .select()
      .from(establishments)
      .where(eq(establishments.businessId, businessId));
    const establishmentNames = new Map<string, string>(
      establishmentRows.map((row): [string, string] => [row.id, row.name]),
    );

    for (const establishment of establishmentRows) {
      push(
        `sys-establishment-${establishment.id}`,
        'Sucursal registrada',
        `${establishment.name} — ${establishment.address}`,
        'sucursal',
        establishment.createdAt,
      );
    }

    const bookRows = await db.select().from(books).where(eq(books.businessId, businessId));
    for (const book of bookRows) {
      push(
        `sys-book-${book.id}`,
        'Libro creado',
        `Libro de ${book.bookType} habilitado para ${establishmentNames.get(book.establishmentId) ?? 'el establecimiento principal'}.`,
        'libro',
        book.createdAt,
      );
    }

    const userRows = await db.select().from(users).where(eq(users.businessId, businessId));
    for (const user of userRows) {
      push(
        `sys-user-${user.id}`,
        'Usuario incorporado',
        `${user.firstName} ${user.lastName} (${user.email}) con rol ${user.role}.`,
        'usuario',
        user.createdAt,
      );
    }

    if (business) {
      push(
        'sys-platform',
        'Plataforma LibroVirtual.pe',
        'Servicio del Libro de Reclamaciones (DS 011-2011-PCM) con respuestas en 15 días hábiles (DS 101-2022-PCM).',
        'plataforma',
        business.createdAt,
      );
    }

    return changes.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }
}

export const storage = new DatabaseStorage();
