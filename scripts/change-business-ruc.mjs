import "./load-env.mjs";
import fs from "fs";
import path from "path";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

/**
 * Reassigns the RUC of ONE empresa without touching its data.
 *
 * Why: `businesses.ruc` is UNIQUE, so a RUC that is still attached to an old or
 * test company cannot be registered again ("no se pudo completar el registro",
 * 409 on /api/auth/complete-onboarding). When the old company must survive
 * (its history, its payments), the fix is to move it to another RUC and let the
 * real one be registered by the real owner. `npm run db:delete-business` is the
 * other way out: it erases the old company instead.
 *
 * Usage:
 *   npm run db:change-business-ruc -- --ruc 10411592982 --new-ruc 00000000000       (dry run)
 *   npm run db:change-business-ruc -- --ruc 10411592982 --new-ruc 00000000000 --yes
 *   npm run db:change-business-ruc -- --business-id <uuid> --new-ruc 20123456789 --yes
 *
 * What it does NOT do: rename the company, touch its users, or rewrite records
 * already issued. The public Libro, the legal pages and every future document
 * will print the NEW RUC, so use a placeholder that is clearly not a real RUC
 * (00000000000) or a RUC the company actually holds.
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

const currentRuc = (flag("--ruc") || "").replace(/\D/g, "");
const businessIdArg = (flag("--business-id") || "").trim();
const newRuc = (flag("--new-ruc") || "").replace(/\D/g, "");
const confirm = has("--yes");

if ((!currentRuc && !businessIdArg) || !newRuc) {
  console.error(
    "Usage: npm run db:change-business-ruc -- --ruc <ruc actual> --new-ruc <ruc nuevo> [--yes]\n" +
      "       npm run db:change-business-ruc -- --business-id <uuid> --new-ruc <ruc nuevo> [--yes]",
  );
  process.exit(1);
}

if (!/^\d{11}$/.test(newRuc)) {
  console.error("El RUC nuevo debe tener exactamente 11 dígitos.");
  process.exit(1);
}

const BACKUP_DIR = path.resolve(process.cwd(), "backups");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const maskUrl = (url) => url.replace(/:\/\/[^@]*@/, "://***@");

try {
  // --- 1. Resolve the company ----------------------------------------------
  const found = await pool.query(
    `select id, ruc, business_name, commercial_name, subscription_plan,
            subscription_status, is_active, created_at
       from businesses
      where ${currentRuc ? "ruc = $1" : "id::text = $1"}`,
    [currentRuc || businessIdArg],
  );

  if (found.rowCount === 0) {
    console.error(`No existe ninguna empresa con ${currentRuc ? `RUC ${currentRuc}` : `id ${businessIdArg}`}.`);
    process.exit(1);
  }
  if (found.rowCount > 1) {
    console.error("Hay más de una empresa con ese criterio; use --business-id.");
    process.exit(1);
  }

  const business = found.rows[0];

  if (business.ruc === newRuc) {
    console.log(`La empresa ya tiene el RUC ${newRuc}; no hay nada que cambiar.`);
    process.exit(0);
  }

  const taken = await pool.query("select id, business_name from businesses where ruc = $1", [newRuc]);
  if (taken.rowCount > 0) {
    console.error(
      `El RUC ${newRuc} ya está en uso por "${taken.rows[0].business_name}" (${taken.rows[0].id}).`,
    );
    process.exit(1);
  }

  console.log("=== EMPRESA A REASIGNAR ===");
  console.log(`  id:           ${business.id}`);
  console.log(`  razón social: ${business.business_name}`);
  console.log(`  nombre:       ${business.commercial_name ?? "-"}`);
  console.log(`  plan:         ${business.subscription_plan} / ${business.subscription_status}`);
  console.log(`  RUC actual:   ${business.ruc}`);
  console.log(`  RUC nuevo:    ${newRuc}`);
  console.log(`  base de datos:${maskUrl(process.env.DATABASE_URL)}`);

  if (/^0+$/.test(newRuc)) {
    console.log(
      "  aviso: 00000000000 es un marcador, no un RUC real. El libro público y los " +
        "documentos futuros mostrarán ese número.",
    );
  }

  if (!confirm) {
    console.log("\nDRY RUN: no se cambió nada. Repita el comando con --yes para aplicar.");
    process.exit(0);
  }

  // --- 2. Backup the row before touching it --------------------------------
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(
    BACKUP_DIR,
    `business-ruc-${business.ruc}-to-${newRuc}-${stamp}.json`,
  );
  fs.writeFileSync(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), business }, null, 2), "utf-8");
  console.log(`\n  copia de seguridad: ${backupPath}`);

  // --- 3. Apply ------------------------------------------------------------
  const updated = await pool.query(
    "update businesses set ruc = $2, updated_at = now() where id = $1 returning id, ruc",
    [business.id, newRuc],
  );

  console.log("\n=== LISTO ===");
  console.log(`  ${business.business_name}: RUC ${business.ruc} -> ${updated.rows[0].ruc}`);
  console.log(`  El RUC ${business.ruc} quedó libre para registrar al titular real.`);

  const freed = await pool.query("select 1 from businesses where ruc = $1", [business.ruc]);
  const assigned = await pool.query("select 1 from businesses where ruc = $1", [newRuc]);
  console.log(`  verificación: empresas con RUC ${business.ruc} = ${freed.rowCount}`);
  console.log(`  verificación: empresas con RUC ${newRuc} = ${assigned.rowCount}`);
} finally {
  await pool.end();
}
