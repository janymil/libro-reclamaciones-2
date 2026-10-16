-- 0007: platform staff (the LibroDigital team) as a first-class identity.
--
-- Until now "who runs the platform" was only an env allow-list
-- (PLATFORM_ADMIN_EMAILS), which cannot be managed from the app. `role` cannot
-- express it either: every customer is `admin` of their own business, so a
-- role check would hand operator powers to customers.
--
-- Deliberately NOT seeded here: the operator account is created by
-- `scripts/setup-platform-admin.mjs`, which also frees the e-mail if it is still
-- attached to a customer login.

alter table "users"
  add column if not exists "is_platform_admin" boolean not null default false;

--> statement-breakpoint

create index if not exists "idx_users_is_platform_admin" on "users" ("is_platform_admin");
