-- ============================================================================
-- Payment-link recovery (Phase 2.7, step 5)
-- ============================================================================
-- A declined charge used to end the story: the provider rejected the card, the
-- customer closed the tab and the plan never activated. Now the platform emails
-- them the same checkout link plus the transfer/Yape instructions, and an
-- operator can resend it from the console.
--
-- `recovery_email_sent_at` makes the automatic send idempotent: payment webhooks
-- are retried, and the customer must not receive the same message three times.
-- `recovery_email_count` counts every message sent (automatic or operator), which
-- is what the console shows next to the reference.
--
-- Idempotent (`IF NOT EXISTS`) so it can be applied to databases that already
-- received part of these changes via `drizzle-kit push`.
-- ============================================================================

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "recovery_email_sent_at" timestamp;
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "recovery_email_count" integer NOT NULL DEFAULT 0;
