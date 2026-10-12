CREATE TABLE "arco_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"request_type" varchar(20) NOT NULL,
	"requester_name" text NOT NULL,
	"requester_email" varchar(255) NOT NULL,
	"requester_document_type" varchar(20) NOT NULL,
	"requester_document_number" varchar(20) NOT NULL,
	"request_detail" text NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"response" text,
	"response_date" timestamp,
	"due_date" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" varchar(100) NOT NULL,
	"email" varchar(255) NOT NULL,
	"ip_address" varchar(45) NOT NULL,
	"user_agent" text,
	"success" boolean NOT NULL,
	"failure_reason" varchar(200),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ruc" varchar(11) NOT NULL,
	"business_name" text NOT NULL,
	"commercial_name" text,
	"phone" varchar(20),
	"address" text NOT NULL,
	"distrito" varchar(100) NOT NULL,
	"provincia" varchar(100) NOT NULL,
	"departamento" varchar(100) NOT NULL,
	"website" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"subscription_plan" varchar(50) DEFAULT 'basic' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "businesses_ruc_unique" UNIQUE("ruc")
);
--> statement-breakpoint
CREATE TABLE "complaint_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"complaint_id" uuid NOT NULL,
	"user_id" uuid,
	"action" varchar(100) NOT NULL,
	"old_values" jsonb,
	"new_values" jsonb,
	"notes" text,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "complaints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"establishment_id" uuid NOT NULL,
	"correlative_number" varchar(50) NOT NULL,
	"complaint_type" varchar(20) NOT NULL,
	"consumer_full_name" text NOT NULL,
	"consumer_document_type" varchar(20) NOT NULL,
	"consumer_document_number" varchar(20) NOT NULL,
	"consumer_address" text NOT NULL,
	"consumer_phone" varchar(20) NOT NULL,
	"consumer_email" varchar(255) NOT NULL,
	"guardian_full_name" text,
	"guardian_document_type" varchar(20),
	"guardian_document_number" varchar(20),
	"guardian_relationship" varchar(50),
	"product_service_name" text NOT NULL,
	"product_service_description" text,
	"purchase_amount" numeric(10, 2),
	"purchase_date" timestamp,
	"receipt_number" varchar(100),
	"complaint_detail" text NOT NULL,
	"consumer_request" text,
	"status" varchar(50) DEFAULT 'new' NOT NULL,
	"priority" varchar(20) DEFAULT 'normal' NOT NULL,
	"assigned_to_user_id" uuid,
	"provider_actions" text,
	"provider_response" text,
	"response_date" timestamp,
	"response_method" varchar(50),
	"submission_date" timestamp DEFAULT now() NOT NULL,
	"due_date" timestamp NOT NULL,
	"is_overdue" boolean DEFAULT false NOT NULL,
	"ai_classification" jsonb,
	"ai_suggested_response" text,
	"ai_risk_level" varchar(20),
	"attachments" jsonb,
	"consent_given" boolean DEFAULT false NOT NULL,
	"privacy_policy_version" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_tracking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"compliance_type" varchar(100) NOT NULL,
	"status" varchar(50) NOT NULL,
	"due_date" timestamp,
	"completed_date" timestamp,
	"notes" text,
	"document_url" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_processing_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"activity_name" text NOT NULL,
	"purpose" text NOT NULL,
	"data_categories" jsonb NOT NULL,
	"data_subjects" jsonb NOT NULL,
	"legal_basis" varchar(100) NOT NULL,
	"retention_period" varchar(100) NOT NULL,
	"security_measures" jsonb,
	"data_transfers" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "establishments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"phone" varchar(20),
	"email" varchar(255),
	"identification_code" varchar(50) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "libro_configuration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"libro_name" text NOT NULL,
	"url_slug" varchar(100) NOT NULL,
	"business_type" varchar(50) NOT NULL,
	"notification_email" varchar(255) NOT NULL,
	"whatsapp_number" varchar(20),
	"website_url" varchar(255),
	"logo_url" varchar(500),
	"logo_file_name" varchar(255),
	"logo_file_size" integer,
	"logo_mime_type" varchar(100),
	"is_active" boolean DEFAULT true NOT NULL,
	"configuration_completed" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "libro_configuration_business_id_unique" UNIQUE("business_id"),
	CONSTRAINT "libro_configuration_url_slug_unique" UNIQUE("url_slug")
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"ip_address" varchar(45) NOT NULL,
	"user_agent" text,
	"success" boolean NOT NULL,
	"failure_reason" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"user_id" uuid,
	"type" varchar(50) NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"related_entity_type" varchar(50),
	"related_entity_id" uuid,
	"scheduled_for" timestamp,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password" text NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"role" varchar(50) DEFAULT 'admin' NOT NULL,
	"business_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_email_verified" boolean DEFAULT false NOT NULL,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"account_locked_until" timestamp,
	"last_login_at" timestamp,
	"password_reset_token" varchar(255),
	"password_reset_expires" timestamp,
	"email_verification_token" varchar(255),
	"email_verification_expires" timestamp,
	"onboarding_step" integer DEFAULT 1 NOT NULL,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX "idx_arco_business_id" ON "arco_requests" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "idx_auth_audit_user_id" ON "auth_audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_auth_audit_email" ON "auth_audit_log" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_auth_audit_action" ON "auth_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_auth_audit_created" ON "auth_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_complaint_id" ON "complaint_audit_log" USING btree ("complaint_id");--> statement-breakpoint
CREATE INDEX "idx_complaints_business_id" ON "complaints" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "idx_complaints_establishment_id" ON "complaints" USING btree ("establishment_id");--> statement-breakpoint
CREATE INDEX "idx_complaints_status" ON "complaints" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_complaints_due_date" ON "complaints" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "idx_complaints_correlative" ON "complaints" USING btree ("correlative_number");--> statement-breakpoint
CREATE INDEX "idx_compliance_business_id" ON "compliance_tracking" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "idx_data_processing_business_id" ON "data_processing_activities" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "idx_establishments_business_id" ON "establishments" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "idx_libro_config_business_id" ON "libro_configuration" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "idx_libro_config_url_slug" ON "libro_configuration" USING btree ("url_slug");--> statement-breakpoint
CREATE INDEX "idx_login_attempts_email" ON "login_attempts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_login_attempts_ip" ON "login_attempts" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "idx_login_attempts_created" ON "login_attempts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_business_id" ON "notifications" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_user_id" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_users_business_id" ON "users" USING btree ("business_id");