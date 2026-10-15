-- ============================================================================
-- Payments / Peruvian PSP integration (Phase 2.7)
-- ============================================================================
-- The SaaS subscription was sold by hand: POST /api/subscription changed the
-- plan and nothing collected money. This adds the audit trail of every checkout
-- attempt, whatever provider moved the money:
--
--   * mercadopago - Checkout Pro (tarjetas, Yape, Plin, efectivo)
--   * culqi       - pasarela peruana (tarjetas, Yape, PagoEfectivo)
--   * manual      - transferencia / Yape directo, confirmed by an admin
--   * niubiz / izipay - listed in the catalog, awaiting a merchant contract
--
-- Money is stored as integer céntimos in `amount_cents` (never a float), and
-- `provider_ref` is the PSP-side id used to reconcile the incoming webhook.
--
-- Idempotent (`IF NOT EXISTS`) so it can be applied to databases that already
-- received part of these changes via `drizzle-kit push`.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id" uuid NOT NULL,
  "user_id" uuid,
  "provider" varchar(30) NOT NULL,
  "method" varchar(30),
  "provider_ref" varchar(120),
  "reference" varchar(40) NOT NULL,
  "plan_id" varchar(30) NOT NULL,
  "period" varchar(20) NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" varchar(3) NOT NULL DEFAULT 'PEN',
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "redirect_url" text,
  "failure_reason" text,
  "raw" jsonb,
  "paid_at" timestamp,
  "confirmed_by_user_id" uuid,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_payments_reference" ON "payments" ("reference");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_business_id" ON "payments" ("business_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_provider_ref" ON "payments" ("provider", "provider_ref");
