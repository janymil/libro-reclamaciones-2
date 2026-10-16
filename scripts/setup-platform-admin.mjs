import "./load-env.mjs";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Pool, neonConfig } from "@neondatabase/serverless";
import bcrypt from "bcrypt";
import ws from "ws";

/**
 * Creates (or repairs) the LibroDigital OPERATOR account.
 *
 * The operator is not a customer: it owns no business, it exists to manage
 * clients from `/admin`. `role` cannot express that (every customer is `admin`
 * of their own tenant), so the account carries `users.is_platform_admin = true`.
 *
 * Usage:
 *   npm run db:admin -- --email jan.milata@gmail.com
 *   npm run db:admin -- --email jan@librodigital.pe --password "unaClaveLarga"
 *
 * If that e-mail is still used by a CUSTOMER login, the script refuses to touch
 * anything until you say what should happen to it:
 *
 *   --rename-customer-to otro+cliente@gmail.com   (keeps the customer, frees the e-mail)
 *   --delete-customer-account                     (deletes the customer login only,
 *                                                  after writing a JSON backup; the
 *                                                  business and its reclamaciones stay)
 *
 * The business, its complaints and its payments are NEVER deleted here: wiping a
 * tenant is a deliberate act from the panel (it asks for the RUC back).
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

const email = (flag("--email") || process.env.PLATFORM_ADMIN_EMAIL || "").trim().toLowerCase();
if (!email) {
  console.error("Usage: npm run db:admin -- --email <correo> [--password <clave>]");
  process.exit(1);
}

const renameTo = flag("--rename-customer-to");
const deleteCustomer = has("--delete-customer-account");
const password = flag("--password") || `Ld-${crypto.randomBytes(9).toString("base64url")}!`;
const companyEmail = flag("--company-email") || email;
const companyName = flag("--name") || "LibroDigital";

const BACKUP_DIR = path.resolve(process.cwd(), "backups");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const existing = await pool.query(
    "select id, email, role, business_id from users where lower(email) = $1",
    [email]
  );

  let customer = null;
  if (existing.rowCount > 0 && existing.rows[0].business_id) {
    customer = existing.rows[0];
  }

  // --- The e-mail is still a customer login: ask before destroying anything ----
  if (customer) {
    if (!renameTo && !deleteCustomer) {
      console.error(`\nEl correo ${email} pertenece a una cuenta de CLIENTE (empresa ${customer.business_id}).`);
      console.error("Elija una opción y vuelva a ejecutar:");
      console.error("  --rename-customer-to <correo+cliente@gmail.com>   (conserva al cliente)");
      console.error("  --delete-customer-account                        (borra solo el acceso, con copia)");
      process.exit(2);
    }

    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(BACKUP_DIR, `user-${email.replace(/[^a-z0-9]/gi, "_")}-${stamp}.json`);
    const backup = await pool.query("select * from users where id = $1", [customer.id]);
    fs.writeFileSync(backupPath, JSON.stringify(backup.rows, null, 2));
    console.log(`  copia de seguridad: ${backupPath}`);

    if (renameTo) {
      await pool.query("update users set email = $2, updated_at = now() where id = $1", [
        customer.id,
        renameTo.trim().toLowerCase(),
      ]);
      console.log(`  cuenta de cliente renombrada a: ${renameTo}`);
    } else {
      await pool.query("delete from user_business_access where user_id = $1", [customer.id]).catch(() => {});
      await pool.query("delete from users where id = $1", [customer.id]);
      console.log(`  acceso de cliente eliminado (la empresa ${customer.business_id} y sus reclamos siguen intactos)`);
    }
  }

  // --- The operator account ---------------------------------------------------
  const passwordHash = await bcrypt.hash(password, 10);
  const now = await pool.query(
    `insert into users (email, password, first_name, last_name, role, business_id,
       is_active, is_demo, is_platform_admin, is_email_verified,
       onboarding_step, onboarding_completed, created_at, updated_at)
     values ($1, $2, $3, $4, 'admin', null, true, false, true, true, 2, true, now(), now())
     on conflict (email) do update set
       password = excluded.password,
       is_active = true,
       is_demo = false,
       is_platform_admin = true,
       is_email_verified = true,
       business_id = null,
       onboarding_step = 2,
       onboarding_completed = true,
       updated_at = now()
     returning id, email, is_platform_admin`,
    [email, passwordHash, companyName, "(operador)"]
  );

  console.log("\n=== OPERADOR DE PLATAFORMA ===");
  console.log(`  id:       ${now.rows[0].id}`);
  console.log(`  email:    ${now.rows[0].email}`);
  console.log(`  password: ${password}`);
  console.log(`  empresa:  ninguna (no es un cliente: gestiona clientes)`);
  console.log(`\n  Entra en /acceso y abre /admin.`);
  console.log(`  Recomendado: quitar ${companyEmail} de PLATFORM_ADMIN_EMAILS cuando`);
  console.log(`  este usuario ya pueda entrar (la lista solo sirve de arranque y rescate).`);
} finally {
  await pool.end();
}
