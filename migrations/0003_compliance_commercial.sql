-- ============================================================================
-- Compliance & commercial roadmap (Phases 1-3)
-- ============================================================================
-- Adds:
--   * complaint evidence attachments (Phase 1.1)
--   * 2-year retention bookkeeping on complaints (Phase 1.2)
--   * trial/plan lifecycle columns on businesses (Phase 2.6)
--   * per-business branding/template/AI-voice columns on libro_configuration
--     (Phase 2.8 / 3.10)
--   * multi-RUC access, API keys and webhooks (Phase 2.7 / 3.12)
--
-- Idempotent (`IF NOT EXISTS`) so it can be applied to databases that
-- already received part of these changes via `drizzle-kit push`.
-- ============================================================================

-- Phase 1.2: retention bookkeeping on complaints ------------------------------
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "archived_at" timestamp;
--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "retention_purged_at" timestamp;
--> statement-breakpoint

-- Phase 2.6: plan lifecycle on businesses -------------------------------------
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "subscription_status" varchar(30) NOT NULL DEFAULT 'trialing';
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "trial_ends_at" timestamp;
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "plan_period" varchar(20) NOT NULL DEFAULT 'monthly';
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "current_period_end" timestamp;
--> statement-breakpoint

-- Phase 2.8 / 3.10: configurable templates and AI brand voice -----------------
ALTER TABLE "libro_configuration" ADD COLUMN IF NOT EXISTS "brand_color" varchar(20);
--> statement-breakpoint
ALTER TABLE "libro_configuration" ADD COLUMN IF NOT EXISTS "email_subject_prefix" varchar(120);
--> statement-breakpoint
ALTER TABLE "libro_configuration" ADD COLUMN IF NOT EXISTS "email_header_text" text;
--> statement-breakpoint
ALTER TABLE "libro_configuration" ADD COLUMN IF NOT EXISTS "email_footer_text" text;
--> statement-breakpoint
ALTER TABLE "libro_configuration" ADD COLUMN IF NOT EXISTS "confirmation_message" text;
--> statement-breakpoint
ALTER TABLE "libro_configuration" ADD COLUMN IF NOT EXISTS "brand_tone" text;
--> statement-breakpoint
ALTER TABLE "libro_configuration" ADD COLUMN IF NOT EXISTS "brand_policies" text;
--> statement-breakpoint

-- Phase 1.1: evidence attachments ----------------------------------------------
CREATE TABLE IF NOT EXISTS "complaint_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "complaint_id" uuid NOT NULL,
  "file_name" varchar(255) NOT NULL,
  "original_name" varchar(255) NOT NULL,
  "mime_type" varchar(100) NOT NULL,
  "file_size" integer NOT NULL,
  "uploaded_at" timestamp NOT NULL DEFAULT now(),
  "deleted_at" timestamp
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_attachments_complaint_id" ON "complaint_attachments" ("complaint_id");
--> statement-breakpoint

-- Phase 2.7: multi-RUC access ---------------------------------------------------
CREATE TABLE IF NOT EXISTS "user_business_access" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "business_id" uuid NOT NULL,
  "role" varchar(50) NOT NULL DEFAULT 'admin',
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_business_access" ON "user_business_access" ("user_id", "business_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_business_access_user_id" ON "user_business_access" ("user_id");
--> statement-breakpoint

-- Phase 3.12: API keys ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS "api_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id" uuid NOT NULL,
  "name" varchar(100) NOT NULL,
  "key_prefix" varchar(20) NOT NULL,
  "key_hash" text NOT NULL,
  "last_used_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_api_keys_business_id" ON "api_keys" ("business_id");
--> statement-breakpoint

-- Phase 3.12: outgoing webhooks --------------------------------------------------
CREATE TABLE IF NOT EXISTS "webhooks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id" uuid NOT NULL,
  "url" varchar(500) NOT NULL,
  "secret" varchar(100) NOT NULL,
  "events" jsonb,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_webhooks_business_id" ON "webhooks" ("business_id");
