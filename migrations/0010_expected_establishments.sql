-- ============================================================================
-- businesses.expected_establishments - how many locales the company expects
-- ============================================================================
-- Onboarding asks a chain "¿Cuántos locales atenderás en total?" and the
-- "Primeros pasos" checklist on /panel uses the answer to show "Sucursales 2 de 5"
-- and to remind the customer which locales are still missing.
--
-- Why a column and not a browser value: the number has to follow the ACCOUNT, not
-- the device. It used to live in localStorage, so a customer who registered on one
-- machine and opened the panel on another simply lost the target (the checklist
-- silently omitted the step instead of showing a wrong number).
--
-- Purely guidance, deliberately nullable:
--   * NULL = the customer never declared a total, which is the normal case for a
--     single local: the checklist then omits the "agrega tus otros locales" step
--     rather than nagging about a number nobody gave.
--   * No quota, billing or legal rule reads it. `establishments` (the real rows) is
--     what counts for limits per plan.
--
-- Idempotent, so it can be applied on top of a database that already received the
-- column via `drizzle-kit push`.
-- ============================================================================

ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "expected_establishments" integer;
--> statement-breakpoint
-- Post-migration check: the column must exist (a silent failure here would make
-- every businesses insert from the schema fail at runtime).
DO $$
DECLARE
  column_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'businesses' AND column_name = 'expected_establishments'
  ) INTO column_exists;

  IF NOT column_exists THEN
    RAISE EXCEPTION 'falta businesses.expected_establishments';
  END IF;
END $$;
--> statement-breakpoint
-- Report only (no data change): what exists today, and how many companies declared
-- a number (it will be 0 right after this migration runs).
SELECT 'empresas' AS concepto, count(*) AS filas FROM "businesses"
UNION ALL
SELECT 'con locales declarados', count(*) FROM "businesses" WHERE "expected_establishments" IS NOT NULL;
-- ============================================================================
-- ROLLBACK (run manually if this has to be undone):
--
--   ALTER TABLE "businesses" DROP COLUMN IF EXISTS "expected_establishments";
-- ============================================================================
