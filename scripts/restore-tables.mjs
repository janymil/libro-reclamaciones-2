import "./load-env.mjs";
import fs from "fs";
import path from "path";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

/**
 * Restores tables from a JSON dump produced by `scripts/backup-tables.mjs`.
 *
 * DESTRUCTIVE: every table present in the dump is TRUNCATEd before its rows are
 * re-inserted. This is the drill that proves a backup is real — run it against a
 * SCRATCH database the first time, never straight into production.
 *
 * Usage:
 *   npm run db:restore -- backups/out.json --yes
 *
 * Credentials come from the environment or from the env file named by
 * `ENV_FILE` (point it at the scratch file for the drill, e.g.
 * `ENV_FILE=.env.scratch` — see scripts/load-env.mjs).
 */
neonConfig.webSocketConstructor = ws;

const args = process.argv.slice(2);
const confirmed = args.includes("--yes");
const [inFile] = args.filter((arg) => arg !== "--yes");

if (!inFile) {
  console.error("Usage: node scripts/restore-tables.mjs <in.json> --yes");
  process.exit(1);
}

if (!confirmed) {
  console.error(
    "Refusing to run: this TRUNCATEs every table in the dump.\n" +
      "Re-run with --yes once you are certain you are pointed at the right database.",
  );
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

// Table names cannot be bound as parameters, so they are validated instead.
const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

const inPath = path.resolve(process.cwd(), inFile);
const backup = JSON.parse(fs.readFileSync(inPath, "utf-8"));

console.log(`Restoring ${inFile} (dump taken ${backup.createdAt})`);
console.log(`  target: ${process.env.DATABASE_URL.replace(/:\/\/[^@]*@/, "://***@")}\n`);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  for (const [table, rows] of Object.entries(backup.tables)) {
    if (!SAFE_IDENTIFIER.test(table)) {
      throw new Error(`Refusing to restore unsafe table name: ${table}`);
    }

    await pool.query(`truncate table "${table}" cascade`);

    if (rows.length > 0) {
      // `json_populate_recordset` maps the JSON keys onto the table's columns and
      // lets PostgreSQL do the type coercion, so a dump survives column order
      // changes and needs no hand-written INSERT per table.
      await pool.query(
        `insert into "${table}" select * from json_populate_recordset(null::"${table}", $1::json)`,
        [JSON.stringify(rows)],
      );
    }

    console.log(`  ${table.padEnd(30)} ${String(rows.length).padStart(5)} rows restored`);
  }

  console.log("\nRestore finished.");
} finally {
  await pool.end();
}
