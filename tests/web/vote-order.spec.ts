import { expect, test, type Locator, type Page } from '@playwright/test';

const scoreboardOrder = ['would_not_play', 'neutral', 'would_play'];

function choiceOrder(scope: Locator) {
  return scope.locator('[data-choice]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-choice')));
}

async function closeQuickVoting(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: /Agora não|Fechar novidades/ }).first().click({ timeout: 2_000 }).catch(() => undefined);
  const close = page.getByRole('button', { name: 'Fechar votação rápida' });
  await close.click({ timeout: 5_000 }).catch(() => undefined);
  await expect(close).toBeHidden();
}

async function expectScoreboardOrder(summary: Locator, picker: Locator) {
  await expect(summary.locator('[data-choice]')).toHaveCount(3);
  expect(await choiceOrder(summary)).toEqual(scoreboardOrder);
  expect(await choiceOrder(picker)).toEqual(scoreboardOrder);
  await summary.locator('[data-choice="neutral"]').click();
  const dialog = summary.page().getByRole('dialog', { name: 'Escolhas do clube' });
  await expect(dialog.getByRole('tab')).toHaveText([/^Não · \d+$/, /^Neutro · \d+$/, /^Jogaria · \d+$/]);
  await expect(dialog.getByRole('tab', { selected: true })).toHaveText(/^Neutro · /);
}

test('no ranking, contador, botão e abas seguem a ordem do placar', async ({ page }) => {
  await page.goto('/ranking');
  await closeQuickVoting(page);
  const card = page.locator('article.ranking-card', { hasText: 'Cocoon' });
  await expectScoreboardOrder(card.locator('.preference-summary'), card.locator('.preference-picker'));
});

test('na página do jogo, contador, botão e abas seguem a ordem do placar', async ({ page }) => {
  await page.goto('/jogos/cocoon');
  await closeQuickVoting(page);
  await expect(page.getByRole('heading', { name: 'Cocoon', level: 1 })).toBeVisible();
  await expectScoreboardOrder(page.locator('.preference-summary'), page.locator('.preference-picker'));
});
