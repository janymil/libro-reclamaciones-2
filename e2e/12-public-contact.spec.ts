import { test, expect } from '@playwright/test';

/**
 * "Nosotros y contacto" (`/contacto`).
 *
 * La página es pública y tiene que servir para dos cosas: contar quién está
 * detrás del servicio (sin inventar dirección ni tamaño de equipo) y dejar
 * escribir un mensaje. El formulario no es el Libro de Reclamaciones y la propia
 * página lo dice; aquí se comprueba que ese aviso y el enlace existan.
 */
test.describe('Public about & contact page', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('cookie-notice-dismissed', '1');
    });
  });

  test('is reachable from the landing header and footer', async ({ page }) => {
    await page.goto('/');

    const headerLink = page.locator('header [data-testid="nav-nosotros"]');
    await expect(headerLink).toBeVisible();
    await expect(headerLink).toHaveAttribute('href', '/contacto');

    const footerLink = page.locator('footer').getByRole('link', { name: 'Nosotros y contacto' });
    await expect(footerLink).toHaveAttribute('href', '/contacto');

    await headerLink.click();
    await expect(page).toHaveURL(/\/contacto$/);
    await expect(page.locator('[data-testid="contacto-page"]')).toBeVisible();
  });

  test('shows the channels, the legal notice and the contact form', async ({ page }) => {
    await page.goto('/contacto');

    const pageRoot = page.locator('[data-testid="contacto-page"]');
    await expect(pageRoot.locator('h1')).toContainText('Quiénes somos');

    // Direct channels, no invented address or map.
    await expect(
      pageRoot.getByRole('link', { name: 'Correo hola@librodigital.pe' }),
    ).toHaveAttribute('href', 'mailto:hola@librodigital.pe');
    await expect(
      pageRoot.getByRole('link', { name: 'Teléfono / WhatsApp +51 938 693 848' }),
    ).toHaveAttribute('href', 'tel:+51938693848');
    await expect(pageRoot).not.toContainText('Dirección');

    // The contact form is not the Libro de Reclamaciones, and the page says so.
    await expect(pageRoot).toContainText('Este formulario no es el Libro de Reclamaciones');
    const bookLink = pageRoot.locator('[data-testid="link-libro-reclamaciones"]').first();
    await expect(bookLink).toHaveAttribute(
      'href',
      'https://librodigital.pe/libro/servicios-saas',
    );
    // The real URL means the "coming soon" note is gone.
    await expect(pageRoot).not.toContainText('enlace disponible próximamente');

    await expect(page.locator('[data-testid="contact-form"]')).toBeVisible();
  });

  test('validates the form before sending anything', async ({ page }) => {
    await page.goto('/contacto');

    await page.locator('[data-testid="button-send-contact"]').click();

    // Field-level messages from the shared schema, and no success panel.
    await expect(page.getByText('Escriba su nombre')).toBeVisible();
    await expect(page.getByText('Escriba un correo válido')).toBeVisible();
    await expect(page.getByText(/Cuéntenos un poco más/)).toBeVisible();
    await expect(page.getByText('Debe aceptar el tratamiento de sus datos')).toBeVisible();
    await expect(page.locator('[data-testid="contact-success"]')).toHaveCount(0);
  });

  test('sends a message and confirms it', async ({ page }) => {
    await page.goto('/contacto');

    await page.locator('[data-testid="input-contact-name"]').fill('Ana Torres');
    await page.locator('[data-testid="input-contact-email"]').fill('ana@example.com');
    await page
      .locator('[data-testid="input-contact-message"]')
      .fill('Quisiera ver una demostración para mi restaurante.');

    // Radix Select: open the trigger and pick an option.
    await page.locator('[data-testid="select-contact-subject"]').click();
    await page.getByRole('option', { name: 'Quiero ver una demostración' }).click();

    await page.locator('[data-testid="checkbox-contact-consent"]').click();
    await page.locator('[data-testid="button-send-contact"]').click();

    await expect(page.locator('[data-testid="contact-success"]')).toBeVisible();
    await expect(page.locator('[data-testid="contact-success"]')).toContainText('Mensaje enviado');
  });
});
