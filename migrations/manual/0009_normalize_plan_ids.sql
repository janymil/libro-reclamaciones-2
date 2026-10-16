-- =============================================================================
-- MANUAL migration - NOT auto-applied. Review, then run deliberately:
--
--   npm run db:apply -- migrations/manual/0009_normalize_plan_ids.sql
--
-- Why it lives outside migrations/ : the embedded PGlite dev database applies
-- everything listed in migrations/meta/_journal.json automatically, and
-- drizzle-kit reads that journal too. Keeping this file in migrations/manual/
-- guarantees nothing runs against any database until a human decides so.
--
-- What it does: stores the plan ids the application actually applies.
-- 0000_init.sql declared `businesses.subscription_plan varchar(50) DEFAULT
-- 'basic' NOT NULL`, so every tenant created by the legacy app - and every row
-- that never picked a plan - carries the id `basic`, which does not exist in the
-- current catalog (gratis | esencial | profesional | corporativo).
-- `getPlan()` already resolves an unknown id to Gratis, i.e. those tenants have
-- always been on the Free plan, but the stored value disagreed with the plan in
-- force: the upgrade screen could not mark "Gratis" as the current plan
-- (`storedPlanId === plan.id` never matched) and any report grouping by
-- `subscription_plan` showed a phantom tier.
--
-- Mapping legacy `basic` -> `gratis` is deliberate: `basic` was the column
-- DEFAULT of a free-tier app, never a paid SKU, and Gratis is what the code
-- already grants those tenants. Nothing is upgraded or downgraded by this
-- migration - only the label is made to match.
--
-- Idempotent: rows already on a catalog id are untouched, so it can be re-run.
-- =============================================================================

-- 1. Replace any non-catalog plan id with the Free plan it resolves to.
UPDATE "businesses"
SET "subscription_plan" = 'gratis'
WHERE "subscription_plan" NOT IN ('gratis', 'esencial', 'profesional', 'corporativo');
--> statement-breakpoint
-- 2. Post-migration check: fails loudly if an unknown id survives, because that
--    is exactly the drift this migration exists to remove.
DO $$
DECLARE
  invalid integer;
BEGIN
  SELECT count(*) INTO invalid
  FROM "businesses"
  WHERE "subscription_plan" NOT IN ('gratis', 'esencial', 'profesional', 'corporativo');

  IF invalid > 0 THEN
    RAISE EXCEPTION 'quedan % empresas con un plan fuera del catálogo', invalid;
  END IF;
END $$;
--> statement-breakpoint
-- 3. Report only (no data change): how the tenants are distributed now.
SELECT "subscription_plan", "subscription_status", count(*) AS empresas
FROM "businesses"
GROUP BY "subscription_plan", "subscription_status"
ORDER BY "subscription_plan", "subscription_status";
-- =============================================================================
-- ROLLBACK (run manually if this migration has to be undone). The original
-- legacy value can be reconstructed from a backup taken beforehand
-- (`npm run db:backup -- backups/businesses.json businesses`):
--
--   UPDATE "businesses" SET "subscription_plan" = 'basic' WHERE "subscription_plan" = 'gratis';
-- =============================================================================
