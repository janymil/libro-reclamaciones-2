import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import type { BankAccountDetails } from "./payment-details";
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
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table for business users with enhanced security
export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: text("password").notNull(), // bcrypt hashed
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  role: varchar("role", { length: 50 }).notNull().default("admin"), // admin (business owner), user, viewer
  /**
   * Platform staff: the LibroDigital team, NOT a tenant role.
   *
   * `role = admin` means "owns a business account" - i.e. the paying customer.
   * An operator is a different kind of person: they manage customers, so this is
   * a separate flag and their `businessId` is normally NULL. Never derive one
   * from the other (that mistake is what once let a customer confirm their own
   * unpaid transfer).
   */
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  businessId: uuid("business_id"), // nullable until business is created
  isActive: boolean("is_active").notNull().default(true),
  isEmailVerified: boolean("is_email_verified").notNull().default(false),
  
  // Security fields
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  accountLockedUntil: timestamp("account_locked_until"),
  lastLoginAt: timestamp("last_login_at"),
  passwordResetToken: varchar("password_reset_token", { length: 255 }),
  passwordResetExpires: timestamp("password_reset_expires"),
  
  // Email verification
  emailVerificationToken: varchar("email_verification_token", { length: 255 }),
  emailVerificationExpires: timestamp("email_verification_expires"),

  // One-time login code ("entra con un código por email"). Stored bcrypt-hashed
  // - like a password, because for ten minutes that is what it is - and only
  // ever single-use, so an intercepted email is not a permanent key. The
  // attempts counter is what burns a code that is being guessed.
  loginCodeHash: text("login_code_hash"),
  loginCodeExpires: timestamp("login_code_expires"),
  loginCodeAttempts: integer("login_code_attempts").notNull().default(0),
  
  // Onboarding flow
  onboardingStep: integer("onboarding_step").notNull().default(1), // 1: user created, 2: business/libro configured
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),

  // Demo/sandbox accounts are shared publicly: they can browse and create
  // records but never modify or delete existing ones (see requireAuth).
  isDemo: boolean("is_demo").notNull().default(false),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_users_email").on(table.email),
  index("idx_users_business_id").on(table.businessId),
]);

// Businesses/Companies table
export const businesses = pgTable("businesses", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ruc: varchar("ruc", { length: 11 }).notNull().unique(),
  businessName: text("business_name").notNull(),
  commercialName: text("commercial_name"),
  phone: varchar("phone", { length: 20 }),
  // Peruvian address structure
  address: text("address").notNull(),
  distrito: varchar("distrito", { length: 100 }).notNull(),
  provincia: varchar("provincia", { length: 100 }).notNull(),
  departamento: varchar("departamento", { length: 100 }).notNull(),
  website: varchar("website", { length: 255 }),
  /**
   * How many establishments (locales) the company says it will have, casa matriz
   * included. Onboarding asks a chain for it, and the "Primeros pasos" checklist
   * on /panel uses it to say "2 de 5" and to remind the customer which locales are
   * still missing. Purely guidance: NULL means "not declared", and nothing in the
   * product (quotas, billing, legality) depends on it.
   */
  expectedEstablishments: integer("expected_establishments"),
  isActive: boolean("is_active").notNull().default(true),
  subscriptionPlan: varchar("subscription_plan", { length: 50 }).notNull().default("gratis"),
  // Commercial lifecycle: trial, then the plan's quotas apply.
  // trialing | active | past_due | canceled | trial_ended
  subscriptionStatus: varchar("subscription_status", { length: 30 }).notNull().default("trialing"),
  trialEndsAt: timestamp("trial_ends_at"),
  planPeriod: varchar("plan_period", { length: 20 }).notNull().default("monthly"), // monthly | annual
  currentPeriodEnd: timestamp("current_period_end"),
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

// Books table (one libro de reclamaciones per establishment)
export const books = pgTable("books", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  businessId: uuid("business_id").notNull(),
  establishmentId: uuid("establishment_id").notNull(),
  bookType: varchar("book_type", { length: 50 }).notNull().default("reclamos"), // reclamos, sugerencias, otros
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_books_business_id").on(table.businessId),
  index("idx_books_establishment_id").on(table.establishmentId),
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

  // 2-year retention (DS 011-2011-PCM): archived records keep their
  // correlative/dates for statistics, but consumer PII is anonymized once
  // the retention window closes. See server/services/retentionService.ts.
  archivedAt: timestamp("archived_at"),
  retentionPurgedAt: timestamp("retention_purged_at"),

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

// Note: the sessions table is created and managed by connect-pg-simple
// (see server/routes.ts, tableName "session"). It is intentionally not
// declared here to avoid a second, unused `sessions` table.

// Login attempts tracking for security
export const loginAttempts = pgTable("login_attempts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email", { length: 255 }).notNull(),
  ipAddress: varchar("ip_address", { length: 45 }).notNull(),
  userAgent: text("user_agent"),
  success: boolean("success").notNull(),
  failureReason: varchar("failure_reason", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_login_attempts_email").on(table.email),
  index("idx_login_attempts_ip").on(table.ipAddress),
  index("idx_login_attempts_created").on(table.createdAt),
]);

// Authentication audit log for security monitoring
export const authAuditLog = pgTable("auth_audit_log", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id"),
  action: varchar("action", { length: 100 }).notNull(), // login, logout, register, password_reset, etc.
  email: varchar("email", { length: 255 }).notNull(),
  ipAddress: varchar("ip_address", { length: 45 }).notNull(),
  userAgent: text("user_agent"),
  success: boolean("success").notNull(),
  failureReason: varchar("failure_reason", { length: 200 }),
  metadata: jsonb("metadata"), // Additional context
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_auth_audit_user_id").on(table.userId),
  index("idx_auth_audit_email").on(table.email),
  index("idx_auth_audit_action").on(table.action),
  index("idx_auth_audit_created").on(table.createdAt),
]);

