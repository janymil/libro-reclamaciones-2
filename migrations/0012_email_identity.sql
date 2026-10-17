-- ============================================================================
-- libro_configuration: sender identity of the consumer-facing emails
-- ============================================================================
-- A consumer files a complaint with a business (Cencosud), not with the
-- platform that hosts the book. Until now every confirmation was sent as
-- "LibroDigital.pe" and a reply went to the platform: the consumer could not
-- tell which company held their complaint, and the company never saw the
-- answer. These three columns let the business put its own face on the message.
--
-- What each column holds:
--   * email_from_name    - display name of the sender ("Cencosud"). NULL = the
--                          business's own commercial name (or razón social).
--   * email_from_address - the sender address the business wants. Zoho (like
--                          every provider) only accepts an address on a domain
--                          whose SPF/DKIM the platform controls, so the value is
--                          only used when its domain is listed in
--                          SMTP_ALLOWED_SENDER_DOMAINS; otherwise the platform
--                          address still sends it and the console shows the
--                          setting as "pendiente de verificación".
--   * email_reply_to     - public address a consumer reply must go to. NULL
--                          falls back to notification_email (the inbox that
--                          already receives every complaint); unlike it, this
--                          one IS printed in the email footer as contact data.
--
-- Idempotent, so it can be applied on top of a database that already received
-- the columns via `drizzle-kit push`.
-- ============================================================================

ALTER TABLE "libro_configuration" ADD COLUMN IF NOT EXISTS "email_from_name" varchar(120);
--> statement-breakpoint
ALTER TABLE "libro_configuration" ADD COLUMN IF NOT EXISTS "email_from_address" varchar(255);
--> statement-breakpoint
ALTER TABLE "libro_configuration" ADD COLUMN IF NOT EXISTS "email_reply_to" varchar(255);
--> statement-breakpoint
-- Post-migration check: the columns must exist (a silent failure here would make
-- every insert/update from the schema fail at runtime).
DO $$
DECLARE
  missing_columns text;
BEGIN
  SELECT string_agg(column_name, ', ')
    INTO missing_columns
    FROM (VALUES ('email_from_name'), ('email_from_address'), ('email_reply_to')) AS expected(column_name)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns
      WHERE table_name = 'libro_configuration'
        AND column_name = expected.column_name
   );

  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'libro_configuration is missing: %', missing_columns;
  END IF;
END $$;
