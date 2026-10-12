-- ============================================================================
-- Cleanup: drop the legacy Spanish columns and tables
-- ============================================================================
-- Run the backup FIRST (it is destructive):
--   npm run db:backup -- backups/legacy-neondb-<timestamp>.json complaints \
--     establishments users businesses arco_requests login_attempts \
--     companies activity_logs login_history
--
-- After this migration each field has exactly ONE column and the database
-- matches shared/schema.ts, which is the single source of truth for names.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- complaints: 24 legacy Spanish columns (data already copied into the English
-- columns by migrations/legacy-neondb-compat.sql)
-- ---------------------------------------------------------------------------
ALTER TABLE "complaints" DROP COLUMN IF EXISTS "numero_correlativo";
--> statement-breakpoint
ALTER TABLE "complaints" DROP COLUMN IF EXISTS "codigo_identificacion";
--> statement-breakpoint
ALTER TABLE "complaints" DROP COLUMN IF EXISTS "consumidor_nombres";
--> statement-breakpoint
ALTER TABLE "complaints" DROP COLUMN IF EXISTS "consumidor_apellidos";
--> statement-breakpoint
ALTER TABLE "complaints" DROP COLUMN IF EXISTS "consumidor_tipo_documento";
--> statement-breakpoint
ALTER TABLE "complaints" DROP COLUMN IF EXISTS "consumidor_numero_documento";
--> statement-breakpoint
ALTER TABLE "complaints" DROP COLUMN IF EXISTS "consumidor_domicilio";
--> statement-breakpoint
ALTER TABLE "complaints" DROP COLUMN IF EXISTS "consumidor_telefono";
--> statement-breakpoint
ALTER TABLE "complaints" DROP COLUMN IF EXISTS "consumidor_email";
--> statement-breakpoint
ALTER TABLE "complaints" DROP COLUMN IF EXISTS "representante_nombres";
--> statement-breakpoint
ALTER TABLE "complaints" DROP COLUMN IF EXISTS "representante_apellidos";
--> statement-breakpoint
ALTER TABLE "complaints" DROP COLUMN IF EXISTS "representante_tipo_documento";
--> statement-breakpoint
ALTER TABLE "complaints" DROP COLUMN IF EXISTS "representante_numero_documento";
--> statement-breakpoint
ALTER TABLE "complaints" DROP COLUMN IF EXISTS "tipo";
--> statement-breakpoint
ALTER TABLE "complaints" DROP COLUMN IF EXISTS "producto_servicio";
--> statement-breakpoint
ALTER TABLE "complaints" DROP COLUMN IF EXISTS "detalle_reclamacion";
--> statement-breakpoint
ALTER TABLE "complaints" DROP COLUMN IF EXISTS "pedido_consumidor";
--> statement-breakpoint
ALTER TABLE "complaints" DROP COLUMN IF EXISTS "estado";
--> statement-breakpoint
ALTER TABLE "complaints" DROP COLUMN IF EXISTS "respuesta_proveedor";
--> statement-breakpoint
ALTER TABLE "complaints" DROP COLUMN IF EXISTS "fecha_presentacion";
--> statement-breakpoint
ALTER TABLE "complaints" DROP COLUMN IF EXISTS "fecha_limite_respuesta";
--> statement-breakpoint
ALTER TABLE "complaints" DROP COLUMN IF EXISTS "fecha_respuesta";
--> statement-breakpoint
ALTER TABLE "complaints" DROP COLUMN IF EXISTS "ip_address";
--> statement-breakpoint
ALTER TABLE "complaints" DROP COLUMN IF EXISTS "user_agent";
--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- establishments: 10 legacy columns
-- ---------------------------------------------------------------------------
ALTER TABLE "establishments" DROP COLUMN IF EXISTS "company_id";
--> statement-breakpoint
ALTER TABLE "establishments" DROP COLUMN IF EXISTS "nombre";
--> statement-breakpoint
ALTER TABLE "establishments" DROP COLUMN IF EXISTS "direccion";
--> statement-breakpoint
ALTER TABLE "establishments" DROP COLUMN IF EXISTS "distrito";
--> statement-breakpoint
ALTER TABLE "establishments" DROP COLUMN IF EXISTS "provincia";
--> statement-breakpoint
ALTER TABLE "establishments" DROP COLUMN IF EXISTS "departamento";
--> statement-breakpoint
ALTER TABLE "establishments" DROP COLUMN IF EXISTS "codigo_postal";
--> statement-breakpoint
ALTER TABLE "establishments" DROP COLUMN IF EXISTS "telefono";
--> statement-breakpoint
ALTER TABLE "establishments" DROP COLUMN IF EXISTS "active";
--> statement-breakpoint
ALTER TABLE "establishments" DROP COLUMN IF EXISTS "correlative_number";
--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- users: 4 legacy columns (password_hash and company_id were never populated)
-- ---------------------------------------------------------------------------
ALTER TABLE "users" DROP COLUMN IF EXISTS "name";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "password_hash";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "company_id";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "active";
--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- businesses: 4 legacy columns
-- ---------------------------------------------------------------------------
ALTER TABLE "businesses" DROP COLUMN IF EXISTS "email";
--> statement-breakpoint
ALTER TABLE "businesses" DROP COLUMN IF EXISTS "legal_representative";
--> statement-breakpoint
ALTER TABLE "businesses" DROP COLUMN IF EXISTS "business_sector";
--> statement-breakpoint
ALTER TABLE "businesses" DROP COLUMN IF EXISTS "subscription_status";
--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- arco_requests: 12 legacy columns (table was empty)
-- ---------------------------------------------------------------------------
ALTER TABLE "arco_requests" DROP COLUMN IF EXISTS "company_id";
--> statement-breakpoint
ALTER TABLE "arco_requests" DROP COLUMN IF EXISTS "tipo";
--> statement-breakpoint
ALTER TABLE "arco_requests" DROP COLUMN IF EXISTS "solicitante_nombres";
--> statement-breakpoint
ALTER TABLE "arco_requests" DROP COLUMN IF EXISTS "solicitante_apellidos";
--> statement-breakpoint
ALTER TABLE "arco_requests" DROP COLUMN IF EXISTS "solicitante_documento";
--> statement-breakpoint
ALTER TABLE "arco_requests" DROP COLUMN IF EXISTS "solicitante_email";
--> statement-breakpoint
ALTER TABLE "arco_requests" DROP COLUMN IF EXISTS "detalle_solicitud";
--> statement-breakpoint
ALTER TABLE "arco_requests" DROP COLUMN IF EXISTS "estado";
--> statement-breakpoint
ALTER TABLE "arco_requests" DROP COLUMN IF EXISTS "respuesta";
--> statement-breakpoint
ALTER TABLE "arco_requests" DROP COLUMN IF EXISTS "fecha_solicitud";
--> statement-breakpoint
ALTER TABLE "arco_requests" DROP COLUMN IF EXISTS "fecha_limite";
--> statement-breakpoint
ALTER TABLE "arco_requests" DROP COLUMN IF EXISTS "fecha_respuesta";
--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- login_attempts: 2 legacy columns
-- ---------------------------------------------------------------------------
ALTER TABLE "login_attempts" DROP COLUMN IF EXISTS "successful";
--> statement-breakpoint
ALTER TABLE "login_attempts" DROP COLUMN IF EXISTS "user_id";
--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- Legacy tables: `companies` was bridged into `businesses`, the other two were
-- never populated. `activity_logs` holds a foreign key to `companies`, so it
-- must be dropped first.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS "activity_logs";
--> statement-breakpoint
DROP TABLE IF EXISTS "login_history";
--> statement-breakpoint
DROP TABLE IF EXISTS "companies";


