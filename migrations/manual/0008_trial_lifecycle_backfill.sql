-- =============================================================================
-- MANUAL migration - NOT auto-applied. Review, then run deliberately:
--
--   npm run db:apply -- migrations/manual/0008_trial_lifecycle_backfill.sql
--
-- Why it lives outside migrations/ : the embedded PGlite dev database applies
-- everything listed in migrations/meta/_journal.json automatically, and
-- drizzle-kit reads that journal too. Keeping this file in migrations/manual/
-- guarantees nothing runs against any database until a human decides so.
--
-- What it fixes: the trial lifecycle of tenants that existed before it.
-- 0003_compliance_commercial.sql added the lifecycle columns to an already
-- populated table:
--
--   subscription_status  varchar(30) NOT NULL DEFAULT 'trialing'
--   trial_ends_at        timestamp            (nullable, NO default)
--
-- so every pre-existing row came out as "trialing" with a NULL trial end. The
-- application used to read a NULL trial_ends_at as "still trialing", which made
-- such a tenant a PERPETUAL trial: the screen showed
-- "Prueba gratuita activa - quedan 0 dia(s)" (the trial end is also what the
-- day counter is computed from) and the Pro feature set stayed unlocked forever
-- instead of the tenant falling back to its own stored plan.
--
-- The application now reconstructs the window from `created_at` (+15 days,
-- TRIAL_DAYS in shared/plans.ts) when the column is still NULL and treats an
-- unknowable window as "no trial". This migration makes that same result
-- explicit in the data, so the lifecycle is auditable instead of derived.
--
-- Idempotent: it only touches rows with a NULL trial_ends_at, never balances a
-- paid plan, and can be re-run safely.
-- =============================================================================

-- 1. Give every stale trial the 15-day window it should have had from signup.
UPDATE "businesses"
SET "trial_ends_at" = "created_at" + INTERVAL '15 days'
WHERE "subscription_status" = 'trialing'
  AND "trial_ends_at" IS NULL
  AND "created_at" IS NOT NULL;
--> statement-breakpoint
-- 2. Close the windows whose 15 days already elapsed, so the row says what the
--    application derives ('trial_ended' is the status the schema documents).
--    Rows inside their window stay 'trialing' with their real end date, and
--    'active'/'past_due'/'canceled' subscriptions are never touched.
UPDATE "businesses"
SET "subscription_status" = 'trial_ended'
WHERE "subscription_status" = 'trialing'
  AND "trial_ends_at" IS NOT NULL
  AND "trial_ends_at" <= now();
--> statement-breakpoint
-- 3. Post-migration check: fails loudly if the broken state survives (a
--    'trialing' row with no end date is the exact shape of this bug).
DO $$
DECLARE
  orphans integer;
BEGIN
  SELECT count(*) INTO orphans
  FROM "businesses"
  WHERE "subscription_status" = 'trialing' AND "trial_ends_at" IS NULL;

  IF orphans > 0 THEN
    RAISE EXCEPTION 'quedan % empresas en prueba sin trial_ends_at', orphans;
  END IF;
END $$;
--> statement-breakpoint
-- 4. Report only (no data change): the tenants this migration just classified.
SELECT "ruc", "business_name", "subscription_plan", "subscription_status", "trial_ends_at"
FROM "businesses"
ORDER BY "created_at";
-- =============================================================================
-- ROLLBACK (run manually if this migration has to be undone). The pre-existing
-- rows cannot be told apart from real trials afterwards, so the rollback only
-- restores the shape this bug produced - verify against a backup first
-- (`npm run db:backup -- backups/businesses.json businesses`):
--
--   UPDATE "businesses"
--   SET "subscription_status" = 'trialing', "trial_ends_at" = NULL
--   WHERE "subscription_status" = 'trial_ended';
-- =============================================================================
