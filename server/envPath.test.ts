import path from "path";
import { describe, expect, it } from "vitest";
import { resolveEnvFilePath } from "./envPath";

/**
 * The resolver decides which file the server and the maintenance scripts read
 * their credentials from. Getting it wrong is not a cosmetic bug: it means the
 * process silently boots with no `DATABASE_URL`/`SESSION_SECRET` (dev fallbacks)
 * while the operator believes the secret store was read.
 *
 * Paths are built with `path.resolve(path.sep, ...)` so the expectations hold
 * on Windows (where the workspace is developed) and on Linux (where CI runs).
 */
const PROJECT_ROOT = path.resolve(path.sep, "srv", "app");
const CWD = path.resolve(path.sep, "home", "deploy");

describe("resolveEnvFilePath", () => {
  it("falls back to <repo>/.env when ENV_FILE is unset", () => {
    expect(resolveEnvFilePath(undefined, PROJECT_ROOT, CWD)).toBe(
      path.resolve(PROJECT_ROOT, ".env"),
    );
  });

  it("falls back to <repo>/.env when ENV_FILE is empty or blank", () => {
    // A common failure in unit files / CI: `ENV_FILE=` with nothing after it.
    // Treating "" as a path would resolve to the current directory and blow up
    // with EISDIR instead of using the documented default.
    expect(resolveEnvFilePath("", PROJECT_ROOT, CWD)).toBe(
      path.resolve(PROJECT_ROOT, ".env"),
    );
    expect(resolveEnvFilePath("   ", PROJECT_ROOT, CWD)).toBe(
      path.resolve(PROJECT_ROOT, ".env"),
    );
  });

  it("uses an absolute ENV_FILE exactly as given", () => {
    const outside = path.resolve(path.sep, "etc", "librodigital", "app.env");
    expect(resolveEnvFilePath(outside, PROJECT_ROOT, CWD)).toBe(outside);
  });

  it("resolves a relative ENV_FILE against the working directory, not the repo", () => {
    // `ENV_FILE=secrets/prod.env` must not be mistaken for a repo-relative path:
    // every documented setup keeps the file outside the project.
    expect(resolveEnvFilePath(path.join("secrets", "prod.env"), PROJECT_ROOT, CWD)).toBe(
      path.resolve(CWD, "secrets", "prod.env"),
    );
  });

  it("trims surrounding whitespace, which is invisible in a unit file", () => {
    const outside = path.resolve(path.sep, "etc", "librodigital", "app.env");
    expect(resolveEnvFilePath(`  ${outside}  `, PROJECT_ROOT, CWD)).toBe(outside);
  });
});
