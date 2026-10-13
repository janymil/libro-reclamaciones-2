-- =============================================================================
-- MANUAL migration - NOT auto-applied. Review, then run deliberately:
--
--   npm run db:apply -- migrations/manual/0004_tenant_integrity_hardening.sql
--
-- Why it lives outside migrations/ : the embedded PGlite dev database applies
-- everything listed in migrations/meta/_journal.json automatically, and
-- drizzle-kit reads that journal too. Keeping this file in migrations/manual/
-- guarantees nothing runs against any database until a human decides so.
--
-- What it does: makes the legal folio unique per tenant, so two complaints of
-- the same business can never share a correlative number even under a race.
-- The application already probes for a free folio (nextCorrelativeNumber);
-- this constraint is the database-level backstop.
-- =============================================================================

-- 1. Pre-flight: abort loudly instead of failing halfway if duplicates exist.
DO $$
DECLARE
  duplicate_groups integer;
BEGIN
  SELECT count(*) INTO duplicate_groups FROM (
    SELECT business_id, correlative_number
    FROM complaints
    GROUP BY business_id, correlative_number
    HAVING count(*) > 1
  ) duplicates;

  IF duplicate_groups > 0 THEN
    RAISE EXCEPTION
      'Se encontraron % correlativos duplicados por empresa. Revise y corrija esos folios antes de crear el índice único.',
      duplicate_groups;
  END IF;
END $$;
--> statement-breakpoint
-- 2. One folio per business. CONCURRENTLY avoids blocking writes on the table.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_complaints_business_correlative
  ON complaints (business_id, correlative_number);
--> statement-breakpoint
-- 3. Post-migration check: the index must now be present and valid.
DO $$
DECLARE
  is_valid boolean;
BEGIN
  SELECT index_usable_checks.indisvalid INTO is_valid
  FROM pg_index index_usable_checks
  JOIN pg_class index_class ON index_class.oid = index_usable_checks.indexrelid
  WHERE index_class.relname = 'uq_complaints_business_correlative';

  IF is_valid IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'El índice único no quedó válido. Si la creación se interrumpió, bórrelo y vuelva a intentarlo.';
  END IF;
END $$;
--> statement-breakpoint
-- =============================================================================
-- OPTIONAL, NOT ENABLED - Row Level Security (defense in depth).
--
-- RLS is deliberately left commented out because enabling it naively would
-- break the application: the server connects as the table OWNER (the Neon
-- connection in DATABASE_URL), and owners bypass RLS unless FORCE ROW LEVEL
-- SECURITY is set. A safe rollout needs:
--   1. a dedicated non-owner application role (e.g. librovirtual_app) with the
--      right grants, and a second connection string for it;
--   2. the data layer to set the tenant per transaction, e.g.
--      `SET LOCAL app.current_business = '<uuid>'` at the start of every
--      request-scoped transaction, and every policy written as
--      `business_id = current_setting('app.current_business')::uuid`;
--   3. background jobs (retention, SLA) to run with an explicit, auditable
--      bypass or a per-business loop that sets the setting;
--   4. a full regression run of the two-tenant isolation suite against the new
--      role before switching production over.
-- Doing 1-4 is an architectural change with its own migration window; it is
-- listed as a follow-up, not silently applied here.
--
-- ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY complaints_tenant_isolation ON complaints
--   USING (business_id = current_setting('app.current_business')::uuid);
-- =============================================================================
