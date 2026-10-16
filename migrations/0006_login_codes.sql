-- ============================================================================
-- One-time login code ("entra con un código por email")
-- ============================================================================
-- Adds the storage for the code that `POST /api/auth/request-code` emails and
-- `POST /api/auth/login-with-code` consumes:
--   * `login_code_hash`     bcrypt hash of the six digits (never the code)
--   * `login_code_expires`  ten minutes after issue
--   * `login_code_attempts` wrong tries against the current code; the code is
--                           burned once it reaches the limit, so a leaked
--                           mailbox cannot be brute-forced over its lifetime
--
-- Idempotent (`IF NOT EXISTS`) so it can be applied on top of a database that
-- already received the columns via `drizzle-kit push`. Listed in
-- migrations/meta/_journal.json, so the embedded PGlite dev database applies it
-- automatically; production needs
-- `npm run db:apply -- migrations/0006_login_codes.sql`.
-- ============================================================================

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "login_code_hash" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "login_code_expires" timestamp;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "login_code_attempts" integer NOT NULL DEFAULT 0;
