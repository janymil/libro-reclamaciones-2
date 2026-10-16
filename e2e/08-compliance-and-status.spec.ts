import { test, expect } from '@playwright/test';
import { loginAsDemo } from './helpers/auth';

test.describe('Legal Compliance & System Status', () => {
  test('public status page (/estado) reports operational health and background jobs', async ({ page }) => {
    await page.goto('/estado');

    // Title / header
    await expect(page.locator('h1', { hasText: 'Estado del sistema' })).toBeVisible();

    // Overall status badge (Operativo / Degraded)
    await expect(page.locator('text=Estado general')).toBeVisible();
    await expect(page.locator('text=Operativo').first()).toBeVisible({ timeout: 10000 });

    // Components: API, Base de datos
    await expect(page.locator('text=API')).toBeVisible();
    await expect(page.locator('text=Base de datos')).toBeVisible();

    // Background jobs section
    await expect(page.locator('text=Tareas programadas')).toBeVisible();
  });

  test('admin compliance page (/cumplimiento) shows legal standards checklist', async ({ page }) => {
    await loginAsDemo(page);
    await page.goto('/cumplimiento');

    // Heading
    await expect(page.locator('h1, h2').filter({ hasText: /Cumplimiento/i }).first()).toBeVisible();

    // Standards mentioned: DS 011-2011-PCM, DS 101-2022-PCM, Ley 29733
    const pageText = await page.textContent('body');
    expect(pageText).toMatch(/DS 011|DS 101|Ley 29733|Conforme|Normativ/i);
  });
});
