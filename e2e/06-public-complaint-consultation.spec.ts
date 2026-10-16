import { test, expect } from '@playwright/test';

test.describe('Public Complaint Status Consultation', () => {
  test('allows consumer to check their complaint status with correlative and document number', async ({ page }) => {
    await page.goto('/libro/empresa-demo');

    // Switch to consultation tab
    const consultTab = page.locator('[data-testid="tab-consultar"]');
    await consultTab.click();

    // Query demo seeded complaint: correlative 001-0001, document 12345678
    await page.locator('[data-testid="input-consult-correlative"]').fill('001-0001');
    await page.locator('[data-testid="input-consult-document"]').fill('12345678');
    await page.locator('[data-testid="button-consult"]').click();

    // Verify consultation results card
    const resultCard = page.locator('[data-testid="consult-result"]');
    await expect(resultCard).toBeVisible({ timeout: 10000 });
    await expect(resultCard).toContainText('001-0001');
    await expect(resultCard).toContainText(/Recibido|En proceso|Respondido|Resuelto/i);
    await expect(resultCard).toContainText(/Fecha límite/i);
  });

  test('displays error message for non-existent complaint or wrong document number', async ({ page }) => {
    await page.goto('/libro/empresa-demo');

    await page.locator('[data-testid="tab-consultar"]').click();

    await page.locator('[data-testid="input-consult-correlative"]').fill('999-9999');
    await page.locator('[data-testid="input-consult-document"]').fill('00000000');
    await page.locator('[data-testid="button-consult"]').click();

    const errorMessage = page.locator('[data-testid="consult-error"]');
    await expect(errorMessage).toBeVisible({ timeout: 8000 });
  });
});
