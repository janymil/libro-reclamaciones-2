-- ============================================================================
-- Platform configuration, price list, discount codes and the console audit
-- ============================================================================
-- Everything in here used to be either env-only or hardcoded in `shared/plans.ts`,
-- so changing a price, the trial length or where payment alerts go meant a deploy.
--
-- Adds:
--   * `platform_settings`      - ONE row (id = 1): alert e-mail, the platform's own
--                                identity (razón social, RUC, dirección fiscal,
--                                contact), the free-trial length, and the
--                                `allow_free_plan_change` flag that activates a plan
--                                WITHOUT collecting money.
--   * `plan_pricing`           - optional price override per paid plan (céntimos).
--                                A plan with no row keeps the catalogue price.
--   * `discount_codes`         - operator-created promo codes (percent or fixed),
--                                optional plan scope, expiry and a redemption cap.
--   * `platform_config_audit`  - append-only trail of every console change: who,
--                                which area and a one-line summary. The dangerous
--                                settings are only acceptable because of this table.
--   * `payments.discount_*`    - which code a payment used and how much came off, so
--                                a discounted charge stays explainable on a receipt.
--
-- `amount_cents` on `payments` remains what we actually charged (already
-- discounted), so no billing maths depends on the discount columns.
--
-- Idempotent (`IF NOT EXISTS`) so it can be applied on top of a database that
-- already received part of these changes via `drizzle-kit push`.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "platform_settings" (
  "id" integer PRIMARY KEY DEFAULT 1,
  "alert_email" varchar(255),
  "legal_name" varchar(200),
  "commercial_name" varchar(200),
  "ruc" varchar(20),
  "fiscal_address" text,
  "contact_email" varchar(255),
  "contact_phone" varchar(40),
  "website" varchar(255),
  "trial_days" integer,
  "allow_free_plan_change" boolean NOT NULL DEFAULT false,
  "updated_by_user_id" uuid,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "plan_pricing" (
  "plan_id" varchar(30) PRIMARY KEY,
  "monthly_cents" integer NOT NULL,
  "annual_cents" integer NOT NULL,
  "updated_by_user_id" uuid,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "discount_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" varchar(40) NOT NULL UNIQUE,
  "description" text,
  "kind" varchar(20) NOT NULL,
  "value" integer NOT NULL,
  "plan_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "max_redemptions" integer,
  "redemption_count" integer NOT NULL DEFAULT 0,
  "starts_at" timestamp,
  "expires_at" timestamp,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by_user_id" uuid,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_discount_codes_code" ON "discount_codes" ("code");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "platform_config_audit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid,
  "email" varchar(255),
  "area" varchar(30) NOT NULL,
  "summary" text NOT NULL,
  "details" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_platform_config_audit_created" ON "platform_config_audit" ("created_at");
--> statement-breakpoint

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "discount_code" varchar(40);
--> statement-breakpoint

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "discount_cents" integer NOT NULL DEFAULT 0;
--> statement-breakpoint

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "discount_code_id" uuid;
