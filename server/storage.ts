import {
  users,
  businesses,
  establishments,
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
import { eq, and, desc, asc, count, gte, lte, sql, or } from "drizzle-orm";
import bcrypt from "bcrypt";

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
  slaCompliance: number;
  resolvedThisMonth: number;
  npsScore: number;
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
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        password: hashedPassword,
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

  async getComplaintsByBusiness(businessId: string, filters?: ComplaintFilters): Promise<Complaint[]> {
    let query = db.select().from(complaints).where(eq(complaints.businessId, businessId));
    
    if (filters) {
      const conditions = [eq(complaints.businessId, businessId)];
      
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
      
      query = query.where(and(...conditions));
    }
    
    return await query.orderBy(desc(complaints.createdAt));
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
    
    // Calculate SLA compliance (non-overdue complaints / total completed complaints)
    const completedComplaints = (statusMap['responded'] || 0) + resolved;
    const slaCompliance = completedComplaints > 0 ? ((completedComplaints - overdue) / completedComplaints) * 100 : 100;

    return {
      total,
      new: statusMap['new'] || 0,
      inProgress: statusMap['in_progress'] || 0,
      responded: statusMap['responded'] || 0,
      resolved,
      overdue,
      avgResponseTime: 0, // Would need to calculate based on actual response times
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
      conditions.push(or(
        eq(notifications.userId, userId),
        sql`${notifications.userId} IS NULL`
      ));
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

    return {
      activeComplaints: stats.new + stats.inProgress,
      urgentComplaints: urgentComplaints.length,
      slaCompliance: stats.slaCompliance,
      resolvedThisMonth: stats.resolved, // This would need date filtering in real implementation
      npsScore: 78, // This would come from actual satisfaction surveys
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
}

export const storage = new DatabaseStorage();
