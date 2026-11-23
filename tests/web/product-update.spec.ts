import { expect, test } from '@playwright/test';

const SEEN_KEY = 'clube-do-jogo:product-update:v1.1:completed';

test('closing the product update on the first step remembers it was shown', async ({ page }) => {
  await page.goto('/jogo-do-mes?novidades=atual');
  const dialog = page.getByRole('dialog', { name: 'Atualização V1.1' });
  await expect(dialog.getByRole('heading', { name: 'Mais jogos. Mais você.' })).toBeVisible();

  await dialog.getByRole('button', { name: 'Fechar novidades' }).click();

  await expect(dialog).toBeHidden();
  expect(await page.evaluate(key => window.localStorage.getItem(key), SEEN_KEY)).toBe('true');
});
