-- =============================================================================
-- MANUAL migration - NOT auto-applied. Review, then run deliberately:
--
--   npm run db:apply -- migrations/manual/0010_rebrand_domain_emails.sql
--
-- Why it lives outside migrations/ : the embedded PGlite dev database applies
-- everything listed in migrations/meta/_journal.json automatically, and
-- drizzle-kit reads that journal too. Keeping this file in migrations/manual/
-- guarantees nothing runs against any database until a human decides so.
--
-- What it does: moves the platform's OWN identity addresses off the retired
-- domain. The product was renamed from librovirtual.pe to librodigital.pe, and
-- the only account still registered on the old domain is the public demo
-- account - the credentials published with the product and used by the e2e
-- suite, which logs in as demo@librodigital.pe. Left unfixed, that login fails
-- and the demo tenant's complaint notifications address (libro_configuration)
-- points at a mailbox that no longer exists.
--
-- Scope is deliberately narrow. Only the two columns that hold OUR identity are
-- rewritten:
--   * "users"."email"                      - the login identity itself
--   * "libro_configuration"."notification_email" - where a tenant's complaint
--                                                  notices are delivered
--
-- What this migration must NOT touch, and why:
--   * "complaints"."consumer_email" - a consumer's own address on a legal
--     record (DS 011-2011-PCM). Rewriting it would falsify the record; if a
--     consumer wrote an old-domain address, it is their data and stays as it is.
--   * "login_attempts"."email" / "auth_audit_log"."email" - security forensics.
--     They record who tried to log in and when, at the time it happened;
--     back-dating history would make an abuse investigation lie. Their rows age
--     out with the retention window.
--   * "establishments"."email" / "business_access_requests"."requester_email" -
--     tenant-supplied contact data, not ours to rewrite.
--   * "businesses"."ruc", slugs, names - unrelated to the domain.
--
-- Idempotent: rows already on librodigital.pe do not match the WHERE clause, so
-- the file can be re-run after a partial failure.
-- =============================================================================

-- 1. Login identities on the retired domain.
UPDATE "users"
SET "email" = replace("email", '@librovirtual.pe', '@librodigital.pe'),
    "updated_at" = now()
WHERE "email" ILIKE '%@librovirtual.pe';
--> statement-breakpoint
-- 2. Notification mailboxes on the retired domain.
UPDATE "libro_configuration"
SET "notification_email" = replace("notification_email", '@librovirtual.pe', '@librodigital.pe')
WHERE "notification_email" ILIKE '%@librovirtual.pe';
--> statement-breakpoint
-- 3. Post-migration check: fails loudly if an identity row survived, because a
--    customer whose notification address no longer resolves starts missing
--    complaint notices silently.
DO $$
DECLARE
  stale_users integer;
  stale_books integer;
BEGIN
  SELECT count(*) INTO stale_users FROM "users" WHERE "email" ILIKE '%@librovirtual.pe';
  SELECT count(*) INTO stale_books FROM "libro_configuration" WHERE "notification_email" ILIKE '%@librovirtual.pe';

  IF stale_users > 0 OR stale_books > 0 THEN
    RAISE EXCEPTION 'quedan % usuario(s) y % libro(s) con el dominio anterior', stale_users, stale_books;
  END IF;
END $$;
--> statement-breakpoint
-- 4. Report only (no data change): what the migration found, and what it left
--    alone on purpose.
SELECT 'usuarios demo' AS concepto, count(*) AS filas
FROM "users" WHERE "is_demo" = true
UNION ALL
SELECT 'libros publicables', count(*) FROM "libro_configuration" WHERE "is_active" = true
UNION ALL
SELECT 'intentos de login historicos (sin cambiar)', count(*) FROM "login_attempts" WHERE "email" ILIKE '%@librovirtual.pe'
UNION ALL
SELECT 'auditoria historica (sin cambiar)', count(*) FROM "auth_audit_log" WHERE "email" ILIKE '%@librovirtual.pe';
-- =============================================================================
-- ROLLBACK (run manually if this migration has to be undone). The original
-- values can also be reconstructed from a backup taken beforehand
-- (`npm run db:backup -- backups/users.json users libro_configuration`):
--
--   UPDATE "users" SET "email" = replace("email", '@librodigital.pe', '@librovirtual.pe')
--   WHERE "email" = 'demo@librodigital.pe';
--   UPDATE "libro_configuration"
--   SET "notification_email" = 'demo@librovirtual.pe'
--   WHERE "notification_email" = 'demo@librodigital.pe';
-- =============================================================================
