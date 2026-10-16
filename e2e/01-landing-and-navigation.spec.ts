import { test, expect } from '@playwright/test';

test.describe('Public Landing Page & Navigation', () => {
  test('renders landing page with headline, CTAs, and legal badges', async ({ page }) => {
    await page.goto('/');

    // Title / brand visibility
    await expect(page).toHaveTitle(/LibroDigital\.pe|Libro de Reclamaciones/i);

    // Hero section and main value proposition
    const mainHeading = page.locator('h1');
    await expect(mainHeading).toBeVisible();
    await expect(mainHeading).toContainText(/Libro de Reclamaciones/i);

    // CTA buttons to register / login
    const accessLinks = page.locator('a[href*="/acceso"]');
    await expect(accessLinks.first()).toBeVisible();

    // Verify skip-to-content link exists for WCAG 2.4.1 compliance
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toBeAttached();

    // Verify transparent legal compliance links in footer
    const statusLink = page.locator('a[href*="/estado"]');
    const accessibilityLink = page.locator('a[href*="/accesibilidad"]');
    await expect(statusLink.first()).toBeVisible();
    await expect(accessibilityLink.first()).toBeVisible();
  });

  test('navigates from landing to login page', async ({ page }) => {
    await page.goto('/');

    // Click on Iniciar sesión / Acceso
    const loginLink = page.locator('header a[href*="/acceso"]').first();
    await loginLink.click();

    await page.waitForURL('**/acceso**');
    await expect(page.locator('[data-testid="input-loginEmail"]')).toBeVisible();
    await expect(page.locator('[data-testid="input-password"]')).toBeVisible();
  });
});
