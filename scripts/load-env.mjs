import fs from "fs";
import path from "path";

/**
 * Loads environment variables for the standalone maintenance scripts
 * (`db:apply`, `db:backup`, `db:restore`, `db:demo`, `email:diagnose`).
 *
 * Same rules as the server (`server/envPath.ts`):
 *   * `ENV_FILE` if set - normally an absolute path OUTSIDE this repository
 *     (e.g. `/etc/librodigital/app.env`), so no password ever sits in the
 *     workspace where an editor, a backup or an agent can read it;
 *   * otherwise the historical `<repo>/.env`;
 *   * variables already in the environment always win over the file.
 *
 * Imported for its side effect, first, by every script that needs credentials:
 *
 *   import "./load-env.mjs";
 *
 * This replaces the `node --env-file=.env ...` invocations the npm scripts used
 * to hard-code, which also failed outright once the file was moved out of the
 * project.
 */
const projectRoot = path.resolve(import.meta.dirname, "..");
const configured = (process.env.ENV_FILE || "").trim();
const envPath = configured
  ? path.isAbsolute(configured)
    ? configured
    : path.resolve(process.cwd(), configured)
  : path.resolve(projectRoot, ".env");

if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
} else if (configured) {
  console.error(
    `ENV_FILE points at "${envPath}", which does not exist.\n` +
      "Fix the path (or unset ENV_FILE to use <repo>/.env).",
  );
  process.exit(1);
}
