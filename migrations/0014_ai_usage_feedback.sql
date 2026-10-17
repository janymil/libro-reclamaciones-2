-- ============================================================================
-- AI usage meter + draft feedback loop
-- ============================================================================
-- `ai_usage` records tokens per model call (per tenant and feature) so the
-- customer sees the AI working and the platform can watch cost. No prompt or
-- completion text is stored, only counts/model/provider.
--
-- `ai_feedback` stores thumbs up/down and one-click draft acceptance, which is
-- what makes the "acceptance rate" per feature possible.
--
-- Idempotent (`IF NOT EXISTS`) so it can be applied on top of a database that
-- already received the tables via `drizzle-kit push`, and listed in
-- migrations/meta/_journal.json so the embedded PGlite dev database applies it.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "ai_usage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id" uuid,
  "user_id" uuid,
  "feature" varchar(50) NOT NULL,
  "model" varchar(120) NOT NULL,
  "provider" varchar(200),
  "prompt_tokens" integer NOT NULL DEFAULT 0,
  "completion_tokens" integer NOT NULL DEFAULT 0,
  "total_tokens" integer NOT NULL DEFAULT 0,
  "estimated_cost_usd" numeric(12, 6) NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_usage_business_created" ON "ai_usage" ("business_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_usage_feature" ON "ai_usage" ("feature");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id" uuid NOT NULL,
  "user_id" uuid,
  "feature" varchar(50) NOT NULL,
  "rating" integer NOT NULL,
  "comment" text,
  "complaint_id" uuid,
  "model" varchar(120),
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_feedback_business_created" ON "ai_feedback" ("business_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_feedback_feature" ON "ai_feedback" ("feature");
