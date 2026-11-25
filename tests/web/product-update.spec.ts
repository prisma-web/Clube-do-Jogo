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

test('settings reopens the latest release notes', async ({ page }) => {
  await page.goto('/configuracoes');
  // The demo club always has unanswered games, so the quick voting deck opens over the page.
  await page.getByRole('button', { name: 'Fechar votação rápida' }).click();
  await page.getByRole('button', { name: new RegExp(update.title) }).click();
  await expect(page.getByRole('dialog', { name: update.title }).getByRole('heading', { name: update.steps[0].title })).toBeVisible();
});

test('without release notes there is no dialog and no settings entry', async ({ page }) => {
  for (const answer of ['abort', 'server error'] as const) {
    await page.unrouteAll();
    await page.route('**/api/product-update', route => (answer === 'abort' ? route.abort() : route.fulfill({ status: 500, body: 'boom' })));
    const answered = page.waitForEvent(answer === 'abort' ? 'requestfailed' : 'requestfinished', request => request.url().endsWith('/api/product-update'));
    await page.goto('/configuracoes?novidades=atual');
    await answered;
    await expect(page.getByRole('heading', { name: 'Preferências' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Ver novamente/ })).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: update.title })).toHaveCount(0);
  }
});
