import "./load-env.mjs";
import fs from "fs";
import path from "path";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

/**
 * Applies a Drizzle-style .sql migration file against the configured database.
 *
 * Statements are separated by Drizzle's `--> statement-breakpoint` marker
 * because the Neon serverless driver executes one statement per round trip.
 *
 * Usage: npm run db:apply migrations/legacy-neondb-compat.sql
 *
 * Credentials come from the environment or from the env file named by
 * `ENV_FILE` (see scripts/load-env.mjs).
 */
neonConfig.webSocketConstructor = ws;

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/apply-sql.mjs <path-to-sql-file>");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sqlPath = path.resolve(process.cwd(), file);
const contents = fs.readFileSync(sqlPath, "utf-8");

const statements = contents
  .split(/-->\s*statement-breakpoint/)
  .map((statement) => statement.trim())
  .filter((statement) => statement.length > 0);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  console.log(`Applying ${statements.length} statements from ${path.basename(sqlPath)}`);

  for (const [index, statement] of statements.entries()) {
    const preview = statement.replace(/\s+/g, " ").slice(0, 72);
    try {
      await pool.query(statement);
      console.log(`  [${index + 1}/${statements.length}] OK  ${preview}…`);
    } catch (error) {
      console.error(`  [${index + 1}/${statements.length}] FAILED  ${preview}…`);
      throw error;
    }
  }

  console.log("Done.");
} finally {
  await pool.end();
}
