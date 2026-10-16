import { test, expect } from '@playwright/test';
import { loginAsDemo } from './helpers/auth';

test.describe('QR Code & INDECOPI Signage', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
    await page.goto('/codigo-qr');
  });

  test('renders QR code and public portal link', async ({ page }) => {
    const qrCard = page.locator('[data-testid="libro-qr-card"]');
    await expect(qrCard).toBeVisible({ timeout: 10000 });

    // Verify QR SVG is rendered
    const qrSvg = page.locator('#libro-qr-svg');
    await expect(qrSvg).toBeVisible();

    // Verify public link contains /libro/empresa-demo
    const publicLink = qrCard.locator('a[href*="/libro/"]');
    await expect(publicLink).toBeVisible();
    await expect(publicLink).toHaveAttribute('href', /.*\/libro\/empresa-demo/);
  });

  test('shows print recommendations for physical establishments', async ({ page }) => {
    await expect(page.locator('text=Recomendaciones de impresión')).toBeVisible();
    // `text=` also matches the QR card and the legal notice: pin to the first.
    await expect(page.getByText('DS 011-2011-PCM').first()).toBeVisible();
  });
});
