-- ============================================================================
-- Comprobantes de pago electrónicos (Phase 1: emisión manual)
-- ============================================================================
-- Three changes, all driven by one decision: every published price already
-- includes IGV, and every confirmed payment must produce a factura or a boleta.
--
-- 1. `businesses` remembers the customer's billing preference so the checkout
--    can pre-fill it (document type, mailbox, DNI for a boleta).
-- 2. `payments` and `subscriptions` keep an immutable billing SNAPSHOT: the
--    document must say what it said when the money arrived, even if the company
--    later changes its razón social or its default document type. Renewals of a
--    recurring agreement inherit the snapshot from `subscriptions`.
-- 3. `comprobantes` is the operator's work list and the customer's receipt:
--    created automatically as `pendiente`, completed with serie/correlativo and
--    the PDF/XML after the invoice is issued in SUNAT, and `anulado` when a nota
--    de crédito is issued. Phase 2 (PSE) fills the same rows automatically.
--
-- Idempotent (`IF NOT EXISTS`) so it can be applied on top of a database that
-- already received part of these changes via `drizzle-kit push`, and listed in
-- migrations/meta/_journal.json so the embedded PGlite dev database applies it.
-- ============================================================================

ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "billing_doc_type" varchar(20) NOT NULL DEFAULT 'factura';
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "billing_email" varchar(255);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "billing_dni" varchar(8);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "billing_doc_type" varchar(20);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "billing_doc_number" varchar(20);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "billing_name" text;
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "billing_address" text;
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "billing_email" varchar(255);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "billing_doc_type" varchar(20);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "billing_doc_number" varchar(20);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "billing_name" text;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "billing_address" text;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "billing_email" varchar(255);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comprobantes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "payment_id" uuid NOT NULL,
  "business_id" uuid NOT NULL,
  "doc_type" varchar(20) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pendiente',
  "serie" varchar(4),
  "number" varchar(8),
  "issue_date" timestamp,
  "customer_doc_type" varchar(1) NOT NULL,
  "customer_doc_number" varchar(20) NOT NULL,
  "customer_name" text NOT NULL,
  "customer_address" text,
  "customer_email" varchar(255),
  "description" text NOT NULL,
  "subtotal_cents" integer NOT NULL,
  "igv_cents" integer NOT NULL,
  "total_cents" integer NOT NULL,
  "igv_rate_bps" integer NOT NULL DEFAULT 1800,
  "currency" varchar(3) NOT NULL DEFAULT 'PEN',
  "payment_method" varchar(40),
  "pdf_path" text,
  "xml_path" text,
  "pdf_original_name" text,
  "xml_original_name" text,
  "emitted_at" timestamp,
  "emitted_by_user_id" uuid,
  "email_sent_at" timestamp,
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_comprobantes_payment" ON "comprobantes" ("payment_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_comprobantes_serie_number" ON "comprobantes" ("doc_type", "serie", "number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_comprobantes_business_id" ON "comprobantes" ("business_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_comprobantes_status" ON "comprobantes" ("status");
