import { test as setup, expect } from '@playwright/test';

import { DEMO_STORAGE_STATE, DEMO_USER } from './helpers/auth';

/**
 * Logs the demo user in **once** for the whole run.
 *
 * Every authenticated spec used to drive the login form in its own `beforeEach`:
 * a dozen POSTs to /api/auth/login per suite run, each one a full client render
 * plus a session write. That was the slowest and least predictable step in the
 * suite, and it only works while the login limit is relaxed in development -
 * under production settings (`authLimiter`: 5 logins per 15 minutes) the run
 * would start losing logins. Signing in here and reusing the stored session
 * removes both problems.
 *
 * `loginAsDemo` still works when there is no stored session (the anonymous
 * project), so `02-auth-login` keeps testing the real login form.
 */
setup('authenticate as the demo user', async ({ page }) => {
  await page.goto('/acceso');

  await page.locator('[data-testid="input-loginEmail"]').fill(DEMO_USER.email);
  await page.locator('[data-testid="input-password"]').fill(DEMO_USER.password);
  await page.locator('[data-testid="button-login"]').click();

  await expect(page.locator('[data-testid="dashboard"]')).toBeVisible({ timeout: 30000 });

  await page.context().storageState({ path: DEMO_STORAGE_STATE });
});