// Libro configuration for step 2 of onboarding
export const libroConfiguration = pgTable("libro_configuration", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  businessId: uuid("business_id").notNull().unique(),
  userId: uuid("user_id").notNull(), // Who configured it
  
  // Basic configuration from screenshot
  libroName: text("libro_name").notNull(),
  urlSlug: varchar("url_slug", { length: 100 }).notNull().unique(), // for librodigital.pe/company-slug
  businessType: varchar("business_type", { length: 50 }).notNull(), // tienda_virtual, local_fisico
  
  // Contact info
  notificationEmail: varchar("notification_email", { length: 255 }).notNull(),
  whatsappNumber: varchar("whatsapp_number", { length: 20 }),
  websiteUrl: varchar("website_url", { length: 255 }),
  
  // Company logo
  logoUrl: varchar("logo_url", { length: 500 }),
  logoFileName: varchar("logo_file_name", { length: 255 }),
  logoFileSize: integer("logo_file_size"),
  logoMimeType: varchar("logo_mime_type", { length: 100 }),

  // Configurable templates (Professional tier): per-business branding and
  // email/confirmation texts used by emailService and the public portal.
  brandColor: varchar("brand_color", { length: 20 }),
  emailSubjectPrefix: varchar("email_subject_prefix", { length: 120 }),
  emailHeaderText: text("email_header_text"),
  emailFooterText: text("email_footer_text"),
  confirmationMessage: text("confirmation_message"),

  // Sender identity of the consumer-facing emails (confirmation / response).
  // The consumer filed the complaint with the BUSINESS, so the message carries
  // the business's name and a reply must travel back to the business instead of
  // to the platform's inbox (see shared/email-identity.ts). `email_from_address`
  // is only honored when its domain is verified by the mail host.
  emailFromName: varchar("email_from_name", { length: 120 }),
  emailFromAddress: varchar("email_from_address", { length: 255 }),
  emailReplyTo: varchar("email_reply_to", { length: 255 }),

  // Legal link (Ley 29733): the business's own privacy policy page, rendered in
  // the consent checkbox of the public complaint form. When empty, that link
  // falls back to the platform-hosted policy of the book
  // (/libro/:slug/politica-de-privacidad) instead of the dead "#" it used to
  // have. Validated with shared/privacy-policy.ts: http(s) only, because the
  // value ends up as an href on a public page.
  privacyPolicyUrl: varchar("privacy_policy_url", { length: 500 }),

  // AI brand voice: response drafts follow the business's own tone and
  // policies instead of a generic template (see aiService.suggestResponse).
  brandTone: text("brand_tone"),
  brandPolicies: text("brand_policies"),

  // Configuration status
  isActive: boolean("is_active").notNull().default(true),
  configurationCompleted: boolean("configuration_completed").notNull().default(true),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_libro_config_business_id").on(table.businessId),
  index("idx_libro_config_url_slug").on(table.urlSlug),
]);

// Attachments (evidence files) submitted by consumers with their complaint.
// Files live on disk (see server/services/attachmentService.ts); this table
// only stores the metadata so the 2-year retention sweep can purge them.
export const complaintAttachments = pgTable("complaint_attachments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  complaintId: uuid("complaint_id").notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(), // stored name on disk
  originalName: varchar("original_name", { length: 255 }).notNull(), // name the consumer chose
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  fileSize: integer("file_size").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"), // soft delete (manual removal or retention purge)
}, (table) => [
  index("idx_attachments_complaint_id").on(table.complaintId),
]);

// Multi-RUC access: one login can manage several businesses (Corporativo).
// users.businessId remains the *active* business; this table records every
// business the user may switch to (see POST /api/auth/switch-business).
export const userBusinessAccess = pgTable("user_business_access", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull(),
  businessId: uuid("business_id").notNull(),
  role: varchar("role", { length: 50 }).notNull().default("admin"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("uq_user_business_access").on(table.userId, table.businessId),
  index("idx_user_business_access_user_id").on(table.userId),
]);

