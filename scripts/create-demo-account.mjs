import { Pool, neonConfig } from "@neondatabase/serverless";
import bcrypt from "bcrypt";
import ws from "ws";

/**
 * Creates (or resets) the public demo account and its Libro de Reclamaciones.
 *
 * The demo tenant is "Empresa Demo S.A.C." and is preloaded with example
 * sucursales and reclamos so prospective customers can explore a populated
 * system before buying. Demo users cannot modify or delete records
 * (enforced in server/routes.ts requireAuth).
 *
 * Usage: npm run db:demo
 */
neonConfig.webSocketConstructor = ws;

const DEMO_EMAIL = process.env.DEMO_EMAIL || "demo@librodigital.pe";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "Demo2026!";
const DEMO_BUSINESS_ID = process.env.DEMO_BUSINESS_ID || "d9c631c2-b7d7-47de-b672-be95ca1acfd3";
const DEMO_SLUG = process.env.DEMO_SLUG || "empresa-demo";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const business = await pool.query(
    "select id, business_name, ruc from businesses where id = $1",
    [DEMO_BUSINESS_ID]
  );
  if (business.rowCount === 0) {
    console.error(`Demo business not found: ${DEMO_BUSINESS_ID}`);
    process.exit(1);
  }

  // --- 1. Demo user ---------------------------------------------------------
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const existingUser = await pool.query("select id from users where email = $1", [DEMO_EMAIL]);

  let demoUserId;
  if (existingUser.rowCount > 0) {
    demoUserId = existingUser.rows[0].id;
    await pool.query(
      `update users set password = $2, first_name = $3, last_name = $4, role = 'admin',
         business_id = $5, is_active = true, is_demo = true, onboarding_step = 2,
         onboarding_completed = true, updated_at = now()
       where id = $1`,
      [demoUserId, passwordHash, "Usuario", "Demo", DEMO_BUSINESS_ID]
    );
    console.log(`  usuario demo actualizado: ${DEMO_EMAIL}`);
  } else {
    const inserted = await pool.query(
      `insert into users (email, password, first_name, last_name, role, business_id,
         is_active, is_demo, onboarding_step, onboarding_completed)
       values ($1, $2, $3, $4, 'admin', $5, true, true, 2, true)
       returning id`,
      [DEMO_EMAIL, passwordHash, "Usuario", "Demo", DEMO_BUSINESS_ID]
    );
    demoUserId = inserted.rows[0].id;
    console.log(`  usuario demo creado: ${DEMO_EMAIL}`);
  }

  // --- 2. Libro de Reclamaciones for the demo business ----------------------
  const existingLibro = await pool.query(
    "select id from libro_configuration where business_id = $1",
    [DEMO_BUSINESS_ID]
  );

  if (existingLibro.rowCount === 0) {
    await pool.query(
      `insert into libro_configuration (business_id, user_id, libro_name, url_slug,
         business_type, notification_email, is_active, configuration_completed)
       values ($1, $2, $3, $4, 'local_fisico', $5, true, true)`,
      [
        DEMO_BUSINESS_ID,
        demoUserId,
        `Libro de Reclamaciones - ${business.rows[0].business_name}`,
        DEMO_SLUG,
        DEMO_EMAIL,
      ]
    );
    console.log(`  libro creado: /libro/${DEMO_SLUG}`);
  } else {
    await pool.query(
      "update libro_configuration set url_slug = $2, user_id = $3, is_active = true where business_id = $1",
      [DEMO_BUSINESS_ID, DEMO_SLUG, demoUserId]
    );
    console.log(`  libro actualizado: /libro/${DEMO_SLUG}`);
  }

  const counts = await pool.query(
    `select (select count(*)::int from establishments where business_id = $1) as establishments,
            (select count(*)::int from complaints where business_id = $1) as complaints`,
    [DEMO_BUSINESS_ID]
  );

  console.log("\n=== CREDENCIALES DE DEMOSTRACIÓN ===");
  console.log(`  email:    ${DEMO_EMAIL}`);
  console.log(`  password: ${DEMO_PASSWORD}`);
  console.log(`  empresa:  ${business.rows[0].business_name} (RUC ${business.rows[0].ruc})`);
  console.log(`  sucursales: ${counts.rows[0].establishments} · reclamos: ${counts.rows[0].complaints}`);
  console.log(`  libro público: /libro/${DEMO_SLUG}`);
  console.log("\n  (la cuenta demo no puede modificar ni eliminar registros)");
} finally {
  await pool.end();
}
