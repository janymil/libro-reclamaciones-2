import { test, expect } from '@playwright/test';
import { loginAsDemo } from './helpers/auth';

test.describe('AI Legal Copilot', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
    await page.goto('/asistente');
  });

  test('loads compliance copilot interface with suggestions and welcome message', async ({ page }) => {
    const copilotContainer = page.locator('[data-testid="compliance-agent"]');
    await expect(copilotContainer).toBeVisible({ timeout: 10000 });

    // Verify welcome greeting
    await expect(copilotContainer).toContainText(/Copiloto de Cumplimiento/i);

    // Verify prompt suggestions exist
    const suggestionBtn = page.locator('button', { hasText: /plazo legal/i });
    await expect(suggestionBtn).toBeVisible();
  });

  test('sends a legal question and receives an AI or heuristic legal answer', async ({ page }) => {
    // The suggestion buttons only prefill the input (see
    // compliance-agent-chat.tsx: `onClick={() => setInput(suggestion)}`), so the
    // question has to be submitted afterwards.
    const suggestionBtn = page.locator('button', { hasText: /plazo legal/i });
    await suggestionBtn.click();

    const input = page.locator('[data-testid="agent-input"]');
    await expect(input).toHaveValue('¿Cuál es el plazo legal para responder un reclamo?');

    await page.getByRole('button', { name: /Enviar/ }).click();

    // The question is now a rendered message, and the answer follows.
    const messages = page.locator('[data-testid="agent-messages"]');
    await expect(messages).toContainText('¿Cuál es el plazo legal para responder un reclamo?');
    await expect(messages).toContainText(/hábiles|15\s*días|DS\s*101/i, { timeout: 25000 });
  });
});
