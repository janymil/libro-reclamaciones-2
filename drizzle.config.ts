import fs from "fs";
import path from "path";
import { defineConfig } from "drizzle-kit";

// Load the local .env file so `npm run db:push` picks up DATABASE_URL.
// drizzle-kit loads this config as CommonJS, so `import.meta` is unavailable.
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
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