/**
 * Requests from a login that needs access to a business it does not own.
 *
 * The dead end this replaces: `POST /api/businesses` answers 409 when the RUC
 * already exists, which is correct (a RUC must not be duplicated) but leaves the
 * real cases stranded - the accountant of a client, staff turnover, a partner
 * who is not the person who first registered the empresa.
 *
 * `uq_business_access_request_pair` allows at most one row per (business,
 * requester, status), so a rejected request can be re-sent later (new pending
 * row) while a pending one can never be duplicated.
 */
export const businessAccessRequests = pgTable("business_access_requests", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  businessId: uuid("business_id").notNull(),
  requesterUserId: uuid("requester_user_id").notNull(),
  // Snapshot of the requester identity: the request must stay readable even if
  // the account is later renamed or deactivated.
  requesterEmail: varchar("requester_email", { length: 255 }).notNull(),
  requesterName: text("requester_name"),
  message: text("message"),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending | approved | rejected
  decidedByUserId: uuid("decided_by_user_id"),
  decidedAt: timestamp("decided_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("uq_business_access_request_pair").on(
    table.businessId,
    table.requesterUserId,
    table.status,
  ),
  index("idx_business_access_requests_business").on(table.businessId),
  index("idx_business_access_requests_requester").on(table.requesterUserId),
]);

// API keys for the public REST API (/api/v1, CRM/ERP integrations).
export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  businessId: uuid("business_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  keyPrefix: varchar("key_prefix", { length: 20 }).notNull(), // shown in the UI
  keyHash: text("key_hash").notNull(), // sha256 of the full key
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_api_keys_business_id").on(table.businessId),
]);

// Outgoing webhooks fired on business events (complaint.created, ...).
export const webhooks = pgTable("webhooks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  businessId: uuid("business_id").notNull(),
  url: varchar("url", { length: 500 }).notNull(),
  secret: varchar("secret", { length: 100 }).notNull(), // HMAC-SHA256 signing secret
  events: jsonb("events"), // Array of event names, e.g. ["complaint.created"]
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_webhooks_business_id").on(table.businessId),
]);

// Payment attempts against the SaaS subscription (Phase 2.7).
//
// One row = one checkout attempt for one plan/period. The provider only ever
// sees our own `reference` (safe to print on a receipt) and `amountCents`;
// `providerRef` holds the PSP-side id (preference / order / charge) used to
// reconcile the webhook that reports the final outcome. Money is stored in
// integer céntimos - never a float.
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  businessId: uuid("business_id").notNull(),
  userId: uuid("user_id"), // who started the checkout
  provider: varchar("provider", { length: 30 }).notNull(), // mercadopago | culqi | manual | niubiz | izipay
  method: varchar("method", { length: 30 }), // tarjeta | yape | plin | efectivo | transferencia
  providerRef: varchar("provider_ref", { length: 120 }), // PSP-side id (preference / order / charge)
  reference: varchar("reference", { length: 40 }).notNull(), // LD-XXXXXX, shown to the customer
  planId: varchar("plan_id", { length: 30 }).notNull(),
  period: varchar("period", { length: 20 }).notNull(), // monthly | annual
  amountCents: integer("amount_cents").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("PEN"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  redirectUrl: text("redirect_url"), // where the customer must go to pay (PSP checkout)
  failureReason: text("failure_reason"),
  raw: jsonb("raw"), // sanitized provider payload (never card data)
  paidAt: timestamp("paid_at"),
  confirmedByUserId: uuid("confirmed_by_user_id"), // set when an admin confirms a manual payment
  // Set when this charge came from a recurring agreement (renewal ledger).
  subscriptionId: uuid("subscription_id"),
  /**
   * Discount the customer used, if any (Phase 2.7, step 4).
   *
   * `amountCents` above is what we actually charged, i.e. the discounted amount, so
   * the ledger and every receipt stay consistent. These three columns are the
   * explanation: which code, how much came off, and which row to count the
   * redemption against when the payment is confirmed.
   */
  discountCode: varchar("discount_code", { length: 40 }),
  discountCents: integer("discount_cents").notNull().default(0),
  discountCodeId: uuid("discount_code_id"),
  /**
   * Payment-link recovery (Phase 2.7, step 5).
   *
   * When a charge is declined we email the customer the same checkout link plus
   * the transfer/Yape details, so a rejected card does not become a lost sale.
   * `recoveryEmailSentAt` is what makes the automatic send idempotent (providers
   * retry webhooks), and `recoveryEmailCount` counts every message - automatic or
   * sent by an operator - so the console can show what the customer has received.
   */
  recoveryEmailSentAt: timestamp("recovery_email_sent_at"),
  recoveryEmailCount: integer("recovery_email_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("uq_payments_reference").on(table.reference),
  index("idx_payments_business_id").on(table.businessId),
  index("idx_payments_provider_ref").on(table.provider, table.providerRef),
  index("idx_payments_subscription_id").on(table.subscriptionId),
]);

