-- ============================================================================
-- Recurring subscriptions (Phase 2.7, step 2)
-- ============================================================================
-- Checkout Pro charges once. A SaaS is sold every month, so the recurring rail
-- is Mercado Pago "Suscripciones" (the preapproval API), which is available for
-- Peru and lets the provider charge the customer again every period.
--
-- Adds:
--   * `subscriptions` - the customer's authorisation to be charged repeatedly
--     (one row per preapproval), including its status and next charge date;
--   * `payments.subscription_id` - links each individual charge back to that
--     authorisation, so the payment list stays a plain billing history that can
--     be reconciled month by month.
--
-- A subscription row is never deleted: a customer who leaves leaves a
-- `cancelled` row behind, which is the record of what they authorised.
--
-- Idempotent (`IF NOT EXISTS`) so it can be applied on top of a database that
-- already received part of these changes via `drizzle-kit push`.
-- ============================================================================

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "subscription_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_subscription_id" ON "payments" ("subscription_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id" uuid NOT NULL,
  "user_id" uuid,
  "provider" varchar(30) NOT NULL,
  "provider_ref" varchar(120),
  "reference" varchar(40) NOT NULL,
  "plan_id" varchar(30) NOT NULL,
  "period" varchar(20) NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" varchar(3) NOT NULL DEFAULT 'PEN',
  "payer_email" varchar(255),
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "init_point" text,
  "next_payment_at" timestamp,
  "started_at" timestamp,
  "cancelled_at" timestamp,
  "raw" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_subscriptions_reference" ON "subscriptions" ("reference");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_subscriptions_business_id" ON "subscriptions" ("business_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_subscriptions_provider_ref" ON "subscriptions" ("provider", "provider_ref");
--> statement-breakpoint

-- The row is created before the provider answers, so its id only arrives
-- afterwards. Idempotent: DROP NOT NULL is a no-op when it is already nullable.
ALTER TABLE "subscriptions" ALTER COLUMN "provider_ref" DROP NOT NULL;
