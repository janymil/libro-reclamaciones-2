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
    // Business-day maths is calendar date based, so the suite must run in a fixed
    // time zone to produce identical results on every developer machine and CI.
    // `TZ` is also set in the `npm test` script; this keeps `npx vitest` correct too.
    env: { TZ: "UTC" },
  },
});
