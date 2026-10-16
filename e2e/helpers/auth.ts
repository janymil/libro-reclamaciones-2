import { type Page, expect } from '@playwright/test';

export const DEMO_USER = {
  email: 'demo@librodigital.pe',
  password: 'Demo2026!',
  name: 'Usuario Demo',
  businessName: 'Empresa Demo S.A.C.',
};

/**
 * Where the logged-in session is cached between the setup project and the specs.
 * Relative to the repository root, which is where Playwright is always invoked
 * from (`npm run test:e2e`), so no `import.meta`/`__dirname` juggling is needed.
 */
export const DEMO_STORAGE_STATE = 'e2e/.auth/demo.json';

/**
 * Makes sure the page has the demo session.
 *
 * Authenticated specs run in a project that already carries the session stored by
 * `e2e/auth.setup.ts` (one login for the whole run instead of one per test, which
 * is both faster and compatible with production-grade rate limits - `authLimiter`
 * allows 5 logins per 15 minutes there). This function therefore usually only has
 * to land on /panel.
 *
 * The specs that must talk to the app **anonymously** (the public portal, and
 * `02-auth-login` which deliberately exercises the login form) run in the
 * session-less project, so here they fall through to a real sign-in.
 */
export async function loginAsDemo(page: Page) {
  await page.goto('/panel');

  const dashboard = page.locator('[data-testid="dashboard"]');
  try {
    await dashboard.waitFor({ state: 'visible', timeout: 5000 });
    return;
  } catch {
    // No usable session: sign in for real below.
  }

  await page.goto('/acceso');

  await page.locator('[data-testid="input-loginEmail"]').fill(DEMO_USER.email);
  await page.locator('[data-testid="input-password"]').fill(DEMO_USER.password);
  await page.locator('[data-testid="button-login"]').click();

  // Generous ceiling: a cold dev server has to compile the client on the first
  // request, and the login also writes an audit row to the database.
  await page.waitForURL('**/panel', { timeout: 30000 });
  await expect(dashboard).toBeVisible({ timeout: 15000 });
}
