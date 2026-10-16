-- ============================================================================
-- The platform's own collection details (Phase 2.7, step 3)
-- ============================================================================
-- The "transferencia / Yape directo" checkout tells the customer exactly where to
-- send the money. That text lived only in the `PAYMENTS_MANUAL_INSTRUCTIONS`
-- environment variable, so an operator who changed the Yape number - or opened a
-- second bank account - needed a deploy, and the customer kept reading the old
-- account in the meantime.
--
-- Adds `platform_payment_settings`: ONE row (`id = 1`) with the company's Yape and
-- Plin numbers, an array of bank accounts (bank, tipo, número and CCI - jsonb, so
-- adding a third account never needs a column), the voucher destination and the
-- holder's name/RUC.
--
-- Platform-level, not tenant-level: this is LibroDigital's bank account. It is
-- written only from the operator console (PUT /api/admin/payment-settings) and
-- read when building a manual payment's instructions.
--
-- `PAYMENTS_MANUAL_INSTRUCTIONS` still works as a fallback for a database where
-- this row is empty, so a deployment that never opens the console behaves exactly
-- as before.
--
-- Idempotent (`IF NOT EXISTS`) so it can be applied on top of a database that
-- already received part of these changes via `drizzle-kit push`.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "platform_payment_settings" (
  "id" integer PRIMARY KEY DEFAULT 1,
  "holder_name" varchar(160),
  "holder_ruc" varchar(20),
  "yape_number" varchar(40),
  "plin_number" varchar(40),
  "voucher_email" varchar(255),
  "voucher_whatsapp" varchar(40),
  "bank_accounts" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "notes" text,
  "updated_by_user_id" uuid,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
