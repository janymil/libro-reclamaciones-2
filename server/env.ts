import fs from "fs";
import path from "path";
import { ENV_FILE_VAR, resolveEnvFilePath } from "./envPath";

/**
 * Loads environment variables from a file when one is present.
 *
 * The application never shipped a dotenv loader, so `DATABASE_URL`, `SMTP_*`,
 * `SESSION_SECRET`, etc. had to be exported manually in the shell. Using Node's
 * built-in loader keeps credentials out of source control (see .gitignore).
 *
 * Which file: `ENV_FILE` if set (its whole point is to point somewhere OUTSIDE
 * this repository, so that the workspace - and any agent or tool allowed to
 * read it - never contains a password), otherwise the historical `<repo>/.env`.
 * Variables already present in the environment take precedence over the file,
 * so on a VPS the platform's own injection (systemd `EnvironmentFile=`, Docker
 * secrets, a secret manager) always wins. See RUNBOOK.md section 0.1.
 *
 * A misconfigured `ENV_FILE` is a boot error, not a warning: silently falling
 * back to a file with local or absent values is how a production instance ends
 * up running with a development session secret.
 *
 * This module must be imported before any module that reads `process.env` at
 * module scope (e.g. `server/db.ts`).
 */
const envPath = resolveEnvFilePath(
  process.env[ENV_FILE_VAR],
  path.resolve(import.meta.dirname, ".."),
  process.cwd(),
);

if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
} else if ((process.env[ENV_FILE_VAR] ?? "").trim()) {
  throw new Error(
    `${ENV_FILE_VAR} points at "${envPath}", which does not exist. ` +
      "Fix the path (or unset it to use <repo>/.env).",
  );
}
