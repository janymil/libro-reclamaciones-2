import { defineConfig, devices } from '@playwright/test';

import { DEMO_STORAGE_STATE } from './e2e/helpers/auth';

/**
 * E2E configuration.
 *
 * Timeouts are deliberately generous ceilings, not delays: every assertion below
 * resolves as soon as its condition is true, and a cold dev server (Vite
 * compiling the client on first request) plus a remote database can easily take
 * several seconds per page. Tight windows were what made an occasional run fail
 * on the login redirect - see "Local dev server" in replit.md.
 *
 * Auth is split by project instead of by `beforeEach`:
 *   - `setup` logs the demo user in once and stores the session.
 *   - `chromium` runs the specs that must be anonymous (public portal, login).
 *   - `chromium-authenticated` reuses the stored session, so the rest of the
 *     suite never touches the login form (and therefore stays inside
 *     `authLimiter`'s production budget).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60000,
  expect: {
    timeout: 15000,
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.APP_URL || 'http://localhost:5000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testMatch: [/0[12]-.*\.spec\.ts/, /0[56]-.*\.spec\.ts/],
    },
    {
      name: 'chromium-authenticated',
      use: { ...devices['Desktop Chrome'], storageState: DEMO_STORAGE_STATE },
      testMatch: [/0[34]-.*\.spec\.ts/, /0[789]-.*\.spec\.ts/],
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5000/api/status',
    reuseExistingServer: true,
    timeout: 60000,
  },
});

