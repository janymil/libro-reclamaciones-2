import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import {
  pgTable,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  decimal,
  jsonb,
  uuid,
  index,
  serial,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table for business users
export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: text("password").notNull(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  role: varchar("role", { length: 50 }).notNull().default("user"), // admin, user, viewer
  businessId: uuid("business_id").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Businesses/Companies table
export const businesses = pgTable("businesses", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ruc: varchar("ruc", { length: 11 }).notNull().unique(),
  businessName: text("business_name").notNull(),
  commercialName: text("commercial_name"),
  email: varchar("email", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  address: text("address").notNull(),
  website: varchar("website", { length: 255 }),
  isActive: boolean("is_active").notNull().default(true),
  subscriptionPlan: varchar("subscription_plan", { length: 50 }).notNull().default("basic"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Establishments table (multiple locations per business)
export const establishments = pgTable("establishments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  businessId: uuid("business_id").notNull(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 255 }),
  identificationCode: varchar("identification_code", { length: 50 }).notNull(), // For correlation
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_establishments_business_id").on(table.businessId),
]);

// Complaints table (main complaints/quejas)
export const complaints = pgTable("complaints", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  businessId: uuid("business_id").notNull(),
  establishmentId: uuid("establishment_id").notNull(),
  correlativeNumber: varchar("correlative_number", { length: 50 }).notNull(),
  complaintType: varchar("complaint_type", { length: 20 }).notNull(), // 'reclamo' | 'queja'
  
  // Consumer data (mandatory fields from Anexo 1)
  consumerFullName: text("consumer_full_name").notNull(),
  consumerDocumentType: varchar("consumer_document_type", { length: 20 }).notNull(), // DNI, CE, Pasaporte
  consumerDocumentNumber: varchar("consumer_document_number", { length: 20 }).notNull(),
  consumerAddress: text("consumer_address").notNull(),
  consumerPhone: varchar("consumer_phone", { length: 20 }).notNull(),
  consumerEmail: varchar("consumer_email", { length: 255 }).notNull(),
  
  // Guardian data (if minor)
  guardianFullName: text("guardian_full_name"),
  guardianDocumentType: varchar("guardian_document_type", { length: 20 }),
  guardianDocumentNumber: varchar("guardian_document_number", { length: 20 }),
  guardianRelationship: varchar("guardian_relationship", { length: 50 }),
  
  // Product/Service identification
  productServiceName: text("product_service_name").notNull(),
  productServiceDescription: text("product_service_description"),
  purchaseAmount: decimal("purchase_amount", { precision: 10, scale: 2 }),
  purchaseDate: timestamp("purchase_date"),
  receiptNumber: varchar("receipt_number", { length: 100 }),
  
  // Complaint details
  complaintDetail: text("complaint_detail").notNull(),
  consumerRequest: text("consumer_request"),
  
  // Status and response
  status: varchar("status", { length: 50 }).notNull().default("new"), // new, in_progress, responded, resolved, overdue
  priority: varchar("priority", { length: 20 }).notNull().default("normal"), // low, normal, high, urgent
  assignedToUserId: uuid("assigned_to_user_id"),
  
  // Provider response
  providerActions: text("provider_actions"),
  providerResponse: text("provider_response"),
  responseDate: timestamp("response_date"),
  responseMethod: varchar("response_method", { length: 50 }), // email, letter, phone
  
  // Legal compliance
  submissionDate: timestamp("submission_date").defaultNow().notNull(),
  dueDate: timestamp("due_date").notNull(), // 15 business days from submission
  isOverdue: boolean("is_overdue").notNull().default(false),
  
  // AI analysis
  aiClassification: jsonb("ai_classification"), // AI analysis results
  aiSuggestedResponse: text("ai_suggested_response"),
  aiRiskLevel: varchar("ai_risk_level", { length: 20 }),
  
  // Attachments and evidence
  attachments: jsonb("attachments"), // Array of file information
  
  // Data protection
  consentGiven: boolean("consent_given").notNull().default(false),
  privacyPolicyVersion: varchar("privacy_policy_version", { length: 50 }),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_complaints_business_id").on(table.businessId),
  index("idx_complaints_establishment_id").on(table.establishmentId),
  index("idx_complaints_status").on(table.status),
  index("idx_complaints_due_date").on(table.dueDate),
  index("idx_complaints_correlative").on(table.correlativeNumber),
]);

// Complaint audit log
export const complaintAuditLog = pgTable("complaint_audit_log", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  complaintId: uuid("complaint_id").notNull(),
  userId: uuid("user_id"),
  action: varchar("action", { length: 100 }).notNull(),
  oldValues: jsonb("old_values"),
  newValues: jsonb("new_values"),
  notes: text("notes"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_audit_complaint_id").on(table.complaintId),
]);

// ARCO requests (Data protection rights)
export const arcoRequests = pgTable("arco_requests", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  businessId: uuid("business_id").notNull(),
  requestType: varchar("request_type", { length: 20 }).notNull(), // access, rectification, cancellation, opposition
  requesterName: text("requester_name").notNull(),
  requesterEmail: varchar("requester_email", { length: 255 }).notNull(),
  requesterDocumentType: varchar("requester_document_type", { length: 20 }).notNull(),
  requesterDocumentNumber: varchar("requester_document_number", { length: 20 }).notNull(),
  requestDetail: text("request_detail").notNull(),
  status: varchar("status", { length: 50 }).notNull().default("pending"), // pending, in_progress, completed, rejected
  response: text("response"),
  responseDate: timestamp("response_date"),
  dueDate: timestamp("due_date").notNull(), // Legal deadline for response
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_arco_business_id").on(table.businessId),
]);

// Legal compliance tracking
export const complianceTracking = pgTable("compliance_tracking", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  businessId: uuid("business_id").notNull(),
  complianceType: varchar("compliance_type", { length: 100 }).notNull(), // rnpd_registration, privacy_policy, etc.
  status: varchar("status", { length: 50 }).notNull(), // compliant, pending, overdue, not_applicable
  dueDate: timestamp("due_date"),
  completedDate: timestamp("completed_date"),
  notes: text("notes"),
  documentUrl: varchar("document_url", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_compliance_business_id").on(table.businessId),
]);

// Data processing activities register (for RNPD)
export const dataProcessingActivities = pgTable("data_processing_activities", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  businessId: uuid("business_id").notNull(),
  activityName: text("activity_name").notNull(),
  purpose: text("purpose").notNull(),
  dataCategories: jsonb("data_categories").notNull(), // Array of data types
  dataSubjects: jsonb("data_subjects").notNull(), // Array of subject types
  legalBasis: varchar("legal_basis", { length: 100 }).notNull(),
  retentionPeriod: varchar("retention_period", { length: 100 }).notNull(),
  securityMeasures: jsonb("security_measures"),
  dataTransfers: jsonb("data_transfers"), // International transfers
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_data_processing_business_id").on(table.businessId),
]);

// Notifications and alerts
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  businessId: uuid("business_id").notNull(),
  userId: uuid("user_id"),
  type: varchar("type", { length: 50 }).notNull(), // deadline_warning, complaint_new, compliance_due, etc.
  title: text("title").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  relatedEntityType: varchar("related_entity_type", { length: 50 }), // complaint, arco_request, compliance
  relatedEntityId: uuid("related_entity_id"),
  scheduledFor: timestamp("scheduled_for"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_notifications_business_id").on(table.businessId),
  index("idx_notifications_user_id").on(table.userId),
]);

