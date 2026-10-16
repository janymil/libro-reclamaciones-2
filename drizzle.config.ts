import fs from "fs";
import path from "path";
import { defineConfig } from "drizzle-kit";

// Load the env file so `npm run db:push` picks up DATABASE_URL: `ENV_FILE` when
// set (normally a path OUTSIDE the repository - see RUNBOOK.md section 0.1),
// otherwise the historical `<repo>/.env`. Kept in sync with server/envPath.ts
// and scripts/load-env.mjs.
// drizzle-kit loads this config as CommonJS, so `import.meta` is unavailable.
const configured = (process.env.ENV_FILE || "").trim();
const envPath = configured
  ? path.isAbsolute(configured)
    ? configured
    : path.resolve(process.cwd(), configured)
  : path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
} else if (configured) {
  throw new Error(`ENV_FILE points at "${envPath}", which does not exist.`);
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
