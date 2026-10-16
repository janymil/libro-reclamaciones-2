import { test, expect } from '@playwright/test';
import { loginAsDemo } from './helpers/auth';

test.describe('Complaints Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
    await page.goto('/reclamos');
  });

  test('displays complaints list with pagination or rows', async ({ page }) => {
    // Check table headers
    await expect(page.locator('th', { hasText: /Correlativo/i })).toBeVisible();
    await expect(page.locator('th', { hasText: /Consumidor/i })).toBeVisible();

    // Verify at least one complaint row exists (from demo seed)
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 10000 });
  });

  test('filters complaints by search input', async ({ page }) => {
    const searchInput = page.locator('[data-testid="input-search"]');
    await expect(searchInput).toBeVisible();

    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible();

    // A term that cannot match anything: the table must empty out (the component
    // renders an empty state instead of the table, so there are no rows left).
    // Asserting the *behaviour* beats searching for a name that happens to be in
    // the seed data - the demo tenant also gains a complaint on every run of the
    // public-portal spec, so hard-coded names rot.
    await searchInput.fill('zzzz-sin-coincidencias');
    await expect(rows).toHaveCount(0);
    await expect(page.getByText('No se encontraron reclamaciones')).toBeVisible();

    // Clearing the search brings the rows back.
    await searchInput.fill('');
    await expect(rows.first()).toBeVisible();
  });

  test('opens complaint detail dialog when clicking view button', async ({ page }) => {
    const viewButton = page.locator('[data-testid^="button-view-"]').first();
    await expect(viewButton).toBeVisible();
    await viewButton.click();

    // Dialog should open
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog).toContainText(/Reclamación|Consumidor|Detalle/i);

    // Close dialog
    const closeBtn = dialog.locator('button:has-text("Cerrar"), button[aria-label="Close"], button:has(.material-icons:has-text("close"))').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await expect(dialog).not.toBeVisible();
    }
  });
});
