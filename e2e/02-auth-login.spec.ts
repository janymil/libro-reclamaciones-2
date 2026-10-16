import { test, expect } from '@playwright/test';
import { loginAsDemo } from './helpers/auth';

test.describe('Authentication Flow', () => {
  test('shows error with invalid credentials', async ({ page }) => {
    await page.goto('/acceso');

    await page.locator('[data-testid="input-loginEmail"]').fill('wrong-email@example.com');
    await page.locator('[data-testid="input-password"]').fill('WrongPassword123!');
    await page.locator('[data-testid="button-login"]').click();

    // Expect an alert or toast indicating bad credentials
    const toastOrAlert = page.locator('[role="status"], [role="alert"], .text-destructive, div:has-text("inválid"), div:has-text("incorrect")');
    await expect(toastOrAlert.first()).toBeVisible({ timeout: 8000 });
  });

  test('successfully logs in with demo account and redirects to dashboard', async ({ page }) => {
    await loginAsDemo(page);

    // Verify dashboard url and header
    expect(page.url()).toContain('/panel');
    await expect(page.locator('[data-testid="dashboard"]')).toBeVisible();

    // Verify company name or demo user name is reflected in navbar/page
    const pageText = await page.textContent('body');
    expect(pageText).toMatch(/Empresa Demo|Usuario Demo|Panel de Gestión/i);
  });
});
