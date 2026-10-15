-- =============================================================================
-- MANUAL migration - NOT auto-applied. Review, then run deliberately:
--
--   npm run db:apply -- migrations/manual/0007_users_role_default.sql
--
-- Why it lives outside migrations/ : the embedded PGlite dev database applies
-- everything listed in migrations/meta/_journal.json automatically, and
-- drizzle-kit reads that journal too. Keeping this file in migrations/manual/
-- guarantees nothing runs against any database until a human decides so.
--
-- What it does: restores what 0000_init.sql declared for users.role
-- (DEFAULT 'admin' NOT NULL) on databases created from the legacy schema.
-- There, the column exists but carries neither the default nor NOT NULL, and
-- legacy-neondb-compat.sql only backfilled existing values - so every NEW
-- signup was inserted with role NULL and got 403 from every admin-only
-- endpoint (users, businesses, plan, integrations, access requests).
--
-- The application also sets the role explicitly at signup now, so this is the
-- database-level backstop rather than the only line of defence.
-- =============================================================================

-- 1. Repair existing rows (same backfill as the compat migration, for any row
--    written since: on drifting databases every new signup adds one).
UPDATE "users" SET "role" = 'admin' WHERE "role" IS NULL;
--> statement-breakpoint
-- 2. Restore the declared default, so a future insert that omits the column -
--    a script, a manual INSERT, an older client - still lands on 'admin'.
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'admin';
--> statement-breakpoint
-- 3. Restore NOT NULL, which the schema declares. Safe after the backfill.
ALTER TABLE "users" ALTER COLUMN "role" SET NOT NULL;
--> statement-breakpoint
-- 4. Post-migration check: fails loudly if the column is still unconstrained.
DO $$
DECLARE
  null_roles integer;
  col_default text;
  col_nullable text;
BEGIN
  SELECT count(*) INTO null_roles FROM "users" WHERE "role" IS NULL;
  IF null_roles > 0 THEN
    RAISE EXCEPTION 'quedan % usuarios sin rol', null_roles;
  END IF;

  SELECT column_default, is_nullable INTO col_default, col_nullable
  FROM information_schema.columns
  WHERE table_name = 'users' AND column_name = 'role';

  IF col_default IS NULL OR col_nullable <> 'NO' THEN
    RAISE EXCEPTION 'users.role sigue sin DEFAULT/NOT NULL (default=%, nullable=%)',
      col_default, col_nullable;
  END IF;
END $$;
-- =============================================================================
-- ROLLBACK (run manually if this migration has to be undone):
--
--   ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
--   ALTER TABLE "users" ALTER COLUMN "role" DROP NOT NULL;
-- =============================================================================
