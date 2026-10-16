import { test, expect } from '@playwright/test';

test.describe('Public Complaint Submission', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('cookie-notice-dismissed', '1');
    });
  });

  test('allows consumer to submit a complaint and receives correlative folio', async ({ page }) => {
    // Go to demo book public portal
    await page.goto('/libro/empresa-demo');

    // No `networkidle` here: it waits for silence on the network, which a
    // dev server never really reaches (HMR socket, React Query), so it is the
    // first thing to time out on a busy machine. The assertions below wait for
    // the actual content instead.
    await expect(page.locator('[data-testid="complaint-form"]')).toBeVisible();

    // Verify company branding and legal notice
    await expect(page.getByText('Empresa Demo S.A.C.').first()).toBeVisible();
    await expect(page.getByText('20123456789').first()).toBeVisible();

    // 1. Fill Consumer Details
    await page.locator('[data-testid="input-consumer-name"]').fill('Consumidor Prueba Playwright');
    await page.locator('[data-testid="input-document-number"]').fill('44556677');
    await page.locator('[data-testid="input-consumer-address"]').fill('Av. Javier Prado Este 2465, San Borja');
    await page.locator('[data-testid="input-consumer-phone"]').fill('998877665');
    await page.locator('[data-testid="input-consumer-email"]').fill('consumidor.test@example.com');

    // 2. Fill Product / Service details
    await page.locator('[data-testid="input-product-name"]').fill('Servicio de Soporte Cloud');
    await page.locator('[data-testid="input-purchase-amount"]').fill('99.00');

    // 3. Fill Complaint details
    await page.locator('[data-testid="textarea-complaint-detail"]').fill(
      'Prueba automatizada de registro de reclamación conforme al D.S. 101-2022-PCM.'
    );

    // 4. Accept Data Protection Terms (Ley 29733)
    const consentCheckbox = page.locator('[data-testid="checkbox-consent"]');
    await consentCheckbox.click();

    // 5. Automatic security verification (proof-of-work solves in background)
    const captchaStatus = page.locator('[data-testid="captcha-status"]');
    await expect(captchaStatus).toHaveAttribute('data-status', 'ready', { timeout: 20000 });

    // 6. Submit the complaint
    const submitBtn = page.locator('[data-testid="button-submit-complaint"]');
    await submitBtn.click();

    // 7. Verify Success Screen with Correlative Number
    await expect(page.locator('[data-testid="success-correlative"]')).toBeVisible({ timeout: 15000 });
    const correlative = await page.locator('[data-testid="success-correlative"]').innerText();
    expect(correlative).toBeTruthy();
    expect(correlative.length).toBeGreaterThan(3);

    // Verify confirmation heading
    await expect(page.locator('h2', { hasText: '¡Reclamo registrado!' })).toBeVisible();
  });
});
