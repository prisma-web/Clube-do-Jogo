import { BASE, closeQuickVoting, finish, launch, newUser, note, shot, sql } from './lib.mjs';

sql('delete from club_comments');
const [month, gameId] = sql("select month || ' | ' || game_id from club_months where status='active'").split(' | ');
sql(`insert into club_comments (user_id, game_id, club_month, body) select id, '${gameId}', '${month}', 'Comentário para segurar' from profiles where email='bruno@example.com'`);
sql(`insert into comment_reactions (comment_id, user_id, game_id, club_month, emoji) select c.id, p.id, c.game_id, c.club_month, '🔥' from club_comments c, profiles p where p.email='bruno@example.com'`);
const anaReacted = () => sql("select count(*) from comment_reactions r join profiles p on p.id=r.user_id where p.email='ana@example.com'");

const browser = await launch();
const ana = await newUser(browser, 'ana@example.com', 'ana');
const { page } = ana;
await page.goto(`${BASE}/jogo-do-mes?section=timeline`);
await page.getByText('Comentário para segurar').waitFor({ timeout: 60000 });
await closeQuickVoting(page);
const chip = page.locator('article.thread-transmission button.comment-reaction').first();

async function hold() {
  const box = await chip.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  const dialog = page.getByRole('dialog', { name: 'Reações' });
  await dialog.waitFor({ timeout: 5000 });
  await dialog.getByRole('button', { name: 'Fechar' }).click();
  await dialog.waitFor({ state: 'detached' });
}
async function clickAndRead(label) {
  await closeQuickVoting(page);
  await chip.click();
  await page.waitForTimeout(1500);
  note(`${label}: reações da Ana no banco = ${anaReacted()}, chip ativo = ${await chip.getAttribute('data-active')}`);
}

note('--- controle: clique sem segurar antes');
await clickAndRead('1º clique (controle)');
await clickAndRead('2º clique (controle)');
note('--- segurar, fechar, clicar');
await hold();
note(`depois de segurar: reações da Ana = ${anaReacted()}`);
await clickAndRead('1º clique depois de segurar');
await clickAndRead('2º clique depois de segurar');
await shot(page, 'hold-final');
await finish(browser);
