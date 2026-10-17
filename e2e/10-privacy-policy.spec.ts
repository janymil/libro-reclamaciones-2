import { test, expect } from '@playwright/test';

/**
 * The "Política de Privacidad" link of the consent checkbox (Ley 29733).
 *
 * It used to be `href="#"`, i.e. it linked to the page the consumer was already
 * on: the text asked them to accept a policy they could not read, and no plan
 * could change it because the URL had nowhere to be stored. Now the business can
 * publish its own URL in Personalización, and when it has none the link opens the
 * hosted policy of the book - which is what this test walks through with the demo
 * tenant (no policy of its own).
 */
test.describe('Public privacy policy', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('cookie-notice-dismissed', '1');
    });
  });

  test('the consent checkbox opens a real privacy policy', async ({ page }) => {
    await page.goto('/libro/empresa-demo');
    await expect(page.locator('[data-testid="complaint-form"]')).toBeVisible();

    const link = page.locator('[data-testid="link-privacy-policy"]');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/libro/empresa-demo/politica-de-privacidad');

    await link.click();

    await expect(page).toHaveURL(/\/libro\/empresa-demo\/politica-de-privacidad$/);

    const policyPage = page.locator('[data-testid="privacy-policy-page"]');
    await expect(policyPage).toBeVisible();
    await expect(policyPage.getByText('Política de Privacidad').first()).toBeVisible();

    // Responsible party and retention window come from the book's own data.
    await expect(policyPage.getByText('Empresa Demo S.A.C.').first()).toBeVisible();
    await expect(policyPage.getByText('20123456789').first()).toBeVisible();
    await expect(policyPage.getByText(/24 meses/).first()).toBeVisible();

    // Every section is rendered, ARCO channels included.
    await expect(policyPage.getByText('1. Marco normativo')).toBeVisible();
    await expect(policyPage.getByText('6. Derechos ARCO')).toBeVisible();
    await expect(policyPage.getByText('8. Transferencias')).toBeVisible();
    await expect(policyPage.getByText(/En el domicilio del proveedor/).first()).toBeVisible();

    // The demo book published no policy of its own, so that banner is absent.
    await expect(page.locator('[data-testid="notice-business-policy"]')).toHaveCount(0);
  });

  test('returns to the book from the policy page', async ({ page }) => {
    await page.goto('/libro/empresa-demo/politica-de-privacidad');

    await page.locator('[data-testid="link-back-to-book"]').click();

    await expect(page).toHaveURL(/\/libro\/empresa-demo$/);
    await expect(page.locator('[data-testid="complaint-form"]')).toBeVisible();
  });
});
