-- ============================================================================
-- Demo/sandbox account support
-- ============================================================================
-- Adds the `is_demo` flag to users. Demo accounts are shared publicly so
-- prospective customers can explore the app populated with example data; the
-- API blocks PATCH/PUT/DELETE for them (see requireAuth in server/routes.ts).
-- ============================================================================
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_demo" boolean NOT NULL DEFAULT false;
