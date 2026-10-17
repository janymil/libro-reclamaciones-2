import { test, expect } from '@playwright/test';

/**
 * Pie de la portada (datos del prestador) y documentos legales.
 *
 * Estos casos fijan lo que el visitante anónimo debe poder encontrar sin
 * iniciar sesión: quién presta el servicio, cómo contactarlo y los documentos
 * que respaldan la relación (términos, privacidad, aviso legal). El enlace del
 * Libro de Reclamaciones del propio operador todavía es un marcador de posición
 * (ver `LIBRO_DE_RECLAMACIONES_URL` en client/src/lib/platform-legal.ts), así
 * que la prueba comprueba que existe y que no apunta a una URL inventada.
 */
test.describe('Public legal pages and footer identity', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('cookie-notice-dismissed', '1');
    });
  });

  test('the landing footer identifies the operator and links to the legal documents', async ({
    page,
  }) => {
    await page.goto('/');

    const footer = page.locator('footer');
    await expect(footer).toBeVisible();

    // Operator identity: business name, RUC, phone and contact mailbox.
    await expect(footer.getByText(/Servicios SAAS/).first()).toBeVisible();
    await expect(footer.getByText(/10411592982/).first()).toBeVisible();
    await expect(footer.getByRole('link', { name: '+51 938 693 848' })).toHaveAttribute(
      'href',
      'tel:+51938693848',
    );
    await expect(footer.getByRole('link', { name: 'hola@librodigital.pe' })).toHaveAttribute(
      'href',
      'mailto:hola@librodigital.pe',
    );

    // Legal column.
    await expect(footer.locator('[data-testid="footer-link-terminos"]')).toHaveAttribute(
      'href',
      '/terminos',
    );
    await expect(footer.locator('[data-testid="footer-link-privacidad"]')).toHaveAttribute(
      'href',
      '/privacidad',
    );
    await expect(footer.locator('[data-testid="footer-link-aviso-legal"]')).toHaveAttribute(
      'href',
      '/aviso-legal',
    );

    // Norms link straight to the official document in gob.pe, never to an entity home.
    await expect(footer.locator('[data-testid="footer-norm-ley-29571"]')).toHaveAttribute(
      'href',
      'https://www.gob.pe/institucion/indecopi/normas-legales/1244218-29571',
    );
    await expect(footer.locator('[data-testid="footer-norm-ds-011-2011-pcm"]')).toHaveAttribute(
      'href',
      'https://www.gob.pe/institucion/indecopi/normas-legales/3462732-decreto-supremo-n-011-2011-pcm',
    );
    for (const href of await footer.locator('[data-testid^="footer-norm-"]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('href') ?? ''),
    )) {
      expect(href.startsWith('https://www.gob.pe/')).toBe(true);
    }

    // The operator's own book is a real, public URL.
    const bookLink = footer.locator('[data-testid="footer-link-libro-reclamaciones"]');
    await expect(bookLink).toHaveAttribute(
      'href',
      'https://librodigital.pe/libro/servicios-saas',
    );
    await expect(bookLink).not.toContainText('pronto');
  });

  test('every legal document is public, readable and cross-linked', async ({ page }) => {
    for (const [path, testId] of [
      ['/terminos', 'terminos-page'],
      ['/privacidad', 'privacidad-page'],
      ['/aviso-legal', 'aviso-legal-page'],
      ['/normativa', 'normativa-page'],
    ] as const) {
      await page.goto(path);

      const document = page.locator(`[data-testid="${testId}"]`);
      await expect(document).toBeVisible();
      await expect(document.locator('h1')).toBeVisible();

      // Who is behind the service, on every document.
      const identity = document.locator('[data-testid="operator-identity"]');
      await expect(identity).toBeVisible();
      await expect(identity.getByText(/Servicios SAAS · RUC 10411592982/)).toBeVisible();

      // And the way to the sibling documents without going back to the landing.
      await expect(document.locator('[data-testid="footer-link-terminos"]')).toBeVisible();
      await expect(document.locator('[data-testid="footer-link-privacidad"]')).toBeVisible();
      await expect(document.locator('[data-testid="footer-link-aviso-legal"]')).toBeVisible();
    }
  });

  test('the normativa page lists all eight norms with official links and flags the draft', async ({
    page,
  }) => {
    await page.goto('/normativa');

    const pageRoot = page.locator('[data-testid="normativa-page"]');
    await expect(pageRoot).toBeVisible();

    for (const id of [
      'ley-29571',
      'ley-31435',
      'ley-32495',
      'ds-011-2011-pcm',
      'ds-006-2014-pcm',
      'ds-101-2022-pcm',
      'ley-29733',
      'ds-016-2024-jus',
    ]) {
      await expect(pageRoot.locator(`[data-testid="norm-${id}"]`)).toBeVisible();
    }

    // Every norm entry links out to the official State repository.
    const hrefs = await pageRoot
      .locator('[data-testid^="norm-"] a[href^="https://www.gob.pe/"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href') ?? ''));
    expect(hrefs.length).toBeGreaterThanOrEqual(8);

    // The draft DS is shown as pending, not as an obligation in force.
    await expect(pageRoot.locator('[data-testid="pending-norm"]')).toContainText(
      'no la aplique todavía',
    );

    // The reglamento has two annexes: the app must not invent an "Anexo III".
    await page.goto('/');
    await expect(page.locator('body')).not.toContainText('Anexo III');
  });

  test('legacy English URLs still land on the Spanish documents', async ({ page }) => {
    await page.goto('/terms');
    await expect(page).toHaveURL(/\/terminos$/);
    await expect(page.locator('[data-testid="terminos-page"]')).toBeVisible();

    await page.goto('/privacy');
    await expect(page).toHaveURL(/\/privacidad$/);
    await expect(page.locator('[data-testid="privacidad-page"]')).toBeVisible();
  });
});