/**
 * Recurring agreement with a provider (Mercado Pago "Suscripciones").
 *
 * One row = the customer's authorisation for the provider to charge them again
 * every period, i.e. the thing that turns this from "sold once" into "sold
 * every month". The individual charges do NOT live here: each one lands in
 * `payments` with `subscriptionId` pointing back at this row, so the billing
 * history stays a plain list of payments.
 *
 * A subscription is deliberately never deleted: when a customer leaves, its
 * status becomes `cancelled` and the row remains as the record of what they
 * authorised.
 */
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  businessId: uuid("business_id").notNull(),
  userId: uuid("user_id"), // who subscribed
  provider: varchar("provider", { length: 30 }).notNull(), // mercadopago
  // Null until the provider answers with its own id (preapproval id).
  providerRef: varchar("provider_ref", { length: 120 }),
  reference: varchar("reference", { length: 40 }).notNull(), // LD-XXXXXX, shown to the customer
  planId: varchar("plan_id", { length: 30 }).notNull(),
  period: varchar("period", { length: 20 }).notNull(), // monthly | annual
  amountCents: integer("amount_cents").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("PEN"),
  payerEmail: varchar("payer_email", { length: 255 }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  // Where the customer goes to authorise the recurring charge.
  initPoint: text("init_point"),
  // When the provider is expected to charge again (informative).
  nextPaymentAt: timestamp("next_payment_at"),
  startedAt: timestamp("started_at"),
  cancelledAt: timestamp("cancelled_at"),
  raw: jsonb("raw"), // sanitized provider payload
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("uq_subscriptions_reference").on(table.reference),
  index("idx_subscriptions_business_id").on(table.businessId),
  index("idx_subscriptions_provider_ref").on(table.provider, table.providerRef),
]);

