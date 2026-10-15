-- =============================================================================
-- MANUAL migration - NOT auto-applied. Review, then run deliberately:
--
--   npm run db:apply -- migrations/manual/0006_business_access_requests.sql
--
-- Why it lives outside migrations/ : the embedded PGlite dev database applies
-- everything listed in migrations/meta/_journal.json automatically, and
-- drizzle-kit reads that journal too. Keeping this file in migrations/manual/
-- guarantees nothing runs against any database until a human decides so.
--
-- What it does: creates "business_access_requests", the table behind the
-- "solicitar acceso a esta empresa" flow. Before it, a login that tried to
-- register a RUC someone else had already registered got a bare 409 and had no
-- way forward (accountant of a client, staff turnover, a second partner).
-- =============================================================================

CREATE TABLE IF NOT EXISTS "business_access_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id" uuid NOT NULL,
  "requester_user_id" uuid NOT NULL,
  "requester_email" varchar(255) NOT NULL,
  "requester_name" text,
  "message" text,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "decided_by_user_id" uuid,
  "decided_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- At most one row per (business, requester, status): a pending request can never
-- be duplicated by double-clicking, and a rejected one can be re-sent later.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_business_access_request_pair"
  ON "business_access_requests" ("business_id", "requester_user_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_business_access_requests_business"
  ON "business_access_requests" ("business_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_business_access_requests_requester"
  ON "business_access_requests" ("requester_user_id");
--> statement-breakpoint
-- Post-migration check: fails loudly if the table is still missing.
DO $$
BEGIN
  IF to_regclass('public.business_access_requests') IS NULL THEN
    RAISE EXCEPTION 'business_access_requests no fue creada';
  END IF;
END $$;
-- =============================================================================
-- ROLLBACK (run manually if this migration has to be undone):
--
--   DROP TABLE IF EXISTS "business_access_requests";
-- =============================================================================
