import { expect, test } from '@playwright/test';
import history from './fixtures/releases/latest/download/product-updates.json';

const [current, previous, oldest] = history.releases;
const seenKey = (tag: string) => `clube-do-jogo:product-update:${tag}:completed`;

test('a member without seen notes gets only the latest version, and a close on the first step is remembered', async ({ page }) => {
  await page.goto('/jogo-do-mes?novidades=atual');
  const dialog = page.getByRole('dialog', { name: `Novidades da ${current.version}` });
  await expect(dialog.getByRole('heading', { name: current.steps[0].title })).toBeVisible();
  await expect(dialog.getByRole('img', { name: current.steps[0].image?.alt })).toHaveAttribute('src', current.steps[0].image?.src ?? '');
  await expect(dialog.getByText(`1 de ${current.steps.length}`)).toBeVisible();

  await dialog.getByRole('button', { name: 'Fechar novidades' }).click();

  await expect(dialog).toBeHidden();
  expect(await page.evaluate(key => window.localStorage.getItem(key), seenKey(current.id))).toBe('true');
});

test('a member who skipped versions gets every version since the last one seen, newest first, and can open the older ones', async ({ page }) => {
  await page.addInitScript(key => window.localStorage.setItem(key, 'true'), seenKey('v1.0.0'));
  await page.goto('/jogo-do-mes?novidades=atual');
  const dialog = page.getByRole('dialog', { name: `Novidades da ${previous.version} à ${current.version}` });
  const steps = [...current.steps, ...previous.steps];
  await expect(dialog.getByRole('heading', { name: steps[0].title })).toBeVisible();
  await expect(dialog.getByText(`1 de ${steps.length}`)).toBeVisible();

  await dialog.getByRole('button', { name: `Ir para o passo ${steps.length}: ${previous.version}, ${previous.steps.at(-1)?.eyebrow}` }).click();
  await expect(dialog.getByRole('heading', { name: steps.at(-1)?.title })).toBeVisible();
  await dialog.getByRole('button', { name: `Mais ${oldest.steps.length} novidades da ${oldest.version}` }).click();

  const older = page.getByRole('dialog', { name: `Novidades da ${oldest.version}` });
  await expect(older.getByRole('heading', { name: oldest.steps[0].title })).toBeVisible();
  await expect(older.getByRole('button', { name: /^Mais / })).toHaveCount(0);
  await older.getByRole('button', { name: `Ir para o passo ${oldest.steps.length}: ${oldest.version}, ${oldest.steps.at(-1)?.eyebrow}` }).click();
  await older.getByRole('button', { name: `Explorar a ${history.id}` }).click();

  await expect(older).toBeHidden();
  expect(await page.evaluate(key => window.localStorage.getItem(key), seenKey(history.id))).toBe('true');
});

test('settings reopens the latest release notes', async ({ page }) => {
  await page.goto('/configuracoes');
  await page.getByRole('button', { name: 'Fechar votação rápida' }).click();
  await page.getByRole('button', { name: new RegExp(`Novidades da ${current.version}`) }).click();
  await expect(page.getByRole('dialog', { name: `Novidades da ${current.version}` }).getByRole('heading', { name: current.steps[0].title })).toBeVisible();
});

test('an answer with only the single release, from a route deployed before the history, still shows its notes', async ({ page }) => {
  await page.route('**/api/product-update', route => route.fulfill({ json: { update: current } }));
  await page.goto('/jogo-do-mes?novidades=atual');
  await expect(page.getByRole('dialog', { name: `Novidades da ${current.version}` }).getByRole('heading', { name: current.steps[0].title })).toBeVisible();
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
    await expect(page.getByRole('dialog', { name: /^Novidades da/ })).toHaveCount(0);
  }
});