// Relations
export const usersRelations = relations(users, ({ one }) => ({
  business: one(businesses, {
    fields: [users.businessId],
    references: [businesses.id],
  }),
}));

export const businessesRelations = relations(businesses, ({ many }) => ({
  users: many(users),
  establishments: many(establishments),
  complaints: many(complaints),
  arcoRequests: many(arcoRequests),
  complianceTracking: many(complianceTracking),
  dataProcessingActivities: many(dataProcessingActivities),
  notifications: many(notifications),
}));

export const establishmentsRelations = relations(establishments, ({ one, many }) => ({
  business: one(businesses, {
    fields: [establishments.businessId],
    references: [businesses.id],
  }),
  complaints: many(complaints),
}));

export const complaintsRelations = relations(complaints, ({ one, many }) => ({
  business: one(businesses, {
    fields: [complaints.businessId],
    references: [businesses.id],
  }),
  establishment: one(establishments, {
    fields: [complaints.establishmentId],
    references: [establishments.id],
  }),
  assignedUser: one(users, {
    fields: [complaints.assignedToUserId],
    references: [users.id],
  }),
  auditLogs: many(complaintAuditLog),
}));

export const complaintAuditLogRelations = relations(complaintAuditLog, ({ one }) => ({
  complaint: one(complaints, {
    fields: [complaintAuditLog.complaintId],
    references: [complaints.id],
  }),
  user: one(users, {
    fields: [complaintAuditLog.userId],
    references: [users.id],
  }),
}));

export const arcoRequestsRelations = relations(arcoRequests, ({ one }) => ({
  business: one(businesses, {
    fields: [arcoRequests.businessId],
    references: [businesses.id],
  }),
}));

export const complianceTrackingRelations = relations(complianceTracking, ({ one }) => ({
  business: one(businesses, {
    fields: [complianceTracking.businessId],
    references: [businesses.id],
  }),
}));

export const dataProcessingActivitiesRelations = relations(dataProcessingActivities, ({ one }) => ({
  business: one(businesses, {
    fields: [dataProcessingActivities.businessId],
    references: [businesses.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  business: one(businesses, {
    fields: [notifications.businessId],
    references: [businesses.id],
  }),
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBusinessSchema = createInsertSchema(businesses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEstablishmentSchema = createInsertSchema(establishments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertComplaintSchema = createInsertSchema(complaints).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertArcoRequestSchema = createInsertSchema(arcoRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertComplianceTrackingSchema = createInsertSchema(complianceTracking).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDataProcessingActivitySchema = createInsertSchema(dataProcessingActivities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Business = typeof businesses.$inferSelect;
export type InsertBusiness = z.infer<typeof insertBusinessSchema>;

export type Establishment = typeof establishments.$inferSelect;
export type InsertEstablishment = z.infer<typeof insertEstablishmentSchema>;

export type Complaint = typeof complaints.$inferSelect;
export type InsertComplaint = z.infer<typeof insertComplaintSchema>;

export type ComplaintAuditLog = typeof complaintAuditLog.$inferSelect;

export type ArcoRequest = typeof arcoRequests.$inferSelect;
export type InsertArcoRequest = z.infer<typeof insertArcoRequestSchema>;

export type ComplianceTracking = typeof complianceTracking.$inferSelect;
export type InsertComplianceTracking = z.infer<typeof insertComplianceTrackingSchema>;

export type DataProcessingActivity = typeof dataProcessingActivities.$inferSelect;
export type InsertDataProcessingActivity = z.infer<typeof insertDataProcessingActivitySchema>;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
