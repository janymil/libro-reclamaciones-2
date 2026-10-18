-- ============================================================================
-- Integrations hardening (API + webhooks)
-- ============================================================================
-- 1. `webhooks.include_consumer_data`: lets a receiver opt out of the consumer
--    PII block. The default preserves the payload of every webhook created
--    before this change.
-- 2. `webhook_deliveries`: durable delivery log + retry queue / dead-letter.
--    It stores only a pointer (complaint id + event); the payload is rebuilt
--    from the complaint on each attempt, so consumer PII is never duplicated
--    into a second table.
--
-- Idempotent (`IF NOT EXISTS`) and listed in migrations/meta/_journal.json so
-- the embedded PGlite dev database applies it automatically. Neon needs:
--   npm run db:apply -- migrations/0016_integrations_hardening.sql
-- ============================================================================

ALTER TABLE "webhooks" ADD COLUMN IF NOT EXISTS "include_consumer_data" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL,
  "webhook_id" uuid NOT NULL,
  "complaint_id" uuid NOT NULL,
  "event" varchar(50) NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp DEFAULT now() NOT NULL,
  "last_status_code" integer,
  "last_error" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "delivered_at" timestamp
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_webhook_deliveries_business" ON "webhook_deliveries" ("business_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_webhook_deliveries_webhook" ON "webhook_deliveries" ("webhook_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_webhook_deliveries_due" ON "webhook_deliveries" ("status","next_attempt_at");
