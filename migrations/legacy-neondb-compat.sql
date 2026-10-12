-- ============================================================================
-- Compatibility migration: legacy `neondb` schema -> current app schema
-- ============================================================================
-- The original database was created by an earlier version of this application
-- that used a Spanish naming convention:
--   companies / establishments.company_id / establishments.nombre
--   complaints.consumidor_* / complaints.numero_correlativo / arco_requests.tipo
--
-- This migration is strictly ADDITIVE. It creates the tables that are missing
-- and adds + backfills the columns the current code expects. Legacy tables,
-- columns and rows are never dropped or overwritten, so no data is lost.
--
-- Apply with:  npm run db:apply migrations/legacy-neondb-compat.sql
-- It is idempotent and safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tables that do not exist yet in the legacy database
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"establishment_id" uuid NOT NULL,
	"book_type" varchar(50) DEFAULT 'reclamos' NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "complaint_audit_log" (
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
CREATE TABLE IF NOT EXISTS "compliance_tracking" (
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
CREATE TABLE IF NOT EXISTS "data_processing_activities" (
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
CREATE TABLE IF NOT EXISTS "notifications" (
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
CREATE INDEX IF NOT EXISTS "idx_books_business_id" ON "books" USING btree ("business_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_books_establishment_id" ON "books" USING btree ("establishment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_complaint_id" ON "complaint_audit_log" USING btree ("complaint_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_compliance_business_id" ON "compliance_tracking" USING btree ("business_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_data_processing_business_id" ON "data_processing_activities" USING btree ("business_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notifications_business_id" ON "notifications" USING btree ("business_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notifications_user_id" ON "notifications" USING btree ("user_id");
--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- 2. establishments: add the English columns the app reads, backfill from the
--    legacy Spanish columns (company_id / nombre / direccion / telefono /
--    active / correlative_number). Legacy columns are preserved.
-- ---------------------------------------------------------------------------
ALTER TABLE "establishments" ADD COLUMN IF NOT EXISTS "business_id" uuid;
--> statement-breakpoint
ALTER TABLE "establishments" ADD COLUMN IF NOT EXISTS "name" text;
--> statement-breakpoint
ALTER TABLE "establishments" ADD COLUMN IF NOT EXISTS "address" text;
--> statement-breakpoint
ALTER TABLE "establishments" ADD COLUMN IF NOT EXISTS "phone" varchar(20);
--> statement-breakpoint
ALTER TABLE "establishments" ADD COLUMN IF NOT EXISTS "identification_code" varchar(50);
--> statement-breakpoint
ALTER TABLE "establishments" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true;
--> statement-breakpoint
UPDATE "establishments" SET
	"business_id" = COALESCE("business_id", "company_id"),
	"name" = COALESCE("name", "nombre"),
	"address" = COALESCE("address", "direccion"),
	"phone" = COALESCE("phone", "telefono"),
	"identification_code" = COALESCE(
		"identification_code",
		'SUC-' || lpad(COALESCE("correlative_number", 0)::text, 3, '0')
	),
	"is_active" = COALESCE("is_active", "active", true);
--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- 3. complaints: add the English columns the app reads, backfill from the
--    legacy Spanish columns. Legacy columns are preserved.
-- ---------------------------------------------------------------------------
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "consumer_full_name" text;
--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "consumer_document_type" varchar(20);
--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "consumer_document_number" varchar(20);
--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "consumer_address" text;
--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "consumer_phone" varchar(20);
--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "consumer_email" varchar(255);
--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "guardian_full_name" text;
--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "guardian_document_type" varchar(20);
--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "guardian_document_number" varchar(20);
--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "guardian_relationship" varchar(50);
--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "product_service_name" text;
--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "product_service_description" text;
--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "purchase_amount" numeric(10, 2);
--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "purchase_date" timestamp;
--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "receipt_number" varchar(100);
--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "complaint_detail" text;
--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "consumer_request" text;
--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "provider_actions" text;
--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "provider_response" text;
--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "response_date" timestamp;
--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "response_method" varchar(50);
--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "submission_date" timestamp;
--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "due_date" timestamp;
--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "ai_classification" jsonb;
--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "ai_suggested_response" text;
--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "ai_risk_level" varchar(20);
--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "attachments" jsonb;
--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "consent_given" boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "privacy_policy_version" varchar(50);
--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- 4. arco_requests: add the English columns the app reads
-- ---------------------------------------------------------------------------
ALTER TABLE "arco_requests" ADD COLUMN IF NOT EXISTS "business_id" uuid;
--> statement-breakpoint
ALTER TABLE "arco_requests" ADD COLUMN IF NOT EXISTS "request_type" varchar(20);
--> statement-breakpoint
ALTER TABLE "arco_requests" ADD COLUMN IF NOT EXISTS "requester_name" text;
--> statement-breakpoint
ALTER TABLE "arco_requests" ADD COLUMN IF NOT EXISTS "requester_email" varchar(255);
--> statement-breakpoint
ALTER TABLE "arco_requests" ADD COLUMN IF NOT EXISTS "requester_document_type" varchar(20);
--> statement-breakpoint
ALTER TABLE "arco_requests" ADD COLUMN IF NOT EXISTS "requester_document_number" varchar(20);
--> statement-breakpoint
ALTER TABLE "arco_requests" ADD COLUMN IF NOT EXISTS "request_detail" text;
--> statement-breakpoint
ALTER TABLE "arco_requests" ADD COLUMN IF NOT EXISTS "status" varchar(50) DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE "arco_requests" ADD COLUMN IF NOT EXISTS "response" text;
--> statement-breakpoint
ALTER TABLE "arco_requests" ADD COLUMN IF NOT EXISTS "response_date" timestamp;
--> statement-breakpoint
ALTER TABLE "arco_requests" ADD COLUMN IF NOT EXISTS "due_date" timestamp;
--> statement-breakpoint
UPDATE "arco_requests" SET
	"business_id" = COALESCE("business_id", "company_id"),
	"request_type" = COALESCE("request_type", lower("tipo")),
	"requester_name" = COALESCE("requester_name", trim(concat_ws(' ', "solicitante_nombres", "solicitante_apellidos"))),
	"requester_email" = COALESCE("requester_email", "solicitante_email"),
	"requester_document_number" = COALESCE("requester_document_number", "solicitante_documento"),
	"request_detail" = COALESCE("request_detail", "detalle_solicitud"),
	"status" = COALESCE("status", lower("estado"), 'pending'),
	"response" = COALESCE("response", "respuesta"),
	"response_date" = COALESCE("response_date", "fecha_respuesta"),
	"due_date" = COALESCE("due_date", "fecha_limite");
--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- 5. Bridge the legacy `companies` rows into `businesses` (reusing the same
--    primary key) so the example establishments and complaints remain
--    reachable through the application. Existing businesses are untouched.
-- ---------------------------------------------------------------------------
INSERT INTO "businesses" (
	"id", "ruc", "business_name", "commercial_name", "phone", "address",
	"distrito", "provincia", "departamento", "is_active", "subscription_plan",
	"created_at", "updated_at"
)
SELECT
	c."id",
	c."ruc",
	c."razon_social",
	c."nombre_comercial",
	e."telefono",
	COALESCE(e."direccion", 'Sin dirección registrada'),
	COALESCE(e."distrito", '-'),
	COALESCE(e."provincia", '-'),
	COALESCE(e."departamento", '-'),
	COALESCE(c."active", true),
	'basic',
	COALESCE(c."created_at", now()),
	COALESCE(c."updated_at", now())
FROM "companies" c
LEFT JOIN LATERAL (
	SELECT * FROM "establishments"
	WHERE "company_id" = c."id"
	ORDER BY "correlative_number" NULLS LAST
	LIMIT 1
) e ON true
WHERE NOT EXISTS (SELECT 1 FROM "businesses" b WHERE b."id" = c."id");
--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- 6. Backfill the example complaints from their legacy Spanish columns
-- ---------------------------------------------------------------------------
UPDATE "complaints" c
SET "business_id" = e."business_id"
FROM "establishments" e
WHERE c."establishment_id" = e."id" AND c."business_id" IS NULL;
--> statement-breakpoint
UPDATE "complaints" SET "correlative_number" = "numero_correlativo"
WHERE "correlative_number" IS NULL AND "numero_correlativo" IS NOT NULL;
--> statement-breakpoint
UPDATE "complaints" SET "complaint_type" = CASE upper(trim("tipo"))
	WHEN 'RECLAMO' THEN 'reclamo'
	WHEN 'QUEJA' THEN 'queja'
	ELSE lower(trim("tipo")) END
WHERE "complaint_type" IS NULL AND "tipo" IS NOT NULL;
--> statement-breakpoint
UPDATE "complaints" SET "status" = CASE upper(trim("estado"))
	WHEN 'NUEVA' THEN 'new'
	WHEN 'NUEVO' THEN 'new'
	WHEN 'EN_PROCESO' THEN 'in_progress'
	WHEN 'EN PROCESO' THEN 'in_progress'
	WHEN 'RESPONDIDA' THEN 'responded'
	WHEN 'RESPONDIDO' THEN 'responded'
	WHEN 'RESUELTA' THEN 'resolved'
	WHEN 'RESUELTO' THEN 'resolved'
	ELSE COALESCE("status", 'new') END
WHERE "estado" IS NOT NULL;
--> statement-breakpoint
UPDATE "complaints" SET
	"consumer_full_name" = COALESCE("consumer_full_name", NULLIF(trim(concat_ws(' ', "consumidor_nombres", "consumidor_apellidos")), ''), 'No especificado'),
	"consumer_document_type" = COALESCE("consumer_document_type", "consumidor_tipo_documento", ''),
	"consumer_document_number" = COALESCE("consumer_document_number", "consumidor_numero_documento", ''),
	"consumer_address" = COALESCE("consumer_address", "consumidor_domicilio", ''),
	"consumer_phone" = COALESCE("consumer_phone", "consumidor_telefono", ''),
	"consumer_email" = COALESCE("consumer_email", "consumidor_email", ''),
	"guardian_full_name" = COALESCE("guardian_full_name", NULLIF(trim(concat_ws(' ', "representante_nombres", "representante_apellidos")), '')),
	"guardian_document_type" = COALESCE("guardian_document_type", "representante_tipo_documento"),
	"guardian_document_number" = COALESCE("guardian_document_number", "representante_numero_documento"),
	"product_service_name" = COALESCE("product_service_name", "producto_servicio", 'No especificado'),
	"complaint_detail" = COALESCE("complaint_detail", "detalle_reclamacion", 'Sin detalle'),
	"consumer_request" = COALESCE("consumer_request", "pedido_consumidor"),
	"provider_response" = COALESCE("provider_response", "respuesta_proveedor"),
	"submission_date" = COALESCE("submission_date", "fecha_presentacion"),
	"due_date" = COALESCE("due_date", "fecha_limite_respuesta"),
	"response_date" = COALESCE("response_date", "fecha_respuesta"),
	"consent_given" = COALESCE("consent_given", true)
WHERE "numero_correlativo" IS NOT NULL OR "consumidor_nombres" IS NOT NULL;
--> statement-breakpoint
UPDATE "complaints" SET "is_overdue" = (
	"response_date" IS NULL
	AND "due_date" IS NOT NULL
	AND "due_date" < now()
	AND COALESCE("status", 'new') IN ('new', 'in_progress')
)
WHERE "numero_correlativo" IS NOT NULL;
--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- 7. users: the current schema requires a role (column default is 'admin')
-- ---------------------------------------------------------------------------
UPDATE "users" SET "role" = 'admin' WHERE "role" IS NULL;




