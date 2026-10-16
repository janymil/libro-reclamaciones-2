import path from "path";

/**
 * Resolves the file the process reads its secrets from.
 *
 * Three sources are possible, in this order of authority:
 *
 *  1. **The process environment.** Whatever the platform injects - systemd
 *     `EnvironmentFile=`, Docker `environment:`/`secrets:`, a secret manager's
 *     `run` wrapper - wins. Node's `process.loadEnvFile()` never overwrites a
 *     variable that is already set, so a stale file on the server can never
 *     shadow the real secret store.
 *  2. **`ENV_FILE`** - an absolute path to an env file that lives *outside*
 *     this repository, e.g. `ENV_FILE=/etc/librodigital/app.env`. Anything put
 *     inside the workspace (`.env`) is readable by every editor, backup,
 *     tarball and coding agent that is granted the workspace, which is exactly
 *     what this variable exists to avoid. A relative value is resolved against
 *     the current working directory.
 *  3. **`<repo>/.env`** - the historical location, still used when `ENV_FILE`
 *     is unset, so nothing changes for a developer who keeps it there.
 *
 * Kept in sync with `scripts/load-env.mjs`, which does the same thing for the
 * plain-Node maintenance scripts.
 */
export const ENV_FILE_VAR = "ENV_FILE";

export function resolveEnvFilePath(
  envFile: string | undefined,
  projectRoot: string,
  cwd: string,
): string {
  const configured = (envFile ?? "").trim();
  if (!configured) {
    return path.resolve(projectRoot, ".env");
  }
  return path.isAbsolute(configured) ? configured : path.resolve(cwd, configured);
}
