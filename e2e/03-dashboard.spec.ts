import { test, expect } from '@playwright/test';
import { loginAsDemo } from './helpers/auth';

test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test('displays metrics cards and real compliance statistics', async ({ page }) => {
    await expect(page.locator('[data-testid="stats-cards"]')).toBeVisible();

    // Check specific metric cards
    await expect(page.locator('[data-testid="stat-active"]')).toBeVisible();
    await expect(page.locator('[data-testid="stat-sla"]')).toBeVisible();

    // Verify recent complaints table or empty state exists
    const recentTable = page.locator('table, [data-testid="recent-complaints"]');
    await expect(recentTable.first()).toBeVisible({ timeout: 10000 });
  });

  test('sidebar navigation links work and navigate correctly', async ({ page }) => {
    // Navigate to Reclamos from sidebar
    const reclamosLink = page.locator('nav a[href*="/reclamos"], a[href="/reclamos"]').first();
    await reclamosLink.click();
    await page.waitForURL('**/reclamos**');
    await expect(page.locator('h1, h2').filter({ hasText: /Reclamaciones/i }).first()).toBeVisible();

    // Navigate to QR code page from sidebar
    const qrLink = page.locator('nav a[href*="/codigo-qr"], a[href="/codigo-qr"]').first();
    await qrLink.click();
    await page.waitForURL('**/codigo-qr**');
    await expect(page.locator('h1, h2').filter({ hasText: /Código QR/i }).first()).toBeVisible();
  });
});
