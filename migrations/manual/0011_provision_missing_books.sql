-- =============================================================================
-- MANUAL migration - NOT auto-applied. Review, then run deliberately:
--
--   npm run db:apply -- migrations/manual/0011_provision_missing_books.sql
--
-- Why it lives outside migrations/ : the embedded PGlite dev database applies
-- everything listed in migrations/meta/_journal.json automatically, and
-- drizzle-kit reads that journal too. Keeping this file in migrations/manual/
-- guarantees nothing runs against any database until a human decides so.
--
-- What it fixes: two shapes of half-provisioned tenant left behind by the
-- company-creation bug (fixed in server/storage/onboarding.storage.ts and
-- server/routes/businesses.routes.ts):
--
--   a) an establishment with NO row in "books". "Libros" is rendered from
--      "books", so such a tenant saw "No hay libros creados" and had nowhere to
--      record a complaint, even though its public link existed.
--   b) an establishment still named by the old provisioning rule ("Casa Matriz"
--      / "Tienda Online"). That name came from a hard-coded string, so a tenant
--      that named its book "Wong" kept seeing "Casa Matriz" on /sucursales, on
--      /libros and on the public portal. New tenants now get the name the user
--      typed; this renames the existing ones to match.
--
-- Idempotent: (a) only inserts books for establishments that have none, and
-- (b) only renames the two machine-generated names, then the WHERE clause no
-- longer matches. Safe to re-run after a partial failure.
-- =============================================================================

-- 1. The Libro de Reclamaciones of every establishment that has none.
--    DS 011-2011-PCM requires one book per establishment open to the public, and
--    'reclamos' is the legal book the registration form creates.
INSERT INTO "books" ("business_id", "establishment_id", "book_type", "is_active")
SELECT e."business_id", e."id", 'reclamos', true
FROM "establishments" e
WHERE NOT EXISTS (
  SELECT 1 FROM "books" b WHERE b."establishment_id" = e."id"
);
--> statement-breakpoint
-- 2. Rename the establishments the old rule named, using the name the user gave
--    the book. Only a tenant with exactly ONE establishment is touched (with
--    several sucursales the name of a single "Casa Matriz" is ambiguous) and only
--    the two names the provisioning rule ever produced - a name a human typed is
--    never rewritten. REVIEW this SELECT before running the UPDATE below:
--
--      SELECT e."id", e."name", c."libro_name", b."business_name"
--      FROM "establishments" e
--      JOIN "libro_configuration" c ON c."business_id" = e."business_id"
--      JOIN "businesses" b ON b."id" = e."business_id"
--      WHERE e."name" IN ('Casa Matriz', 'Tienda Online')
--        AND c."libro_name" <> e."name"
--        AND (SELECT count(*) FROM "establishments" x WHERE x."business_id" = e."business_id") = 1;
UPDATE "establishments" e
SET "name" = c."libro_name",
    "updated_at" = now()
FROM "libro_configuration" c
WHERE c."business_id" = e."business_id"
  AND e."name" IN ('Casa Matriz', 'Tienda Online')
  AND c."libro_name" <> e."name"
  AND (SELECT count(*) FROM "establishments" x WHERE x."business_id" = e."business_id") = 1;
--> statement-breakpoint
-- 3. Post-migration check: fails loudly if an establishment still has no book,
--    because that is the state that made a published Libro unusable.
DO $$
DECLARE
  orphans integer;
BEGIN
  SELECT count(*) INTO orphans
  FROM "establishments" e
  WHERE NOT EXISTS (SELECT 1 FROM "books" b WHERE b."establishment_id" = e."id");

  IF orphans > 0 THEN
    RAISE EXCEPTION 'quedan % establecimiento(s) sin libro', orphans;
  END IF;
END $$;
--> statement-breakpoint
-- 4. Report only (no data change): the books just made reachable, and the
--    tenants that still have no public book at all. Those are left alone on
--    purpose: "libro_configuration" holds the PUBLIC URL and the notification
--    inbox, so choosing them is the customer's decision (a human has to
--    register the book through the wizard / the Empresas form).
SELECT 'libros de reclamaciones' AS concepto, count(*) AS filas FROM "books" WHERE "book_type" = 'reclamos'
UNION ALL
SELECT 'establecimientos', count(*) FROM "establishments"
UNION ALL
SELECT 'empresas sin libro publico (revisar)', count(*)
FROM "businesses" b
WHERE NOT EXISTS (SELECT 1 FROM "libro_configuration" c WHERE c."business_id" = b."id");
-- =============================================================================
-- ROLLBACK (run manually if this migration has to be undone). Neither statement
-- can be undone exactly - the inserted books look like real ones and the old
-- establishment names are not recorded - so restore from a backup taken
-- beforehand (`npm run db:backup -- backups/books.json books establishments`):
--
--   DELETE FROM "books"
--   WHERE "id" IN (SELECT "id" FROM "books" WHERE "created_at" > now() - INTERVAL '1 hour');
--   UPDATE "establishments" SET "name" = 'Casa Matriz'
--   WHERE "name" = (SELECT c."libro_name" FROM "libro_configuration" c WHERE c."business_id" = "establishments"."business_id");
-- =============================================================================
