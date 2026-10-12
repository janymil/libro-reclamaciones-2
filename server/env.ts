import fs from "fs";
import path from "path";

/**
 * Loads environment variables from a local `.env` file when one is present.
 *
 * The application never shipped a dotenv loader, so `DATABASE_URL`, `SMTP_*`,
 * `SESSION_SECRET`, etc. had to be exported manually in the shell. Using Node's
 * built-in loader keeps credentials out of source control (see .gitignore).
 *
 * This module must be imported before any module that reads `process.env` at
 * module scope (e.g. `server/db.ts`).
 */
const envPath = path.resolve(import.meta.dirname, "..", ".env");

if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}
