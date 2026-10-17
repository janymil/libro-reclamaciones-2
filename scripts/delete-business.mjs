import "./load-env.mjs";
import fs from "fs";
import path from "path";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

/**
 * Deletes ONE tenant (empresa) and frees its RUC, after writing a JSON backup.
 *
 * Why a script: "Eliminar mi empresa" in the panel requires the owner's
 * password, and an operator sometimes has to free a RUC that is still attached
 * to a test/old account. This does the same thing the product does when the
 * tenant holds no complaints (server/services/accountClosureService.ts ->
 * storage.purgeBusiness), and stops when it would erase a legal record.
 *
 * What is deleted:
 *   * every row carrying that `business_id` (libro, sucursales, reclamos,
 *     compliance, notifications, API keys, grants, ...);
 *   * the logins that belong to it - unless `--keep-user <email>` is given, in
 *     which case that login is detached (`business_id = null`);
 *   * the business row itself, which is what frees the RUC.
 *
 * What is KEPT on purpose (same policy as purgeStorage):
 *   * `payments` and `subscriptions`: the accounting trail of what was charged.
 *     Subscriptions are marked cancelled so nothing keeps renewing a ghost
 *     tenant; if one carries a `provider_ref`, cancel it in the PSP too.
 *   * `auth_audit_log` / `login_attempts`: the security trail.
 *
 * Usage:
 *   npm run db:delete-business -- --ruc 10411592982                 (dry run)
 *   npm run db:delete-business -- --ruc 10411592982 --yes           (deletes)
 *   npm run db:delete-business -- --ruc 10411592982 --keep-user jan@x.com --yes
 *
 * Safety rails:
 *   * dry run unless `--yes`;
 *   * refuses a tenant with complaints (2-year retention, DS 011-2011-PCM)
 *     unless `--allow-complaints`;
 *   * refuses the shared demo tenant unless `--allow-demo` (its RUC is published
 *     with the product, so deleting it breaks the demo forever).
 *
 * Credentials come from the environment or from the env file named by
 * `ENV_FILE` (see scripts/load-env.mjs).
 */
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const has = (name) => args.includes(name);

const ruc = (flag("--ruc") || "").replace(/\D/g, "");
const businessIdArg = (flag("--business-id") || "").trim();
const keepUser = (flag("--keep-user") || "").trim().toLowerCase();
const confirm = has("--yes");
const allowComplaints = has("--allow-complaints");
const allowDemo = has("--allow-demo");

if (!ruc && !businessIdArg) {
  console.error(
    "Usage: npm run db:delete-business -- --ruc <11 digitos> [--keep-user <correo>] [--yes]\n" +
      "       npm run db:delete-business -- --business-id <uuid> [--keep-user <correo>] [--yes]",
  );
  process.exit(1);
}

/** Tables that carry a `business_id` but must survive the tenant. */
const PROTECTED_TABLES = new Set(["payments", "subscriptions", "users"]);
/** Tables keyed by `complaint_id` only: children of the tenant's complaints. */
const COMPLAINT_CHILDREN = ["complaint_attachments", "complaint_audit_log"];

const BACKUP_DIR = path.resolve(process.cwd(), "backups");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const maskUrl = (url) => url.replace(/:\/\/[^@]*@/, "://***@");

