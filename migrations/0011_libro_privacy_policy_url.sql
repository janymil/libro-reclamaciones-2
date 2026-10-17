-- ============================================================================
-- libro_configuration.privacy_policy_url - the policy the consent checkbox links to
-- ============================================================================
-- The public complaint form asks the consumer to accept the processing of their
-- personal data "conforme a la Política de Privacidad y la Ley N° 29733" - and
-- linked to "#", i.e. to the same page. A business could not fix it: there was no
-- column, so the console had nowhere to paste its own policy URL.
--
-- What the column holds:
--   * An http(s) URL of the business's own policy page (the common case: it is
--     already published on the company's website). Normalized before storage
--     (shared/privacy-policy.ts), so `javascript:`/`data:` can never reach an
--     href.
--   * NULL = the business has not published one. The portal then links to the
--     platform-hosted policy of the book (/libro/:slug/politica-de-privacidad),
--     which is generated from data we already hold, so the consumer always has
--     something real to open.
--
-- Idempotent, so it can be applied on top of a database that already received the
-- column via `drizzle-kit push`.
-- ============================================================================

ALTER TABLE "libro_configuration" ADD COLUMN IF NOT EXISTS "privacy_policy_url" varchar(500);
--> statement-breakpoint
-- Post-migration check: the column must exist (a silent failure here would make
-- every insert/update from the schema fail at runtime).
DO $$
DECLARE
  column_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'libro_configuration' AND column_name = 'privacy_policy_url'
  ) INTO column_exists;

  IF NOT column_exists THEN
    RAISE EXCEPTION 'falta libro_configuration.privacy_policy_url';
  END IF;
END $$;
--> statement-breakpoint
-- Report only (no data change): how many books already publish a link. Right
-- after this migration it is 0 - every existing book uses the hosted policy page
-- until its owner pastes a URL in Personalización.
SELECT 'libros configurados' AS concepto, count(*) AS filas FROM "libro_configuration"
UNION ALL
SELECT 'con política propia', count(*) FROM "libro_configuration" WHERE "privacy_policy_url" IS NOT NULL;
-- ============================================================================
-- ROLLBACK (run manually if this has to be undone):
--
--   ALTER TABLE "libro_configuration" DROP COLUMN IF EXISTS "privacy_policy_url";
-- ============================================================================