// Where the platform itself collects money (Phase 2.7, step 3).
//
// A single row (`id = 1`) holding the company's own collection details: the Yape
// number, the bank accounts with their CCI, and where a voucher should be sent.
// These used to live only in `PAYMENTS_MANUAL_INSTRUCTIONS` (an env var), which
// meant a phone number change required a deploy - and they are precisely the text
// a paying customer acts on.
//
// Platform-level on purpose: this is LibroDigital's own bank account, NOT a
// tenant's, so it is not scoped by `businessId` and only the console reads it.
export const platformPaymentSettings = pgTable("platform_payment_settings", {
  /** Always 1: the row is a singleton, so there is never a "which one?" question. */
  id: integer("id").primaryKey().default(1),
  /** Account holder, e.g. "LibroDigital S.A.C." */
  holderName: varchar("holder_name", { length: 160 }),
  holderRuc: varchar("holder_ruc", { length: 20 }),
  yapeNumber: varchar("yape_number", { length: 40 }),
  plinNumber: varchar("plin_number", { length: 40 }),
  /** Where the customer sends the voucher (mailbox and/or WhatsApp). */
  voucherEmail: varchar("voucher_email", { length: 255 }),
  voucherWhatsapp: varchar("voucher_whatsapp", { length: 40 }),
  /** `BankAccountDetails[]` - see `@shared/payment-details`. */
  bankAccounts: jsonb("bank_accounts")
    .$type<BankAccountDetails[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  /** Extra lines appended to the instructions (opening hours, reminders...). */
  notes: text("notes"),
  /** Which operator last changed it - support question "who put that number?". */
  updatedByUserId: uuid("updated_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Operational settings of the platform itself (Phase 2.7, step 4).
//
// One row (`id = 1`), companion to `platformPaymentSettings` but answering a
// different question: that one says *where customers pay*, this one says *how the
// platform behaves and who it is*. Four things live here, all of which used to be
// env-only or hardcoded:
//
//   * `alertEmail`          - where the team is told that a paid subscription could
//                             not be matched to an account (`PAYMENTS_ALERT_EMAIL`).
//   * identity fields       - razón social, RUC, dirección fiscal and the support
//                             contact that appear on receipts, alerts and the site.
//   * `trialDays`           - the length of the free trial (`TRIAL_DAYS`, was 15).
//   * `allowFreePlanChange` - the dangerous flag that activates a plan WITHOUT
//                             collecting money (`PAYMENTS_ALLOW_FREE_PLAN_CHANGE`).
//                             Turning it on is recorded in `platform_config_audit`,
//                             which is the whole reason it may exist at all.
export const platformSettings = pgTable("platform_settings", {
  /** Always 1: a singleton, like `platform_payment_settings`. */
  id: integer("id").primaryKey().default(1),
  /** Where payment alerts are sent. Falls back to `PAYMENTS_ALERT_EMAIL`. */
  alertEmail: varchar("alert_email", { length: 255 }),
  /** Legal identity, used on receipts and in the footer of outgoing mail. */
  legalName: varchar("legal_name", { length: 200 }),
  commercialName: varchar("commercial_name", { length: 200 }),
  ruc: varchar("ruc", { length: 20 }),
  fiscalAddress: text("fiscal_address"),
  contactEmail: varchar("contact_email", { length: 255 }),
  contactPhone: varchar("contact_phone", { length: 40 }),
  website: varchar("website", { length: 255 }),
  /** Free trial length in days; `null` = keep the built-in `TRIAL_DAYS`. */
  trialDays: integer("trial_days"),
  /**
   * The escape hatch for manual invoicing. Defaults to FALSE and is *never*
   * implied by anything else: a plan that activates without money must be a
   * deliberate, audited decision.
   */
  allowFreePlanChange: boolean("allow_free_plan_change").notNull().default(false),
  updatedByUserId: uuid("updated_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Price overrides for the paid plans (Phase 2.7, step 4).
//
// `shared/plans.ts` stays the source of truth for what a plan INCLUDES; this table
// answers only "what do we charge today". A plan with no row keeps the catalogue
// price, so an empty table means "exactly as shipped".
//
// Money is integer céntimos, as everywhere in billing, and the server charges from
// here - the public catalogue (`GET /api/plans`) is generated from the same values,
// so the page a customer reads and the amount we charge cannot disagree.
export const planPricing = pgTable("plan_pricing", {
  planId: varchar("plan_id", { length: 30 }).primaryKey(),
  monthlyCents: integer("monthly_cents").notNull(),
  annualCents: integer("annual_cents").notNull(),
  updatedByUserId: uuid("updated_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Discount codes (Phase 2.7, step 4).
//
// Operator-created, customer-typed: "PRO10", "VERANO2026". The arithmetic lives in
// `@shared/discounts`; this row is the rule it is applied to.
//
// Redemptions are counted when a payment is CONFIRMED (never at checkout), so an
// abandoned checkout does not burn a code, and `maxRedemptions` is enforced by a
// conditional UPDATE - the only way to count a scarce thing correctly.
export const discountCodes = pgTable("discount_codes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  /** Stored normalized (uppercase, A-Z0-9) so `pro-10` finds `PRO10`. */
  code: varchar("code", { length: 40 }).notNull().unique(),
  description: text("description"),
  /** percent | fixed */
  kind: varchar("kind", { length: 20 }).notNull(),
  /** percent: 1-100. fixed: céntimos off. */
  value: integer("value").notNull(),
  /** Plan ids the code applies to; `[]` = every paid plan. */
  planIds: jsonb("plan_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  /** `null` = unlimited redemptions. */
  maxRedemptions: integer("max_redemptions"),
  redemptionCount: integer("redemption_count").notNull().default(0),
  startsAt: timestamp("starts_at"),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").notNull().default(true),
  createdByUserId: uuid("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [index("idx_discount_codes_code").on(table.code)]);

// Console audit trail (Phase 2.7, step 4).
//
// Every change made from the operator console: which operator, which area, and a
// one-line summary a human can read months later. This exists because some of those
// changes are dangerous (the free-plan-change flag, a price), and because "who typed
// that Yape number?" is a real support question.
//
// Deliberately append-only: nothing in the app updates or deletes a row here.
export const platformConfigAudit = pgTable("platform_config_audit", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  /** Who did it. Kept with the email because users can be deleted. */
  userId: uuid("user_id"),
  email: varchar("email", { length: 255 }),
  /** pago | identidad | planes | descuentos | operacion | equipo */
  area: varchar("area", { length: 30 }).notNull(),
  summary: text("summary").notNull(),
  /** Structured before/after, for whoever needs the detail. */
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("idx_platform_config_audit_created").on(table.createdAt)]);

/**
 * AI usage meter (per tenant, per feature).
 *
 * Every model call records its token usage here so a customer can see what the
 * AI is doing and the platform can watch cost. `business_id` is nullable on
 * purpose: the public complaint assistant is platform-funded and has no tenant
 * session. No prompt or completion text is stored - only counts and the model.
 */
export const aiUsage = pgTable("ai_usage", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  businessId: uuid("business_id"),
  userId: uuid("user_id"),
  /** classification | draft | trends | case_summary | abusive_clauses | public_assist | agent | ... */
  feature: varchar("feature", { length: 50 }).notNull(),
  model: varchar("model", { length: 120 }).notNull(),
  /** Base URL of the provider that answered (primary or fallback). */
  provider: varchar("provider", { length: 200 }),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  /** Computed with AI_PRICE_* env vars; 0 when the operator has not set prices. */
  estimatedCostUsd: decimal("estimated_cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_ai_usage_business_created").on(table.businessId, table.createdAt),
  index("idx_ai_usage_feature").on(table.feature),
]);

/**
 * Draft quality feedback (thumbs up/down and one-click acceptance).
 *
 * `rating` is 1 (useful/accepted) or -1 (not useful). `feature` identifies the
 * surface (draft, case_summary, trends, ...), so the acceptance rate can be
 * computed per feature. Deliberately small and append-only.
 */
export const aiFeedback = pgTable("ai_feedback", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  businessId: uuid("business_id").notNull(),
  userId: uuid("user_id"),
  feature: varchar("feature", { length: 50 }).notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  complaintId: uuid("complaint_id"),
  model: varchar("model", { length: 120 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_ai_feedback_business_created").on(table.businessId, table.createdAt),
  index("idx_ai_feedback_feature").on(table.feature),
]);

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  business: one(businesses, {
    fields: [users.businessId],
    references: [businesses.id],
  }),
  businessAccess: many(userBusinessAccess),
}));

export const businessesRelations = relations(businesses, ({ many }) => ({
  users: many(users),
  establishments: many(establishments),
  complaints: many(complaints),
  arcoRequests: many(arcoRequests),
  complianceTracking: many(complianceTracking),
  dataProcessingActivities: many(dataProcessingActivities),
  notifications: many(notifications),
  userAccess: many(userBusinessAccess),
  apiKeys: many(apiKeys),
  webhooks: many(webhooks),
}));

export const userBusinessAccessRelations = relations(userBusinessAccess, ({ one }) => ({
  user: one(users, {
    fields: [userBusinessAccess.userId],
    references: [users.id],
  }),
  business: one(businesses, {
    fields: [userBusinessAccess.businessId],
    references: [businesses.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  business: one(businesses, {
    fields: [apiKeys.businessId],
    references: [businesses.id],
  }),
}));

export const webhooksRelations = relations(webhooks, ({ one }) => ({
  business: one(businesses, {
    fields: [webhooks.businessId],
    references: [businesses.id],
  }),
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
  attachments: many(complaintAttachments),
}));

export const complaintAttachmentsRelations = relations(complaintAttachments, ({ one }) => ({
  complaint: one(complaints, {
    fields: [complaintAttachments.complaintId],
    references: [complaints.id],
  }),
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

export const libroConfigurationRelations = relations(libroConfiguration, ({ one }) => ({
  business: one(businesses, {
    fields: [libroConfiguration.businessId],
    references: [businesses.id],
  }),
  user: one(users, {
    fields: [libroConfiguration.userId],
    references: [users.id],
  }),
}));

export const authAuditLogRelations = relations(authAuditLog, ({ one }) => ({
  user: one(users, {
    fields: [authAuditLog.userId],
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

/**
 * The only business fields a tenant user may submit. Commercial lifecycle
 * (plan, subscription status, trial dates) is assigned by the server and the
 * billing flow - never accepted from the client, otherwise any user could
 * self-upgrade to a higher plan or reactivate a suspended tenant.
 */
export const businessProfileSchema = insertBusinessSchema.omit({
  isActive: true,
  subscriptionPlan: true,
  subscriptionStatus: true,
  trialEndsAt: true,
  planPeriod: true,
  currentPeriodEnd: true,
});

/** Profile fields a business admin may edit on an existing tenant. */
export const businessUpdateSchema = businessProfileSchema
  .omit({ ruc: true }) // the RUC is the legal identity; it never changes here
  .partial()
  .extend({ isActive: z.boolean().optional() });

/**
 * Public URL slug (`librodigital.pe/<slug>`).
 *
 * Validated server-side too, not only in the form: the slug becomes a public
 * address, so anything but lowercase letters, digits and dashes would produce a
 * broken (or worse, ambiguous) link.
 */
export const libroSlugSchema = z
  .string()
  .trim()
  .max(100, "La URL pública no puede superar 100 caracteres")
  .regex(
    /^[a-z0-9-]+$/,
    "La URL pública solo puede contener letras minúsculas, números y guiones",
  );

/**
 * The Libro de Reclamaciones a company starts with, as collected by the
 * "Nueva Empresa" form (the wizard collects the same fields in step 2).
 *
 * The name is the one visible thing a tenant recognises its book by, so it is
 * required; the URL is optional because the server derives it from the name
 * (`libroSlugFrom`) when the form does not send one - a taken URL must not turn
 * a registration into a dead end.
 */
export const libroRegistrationSchema = z.object({
  libroName: z.string().trim().min(1, "El nombre del libro es obligatorio").max(200),
  businessType: z.enum(["tienda_virtual", "local_fisico", "servicios", "mixto"]),
  urlSlug: libroSlugSchema.optional(),
  /** Defaults to the caller's own address: that is where complaints are notified. */
  notificationEmail: z.string().trim().email("Email de notificaciones inválido").optional(),
  whatsappNumber: z.string().trim().max(20).optional(),
  websiteUrl: z.string().trim().max(255).optional(),
});

/**
 * Body of `POST /api/businesses`: a company plus the Libro it starts with.
 *
 * Profile + booking data in one payload because they are written in one
 * transaction: a tenant used to be created with no Libro at all, which left its
 * "Libros" page empty and its public book inexistent.
 */
export const businessRegistrationSchema = businessProfileSchema.extend({
  libro: libroRegistrationSchema,
});

export const insertEstablishmentSchema = createInsertSchema(establishments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBookSchema = createInsertSchema(books).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertComplaintSchema = createInsertSchema(complaints).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

/**
 * Payload accepted by the public complaint form. The correlative number,
 * due date and submission date are generated by the server, and every
 * staff/moderation field is stripped: a consumer (or an API-key client) must
 * never pre-set the workflow state, the provider's response, the assignee or
 * the retention/archival flags of a legal record.
 */
export const complaintSubmissionSchema = insertComplaintSchema
  .omit({
    correlativeNumber: true,
    dueDate: true,
    submissionDate: true,
    // Staff workflow state - server-managed only
    status: true,
    priority: true,
    assignedToUserId: true,
    // Provider response - the consumer must not forge it
    providerActions: true,
    providerResponse: true,
    responseDate: true,
    // SLA / retention lifecycle - server-managed only
    isOverdue: true,
    archivedAt: true,
    retentionPurgedAt: true,
    // AI enrichment - server-generated only
    aiClassification: true,
    aiSuggestedResponse: true,
    aiRiskLevel: true,
    // Legacy attachment metadata column (real attachments live in
    // complaint_attachments via the evidence upload endpoint)
    attachments: true,
  })
  .extend({
    responseMethod: z.enum(['email', 'letter']).optional(),
    // Accepts an ISO date string from the browser and coerces it to a Date
    purchaseDate: z.coerce.date().nullish(),
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

export const insertLoginAttemptSchema = createInsertSchema(loginAttempts).omit({
  id: true,
  createdAt: true,
});

export const insertAuthAuditLogSchema = createInsertSchema(authAuditLog).omit({
  id: true,
  createdAt: true,
});

export const insertLibroConfigurationSchema = createInsertSchema(libroConfiguration).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertComplaintAttachmentSchema = createInsertSchema(complaintAttachments).omit({
  id: true,
  uploadedAt: true,
});

export const insertUserBusinessAccessSchema = createInsertSchema(userBusinessAccess).omit({
  id: true,
  createdAt: true,
});

export const insertBusinessAccessRequestSchema = createInsertSchema(businessAccessRequests).omit({
  id: true,
  status: true,
  decidedByUserId: true,
  decidedAt: true,
  createdAt: true,
  updatedAt: true,
});

/**
 * Payload a login sends to ask for access to an already-registered RUC. The
 * business is resolved from the RUC server-side; the requester never supplies a
 * business id.
 */
export const businessAccessRequestSchema = z.object({
  ruc: z.string().trim().regex(/^\d{11}$/, "El RUC debe tener 11 dígitos"),
  message: z.string().trim().max(500, "El mensaje no puede superar 500 caracteres").optional(),
});

/** Outcome of a decision, as sent by the business administrator. */
export const businessAccessDecisionSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  createdAt: true,
});

export const insertWebhookSchema = createInsertSchema(webhooks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

/**
 * Normalization applied to every email that identifies an account.
 *
 * Emails reach us auto-capitalized (phones, Outlook autocorrect) and with a
 * stray space from a copy-paste, while the `users.email` UNIQUE constraint is
 * case-sensitive. Without this, "Jan@Gmail.com" would register a SECOND
 * account for the same person and then the login typed in lowercase would
 * fail - the exact "my account does not exist" support ticket this avoids.
 * One normalization rule, shared by signup, login and recovery so the three
 * paths can never disagree about who someone is.
 */
export const accountEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Email inválido")
  .max(255);

// Auth-specific schemas for the 2-step onboarding
export const userRegistrationSchema = z.object({
  firstName: z.string().trim().min(2, "Nombre debe tener al menos 2 caracteres").max(100),
  lastName: z.string().trim().min(2, "Apellido debe tener al menos 2 caracteres").max(100),
  email: accountEmailSchema,
});

export const loginSchema = z.object({
  email: accountEmailSchema,
  password: z.string().min(1, "Contraseña requerida"),
});

/** Step 1 of the code login: ask for a one-time code by email. */
export const requestLoginCodeSchema = z.object({
  email: accountEmailSchema,
});

/**
 * Step 2 of the code login: the six digits from the email.
 *
 * Digits only and a fixed length, so a mistyped paste fails validation instead
 * of counting as a wrong code against the account's attempt counter.
 */
export const loginCodeSchema = z.object({
  email: accountEmailSchema,
  code: z.string().trim().regex(/^\d{6}$/, "El código tiene 6 dígitos"),
});

/**
 * Minimum password length, shared by every entry point that sets a password
 * (team-member creation, change-password, password reset) so the rule cannot
 * drift between them.
 */
export const MIN_PASSWORD_LENGTH = 8;

/** Step 1 of password recovery: request a reset link. */
export const forgotPasswordSchema = z.object({
  email: accountEmailSchema,
});

/**
 * Email verification: the token from the "confirma tu correo" link.
 *
 * 32 random bytes as hex (64 chars) is what we issue, so anything shorter than
 * the reset-token floor cannot be one of ours.
 */
export const emailVerificationSchema = z.object({
  token: z
    .string()
    .trim()
    .min(16, "Token inválido")
    .max(255, "Token inválido"),
});

/** Step 2 of password recovery: consume the token and set the new password. */
export const resetPasswordSchema = z.object({
  token: z
    .string()
    .trim()
    .min(16, "Token inválido")
    .max(255, "Token inválido"),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`)
    .max(200),
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Business = typeof businesses.$inferSelect;
export type InsertBusiness = z.infer<typeof insertBusinessSchema>;
/** What a tenant may submit when registering a company (no plan lifecycle). */
export type BusinessProfile = z.infer<typeof businessProfileSchema>;
/** Editable company profile fields (RUC and plan excluded by design). */
export type BusinessUpdate = z.infer<typeof businessUpdateSchema>;
/** The Libro fields `POST /api/businesses` accepts next to the company profile. */
export type LibroRegistration = z.infer<typeof libroRegistrationSchema>;
/** Full "Nueva Empresa" payload: company profile + the Libro it starts with. */
export type BusinessRegistration = z.infer<typeof businessRegistrationSchema>;

export type Establishment = typeof establishments.$inferSelect;
export type InsertEstablishment = z.infer<typeof insertEstablishmentSchema>;

export type Book = typeof books.$inferSelect;
export type InsertBook = z.infer<typeof insertBookSchema>;

export type Complaint = typeof complaints.$inferSelect;
export type InsertComplaint = z.infer<typeof insertComplaintSchema>;
export type ComplaintSubmission = z.infer<typeof complaintSubmissionSchema>;

export type ComplaintAuditLog = typeof complaintAuditLog.$inferSelect;

export type ArcoRequest = typeof arcoRequests.$inferSelect;
export type InsertArcoRequest = z.infer<typeof insertArcoRequestSchema>;

export type ComplianceTracking = typeof complianceTracking.$inferSelect;
export type InsertComplianceTracking = z.infer<typeof insertComplianceTrackingSchema>;

export type DataProcessingActivity = typeof dataProcessingActivities.$inferSelect;
export type InsertDataProcessingActivity = z.infer<typeof insertDataProcessingActivitySchema>;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type InsertLoginAttempt = z.infer<typeof insertLoginAttemptSchema>;

export type AuthAuditLog = typeof authAuditLog.$inferSelect;
export type InsertAuthAuditLog = z.infer<typeof insertAuthAuditLogSchema>;

export type LibroConfiguration = typeof libroConfiguration.$inferSelect;
export type InsertLibroConfiguration = z.infer<typeof insertLibroConfigurationSchema>;

export type ComplaintAttachment = typeof complaintAttachments.$inferSelect;
export type InsertComplaintAttachment = z.infer<typeof insertComplaintAttachmentSchema>;

export type UserBusinessAccess = typeof userBusinessAccess.$inferSelect;
export type InsertUserBusinessAccess = z.infer<typeof insertUserBusinessAccessSchema>;

export type BusinessAccessRequest = typeof businessAccessRequests.$inferSelect;
export type InsertBusinessAccessRequest = z.infer<typeof insertBusinessAccessRequestSchema>;

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;

export type Webhook = typeof webhooks.$inferSelect;
export type InsertWebhook = z.infer<typeof insertWebhookSchema>;

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;

/**
 * The singleton row with the platform's own collection details. The console edits
 * it; whoever builds the offline-payment instructions reads it.
 */
export type PlatformPaymentSettings = typeof platformPaymentSettings.$inferSelect;
export type InsertPlatformPaymentSettings = typeof platformPaymentSettings.$inferInsert;

/** Operational settings of the platform (singleton row): identity, alerts, flags. */
export type PlatformSettings = typeof platformSettings.$inferSelect;
export type InsertPlatformSettings = typeof platformSettings.$inferInsert;

/** Price override for one paid plan (absent = the catalogue price applies). */
export type PlanPricing = typeof planPricing.$inferSelect;
export type InsertPlanPricing = typeof planPricing.$inferInsert;

/** A discount code an operator created. */
export type DiscountCode = typeof discountCodes.$inferSelect;
export type InsertDiscountCode = typeof discountCodes.$inferInsert;

/** One entry of the console's change history. */
export type PlatformConfigAudit = typeof platformConfigAudit.$inferSelect;
export type InsertPlatformConfigAudit = typeof platformConfigAudit.$inferInsert;

export type AIUsage = typeof aiUsage.$inferSelect;
export type InsertAIUsage = typeof aiUsage.$inferInsert;

export type AIFeedback = typeof aiFeedback.$inferSelect;
export type InsertAIFeedback = typeof aiFeedback.$inferInsert;


/** Public (safe) projection of an API key - never exposes the hash. */
export type ApiKeyPublic = Omit<ApiKey, "keyHash">;

export type UserRegistration = z.infer<typeof userRegistrationSchema>;
export type LoginData = z.infer<typeof loginSchema>;
export type RequestLoginCodeData = z.infer<typeof requestLoginCodeSchema>;
export type LoginCodeData = z.infer<typeof loginCodeSchema>;
export type ForgotPasswordData = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordData = z.infer<typeof resetPasswordSchema>;
