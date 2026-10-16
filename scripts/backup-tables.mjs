import "./load-env.mjs";
import fs from "fs";
import path from "path";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

/**
 * Dumps whole tables to a JSON file so data can be recovered before a
 * destructive migration.
 *
 * Usage: npm run db:backup -- backups/out.json table1 table2 ...
 *
 * Credentials come from the environment or from the env file named by
 * `ENV_FILE` (see scripts/load-env.mjs).
 */
neonConfig.webSocketConstructor = ws;

const [outFile, ...tables] = process.argv.slice(2);

if (!outFile || tables.length === 0) {
  console.error("Usage: node scripts/backup-tables.mjs <out.json> <table> [table...]");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const backup = {
    createdAt: new Date().toISOString(),
    tables: {},
  };

  for (const table of tables) {
    const result = await pool.query(`select * from "${table}"`);
    backup.tables[table] = result.rows;
    console.log(`  ${table.padEnd(30)} ${String(result.rowCount).padStart(5)} rows`);
  }

  const outPath = path.resolve(process.cwd(), outFile);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(backup, null, 2), "utf-8");

  console.log(`\nBackup written to ${outPath}`);
} finally {
  await pool.end();
}
