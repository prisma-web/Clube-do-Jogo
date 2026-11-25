import { expect, test, type Page } from '@playwright/test';

async function openTimeline(page: Page) {
  await page.goto('/jogo-do-mes');
  await page.getByRole('dialog').getByRole('button', { name: /Agora não|Fechar novidades/ }).first().click({ timeout: 2_000 }).catch(() => undefined);
  const close = page.getByRole('button', { name: 'Fechar votação rápida' });
  await close.click({ timeout: 5_000 }).catch(() => undefined);
  await expect(close).toBeHidden();
  await page.getByRole('tab', { name: 'Timeline' }).click();
  await expect(page.locator('article.comment-card').first()).toBeVisible();
}

test('o primeiro clique em Adicionar reação abre o seletor num comentário sem foco', async ({ page }) => {
  await openTimeline(page);
  const comment = page.locator('article.comment-card').first();
  await expect(comment).not.toHaveAttribute('data-thread-selected', 'true');

  await comment.getByRole('button', { name: 'Adicionar reação' }).click();

  await expect(page.getByPlaceholder('Buscar emoji')).toBeVisible();
  await expect(comment).toHaveAttribute('data-thread-selected', 'true');
});

test('escolher um emoji no seletor adiciona a reação ao comentário', async ({ page }) => {
  await openTimeline(page);
  const comment = page.locator('article.comment-card').first();
  await comment.getByRole('button', { name: 'Adicionar reação' }).click();
  await page.getByPlaceholder('Buscar emoji').fill('rocket');
  await page.getByRole('button', { name: /rocket/i }).first().click();
  await expect(comment.locator('button.comment-reaction', { hasText: '🚀' })).toContainText('1');
});

test('clicar numa resposta destaca o caminho da thread', async ({ page }) => {
  await openTimeline(page);
  const group = page.locator('.thread-group').filter({ has: page.locator('article.thread-reply') }).first();
  const reply = group.locator('article.thread-reply').first();
  await reply.locator('p').click();
  await expect(reply).toHaveAttribute('data-thread-selected', 'true');
  await expect(group).toHaveAttribute('data-thread-path-active', 'true');
});

test('segurar uma reação abre a lista de quem reagiu', async ({ page }) => {
  await openTimeline(page);
  const reaction = page.locator('button.comment-reaction').first();
  const box = (await reaction.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.getByRole('dialog', { name: 'Reações' })).toBeVisible();
  await page.mouse.up();
});

test('responder e apagar a resposta', async ({ page }) => {
  await openTimeline(page);
  const group = page.locator('.thread-group').first();
  await group.locator('article.comment-card').getByRole('button', { name: 'Responder' }).click();
  await group.getByPlaceholder(/^Responder a /).fill('Resposta do teste de timeline');
  await group.getByRole('button', { name: 'Enviar resposta' }).click();
  const reply = group.locator('article.thread-reply', { hasText: 'Resposta do teste de timeline' });
  await expect(reply).toBeVisible();
  await reply.getByRole('button', { name: 'Apagar comentário' }).click();
  await page.getByRole('dialog', { name: 'Apagar comentário?' }).getByRole('button', { name: 'Apagar' }).click();
  await expect(reply).toHaveCount(0);
});
