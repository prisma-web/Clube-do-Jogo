import { expect, test, type Page } from '@playwright/test';

function deck(page: Page) {
  return page.getByRole('dialog', { name: 'Qual jogo você quer no clube?' });
}

function cardTitle(page: Page) {
  return deck(page).getByRole('heading', { level: 3 });
}

async function currentTitle(page: Page) {
  await expect(cardTitle(page)).toBeVisible();
  return cardTitle(page).innerText();
}

async function answerNeutral(page: Page) {
  const before = await currentTitle(page);
  await deck(page).getByRole('button', { name: 'Neutro' }).click();
  await expect(cardTitle(page)).not.toHaveText(before);
  return before;
}

test('answered games stay answered when the tab regains focus or reloads', async ({ page }) => {
  await page.goto('/');
  await answerNeutral(page);
  const second = await currentTitle(page);

  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  // Let the forced ranking refresh land before asserting nothing came back.
  await page.waitForTimeout(500);
  await expect(cardTitle(page)).toHaveText(second);

  await page.reload();
  await expect(cardTitle(page)).toHaveText(second);
});
