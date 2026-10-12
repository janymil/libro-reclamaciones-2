import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Standalone Vitest configuration.
 *
 * This is intentionally separate from `vite.config.ts`:
 *  - `vite.config.ts` sets `root: client` and installs Replit-only plugins that
 *    need a live Replit environment, neither of which is wanted when running the
 *    server-side test suite.
 *  - The aliases below mirror the ones in `vite.config.ts` / `tsconfig.json`, so
 *    `@/...` and `@shared/...` imports resolve exactly as they do in the app.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: [
      "client/src/**/*.test.ts",
      "server/**/*.test.ts",
      "shared/**/*.test.ts",
    ],
    // The suite is deliberately NOT pinned to a time zone. Every date computation
    // goes through `@shared/peru-time`, which resolves dates in `America/Lima` via
    // Intl, so results must be identical on any machine and in CI. Pinning `TZ`
    // would hide exactly the class of bug this suite exists to catch.
  },
});