try {
  // --- 1. Resolve the tenant ------------------------------------------------
  const found = await pool.query(
    `select id, ruc, business_name, commercial_name, subscription_plan,
            subscription_status, is_active, created_at
       from businesses
      where ${ruc ? "ruc = $1" : "id::text = $1"}`,
    [ruc || businessIdArg],
  );

  if (found.rowCount === 0) {
    console.error(`No existe ninguna empresa con ${ruc ? `RUC ${ruc}` : `id ${businessIdArg}`}.`);
    process.exit(1);
  }
  if (found.rowCount > 1) {
    console.error("Hay más de una empresa con ese criterio; use --business-id.");
    process.exit(1);
  }

  const business = found.rows[0];

  const members = (
    await pool.query(
      `select distinct u.id, u.email, u.first_name, u.last_name, u.role,
              u.is_demo, u.is_platform_admin, u.created_at
         from users u
         left join user_business_access uba on uba.user_id = u.id
        where u.business_id = $1 or uba.business_id = $1
        order by u.created_at`,
      [business.id],
    )
  ).rows;

  const complaints = await pool.query(
    "select count(*)::int as total from complaints where business_id = $1",
    [business.id],
  );
  const complaintCount = complaints.rows[0].total;

  console.log("=== EMPRESA A ELIMINAR ===");
  console.log(`  id:           ${business.id}`);
  console.log(`  RUC:          ${business.ruc}`);
  console.log(`  razón social: ${business.business_name}`);
  console.log(`  nombre:       ${business.commercial_name ?? "-"}`);
  console.log(`  plan:         ${business.subscription_plan} / ${business.subscription_status}`);
  console.log(`  creada:       ${new Date(business.created_at).toISOString()}`);
  console.log(`  reclamos:     ${complaintCount}`);
  console.log(`  base de datos:${maskUrl(process.env.DATABASE_URL)}`);
  console.log("  logins:");
  if (members.length === 0) console.log("    (ninguno)");
  for (const member of members) {
    console.log(
      `    - ${member.email} (${member.role}${member.is_demo ? ", demo" : ""}` +
        `${member.is_platform_admin ? ", operador" : ""})`,
    );
  }

  // --- 2. Safety rails ------------------------------------------------------
  if (members.some((member) => member.is_demo) && !allowDemo) {
    console.error(
      "\nABORTADO: esta es la cuenta demo compartida (is_demo). Su RUC se publica con el " +
        "producto; si de verdad quiere eliminarla, repita con --allow-demo.",
    );
    process.exit(2);
  }

  if (complaintCount > 0 && !allowComplaints) {
    console.error(
      `\nABORTADO: la empresa tiene ${complaintCount} reclamo(s). El Libro de Reclamaciones es un ` +
        "registro legal con 2 años de conservación (DS 011-2011-PCM); use la vía normal de cierre " +
        "en el panel, o repita con --allow-complaints si ya existe una copia legal aparte.",
    );
    process.exit(2);
  }

  if (!confirm) {
    console.log("\nDRY RUN: no se borró nada. Repita el comando con --yes para eliminar.");
    process.exit(0);
  }

  // --- 3. Backup ------------------------------------------------------------
  const tenantTables = (
    await pool.query(
      `select table_name from information_schema.columns
        where table_schema = 'public' and column_name = 'business_id'
        order by table_name`,
    )
  ).rows.map((row) => row.table_name);

  const backup = {
    createdAt: new Date().toISOString(),
    business,
    members,
    tables: {},
  };

  for (const table of tenantTables) {
    const result = await pool.query(`select * from "${table}" where business_id = $1`, [business.id]);
    backup.tables[table] = result.rows;
  }

  const complaintIds = (
    await pool.query("select id from complaints where business_id = $1", [business.id])
  ).rows.map((row) => row.id);

  if (complaintIds.length > 0) {
    for (const table of COMPLAINT_CHILDREN) {
      const exists = await pool.query("select to_regclass($1) as reg", [`public.${table}`]);
      if (!exists.rows[0].reg) continue;
      const result = await pool.query(
        `select * from "${table}" where complaint_id = any($1::uuid[])`,
        [complaintIds],
      );
      backup.tables[table] = result.rows;
    }
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(BACKUP_DIR, `deleted-business-${business.ruc}-${stamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), "utf-8");
  console.log(`\n  copia de seguridad: ${backupPath}`);

  // --- 4. Delete (one transaction) -----------------------------------------
  const client = await pool.connect();
  const deleted = {};

  try {
    await client.query("begin");

    if (complaintIds.length > 0) {
      for (const table of COMPLAINT_CHILDREN) {
        const exists = await client.query("select to_regclass($1) as reg", [`public.${table}`]);
        if (!exists.rows[0].reg) continue;
        const result = await client.query(
          `delete from "${table}" where complaint_id = any($1::uuid[])`,
          [complaintIds],
        );
        deleted[table] = (deleted[table] ?? 0) + result.rowCount;
      }
    }

    // Everything tenant-scoped except the protected/user tables handled below.
    for (const table of tenantTables) {
      if (PROTECTED_TABLES.has(table)) continue;
      const result = await client.query(`delete from "${table}" where business_id = $1`, [business.id]);
      deleted[table] = (deleted[table] ?? 0) + result.rowCount;
    }

    // Logins: delete them, or detach the one the operator asked to keep.
    const memberIds = members.map((member) => member.id);
    if (memberIds.length > 0) {
      await client.query("delete from user_business_access where user_id = any($1::uuid[])", [memberIds]);
      await client.query("delete from user_business_access where business_id = $1", [business.id]);
    }

    if (keepUser) {
      const kept = await client.query(
        `update users set business_id = null, onboarding_completed = false,
                          onboarding_step = 1, updated_at = now()
          where business_id = $1 and lower(email) = $2
          returning id, email`,
        [business.id, keepUser],
      );
      if (kept.rowCount === 1) {
        console.log(`  login conservado y desvinculado: ${kept.rows[0].email}`);
      } else {
        console.log(`  aviso: no había un login ${keepUser} en esta empresa; no se conservó ninguno`);
      }
      const removed = await client.query(
        "delete from users where business_id = $1 and lower(email) <> $2",
        [business.id, keepUser],
      );
      deleted.users = (deleted.users ?? 0) + removed.rowCount;
    } else {
      const removed = await client.query("delete from users where business_id = $1", [business.id]);
      deleted.users = (deleted.users ?? 0) + removed.rowCount;
    }

    // Accounting trail: kept, never deleted, but nothing may keep renewing.
    const cancelled = await client.query(
      `update subscriptions
          set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), updated_at = now()
        where business_id = $1 and status not in ('cancelled', 'canceled')`,
      [business.id],
    );
    if (cancelled.rowCount > 0) {
      console.log(`  suscripciones marcadas como canceladas: ${cancelled.rowCount}`);
    }
    const providerRefs = await client.query(
      `select provider, provider_ref, reference from subscriptions
        where business_id = $1 and provider_ref is not null`,
      [business.id],
    );
    if (providerRefs.rowCount > 0) {
      console.log("  AVISO: cancele también en el PSP estas suscripciones (no se borran):");
      for (const row of providerRefs.rows) {
        console.log(`    - ${row.provider} ${row.provider_ref} (${row.reference})`);
      }
    }

    const removedBusiness = await client.query("delete from businesses where id = $1", [business.id]);
    deleted.businesses = removedBusiness.rowCount;

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  // The logo is a file on disk whose row just disappeared: remove it, or it
  // stays fetchable at its public URL with nothing pointing at it.
  for (const config of backup.tables.libro_configuration ?? []) {
    if (!config.logo_file_name) continue;
    const logosDir = process.env.ATTACHMENTS_DIR
      ? path.join(process.env.ATTACHMENTS_DIR, "logos")
      : path.resolve(process.cwd(), "uploads", "logos");
    const file = path.resolve(logosDir, config.logo_file_name);
    if (file.startsWith(path.resolve(logosDir) + path.sep) && fs.existsSync(file)) {
      fs.unlinkSync(file);
      console.log(`  logo eliminado: ${config.logo_file_name}`);
    }
  }

  console.log("\n=== BORRADO ===");
  for (const [table, rows] of Object.entries(deleted)) {
    console.log(`  ${table.padEnd(30)} ${String(rows).padStart(4)} fila(s)`);
  }
  console.log(`\n  RUC ${business.ruc} liberado.`);
  console.log("  Se conservaron los pagos/suscripciones (contabilidad) y la auditoría de accesos.");
  console.log(`  Copia: ${backupPath}`);

  const still = await pool.query("select 1 from businesses where ruc = $1", [business.ruc]);
  console.log(`  verificación: empresas con RUC ${business.ruc} = ${still.rowCount}`);



} finally {
  await pool.end();
}
