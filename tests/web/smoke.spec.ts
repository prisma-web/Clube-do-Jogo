import { expect, test } from '@playwright/test';

test('opens the demo club and its ranking', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/jogo-do-mes$/);
  await page.getByRole('dialog').getByRole('button', { name: /Agora não|Fechar novidades/ }).first().click({ timeout: 2_000 }).catch(() => undefined);
  await expect(page.getByRole('heading', { name: 'Hades' })).toBeVisible();

  await page.getByRole('link', { name: 'Ranking' }).first().click();
  await expect(page).toHaveURL(/\/ranking$/);
  await expect(page.getByRole('heading', { name: /Votação para/ })).toBeVisible();
});
