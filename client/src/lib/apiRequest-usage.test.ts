import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Regression guard for a bug that silently broke several forms (create empresa,
 * create libro, create usuario, perfil, cambiar contraseña).
 *
 * `apiRequest` is declared as `apiRequest(method, url, data)` in
 * `client/src/lib/queryClient.ts`. Because all three parameters are loosely
 * typed, swapping the first two arguments still type-checks but produces
 * `fetch('<url>', { method: '/api/...' })`, which throws at runtime and makes
 * the mutation fail. These tests fail the build if that ordering returns.
 */
const CLIENT_SRC = path.resolve(import.meta.dirname, "..");

function collectSourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectSourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("apiRequest argument order", () => {
  it("always receives the URL as the second argument, never the first", () => {
    // Flags a URL string literal passed where the HTTP method belongs.
    const urlFirst = /apiRequest\(\s*["'`]\/[^"'`]*["'`]/;

    const offenders = collectSourceFiles(CLIENT_SRC).flatMap((file) =>
      fs
        .readFileSync(file, "utf8")
        .split(/\r?\n/)
        .flatMap((line, index) =>
          urlFirst.test(line)
            ? [`${path.relative(CLIENT_SRC, file)}:${index + 1} ${line.trim()}`]
            : []
        )
    );

    expect(offenders).toEqual([]);
  });

  it("declares the method before the url", () => {
    const helper = fs.readFileSync(
      path.join(CLIENT_SRC, "lib", "queryClient.ts"),
      "utf8"
    );

    expect(helper).toContain("method: string,");
    expect(helper).toContain("url: string,");
    expect(helper.indexOf("method: string,")).toBeLessThan(
      helper.indexOf("url: string,")
    );
  });
});
