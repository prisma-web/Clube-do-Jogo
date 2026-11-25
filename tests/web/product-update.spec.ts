import { expect, test } from '@playwright/test';
import update from './fixtures/product-update.json';

const SEEN_KEY = `clube-do-jogo:product-update:${update.id}:completed`;

test('shows the latest release notes and remembers a close on the first step', async ({ page }) => {
  await page.goto('/jogo-do-mes?novidades=atual');
  const dialog = page.getByRole('dialog', { name: update.title });
  await expect(dialog.getByRole('heading', { name: update.steps[0].title })).toBeVisible();
  await expect(dialog.getByRole('img', { name: update.steps[0].image?.alt })).toHaveAttribute('src', update.steps[0].image?.src ?? '');

  await dialog.getByRole('button', { name: 'Fechar novidades' }).click();

  await expect(dialog).toBeHidden();
  expect(await page.evaluate(key => window.localStorage.getItem(key), SEEN_KEY)).toBe('true');
});
