import { BASE, closeQuickVoting, finish, launch, newUser, note, shot, sql } from './lib.mjs';

const browser = await launch();
const ana = await newUser(browser, 'ana@example.com', 'ana');
const { page } = ana;
const anaId = sql("select id from profiles where email='ana@example.com'");
const voteMonth = sql("select to_char((now() at time zone 'America/Fortaleza') + interval '1 month','YYYY-MM')");
note(`voteMonth=${voteMonth} anaId=${anaId}`);

await page.goto(`${BASE}/ranking`);
await page.waitForSelector('article.ranking-card', { timeout: 60000 });
if (await closeQuickVoting(page)) note('[ana] quick voting deck closed');
await shot(page, 'votes-00-initial');

const card = title => page.locator('article.ranking-card').filter({ hasText: `Fixture: ${title}` });
const myVote = title => sql(`select choice, coalesce(reason,'-'), coalesce(reason_text,'-') from votes v join games g on g.id=v.game_id where v.user_id='${anaId}' and v.vote_month='${voteMonth}' and g.title='Fixture: ${title}'`);
async function expectVote(title, expected) {
  for (let i = 0; i < 40; i++) {
    const got = myVote(title);
    if (got === expected) { note(`OK votes[${title}] = "${got || '(sem linha)'}"`); return true; }
    await page.waitForTimeout(250);
  }
  note(`FAIL votes[${title}] = "${myVote(title)}", esperado "${expected}"`);
  return false;
}
async function rankingDom() {
  return page.locator('article.ranking-card').evaluateAll(cards => cards.map(card => `${card.dataset.rank || '-'}:${card.querySelector('a.text-sm')?.textContent?.replace('Fixture: ', '')}${card.dataset.myChoice ? `(${card.dataset.myChoice})` : ''}`).join(' '));
}
async function choose(title, label) {
  await card(title).getByRole('button', { name: label, exact: true }).click();
}
async function chooseNo(title, reason, text) {
  await choose(title, 'Não');
  const dialog = page.getByRole('dialog', { name: 'Por que você não jogaria?' });
  await dialog.waitFor();
  await dialog.getByRole('button', { name: reason }).click();
  if (text) await dialog.getByPlaceholder('Conte o motivo').fill(text);
  await dialog.getByRole('button', { name: 'Confirmar Não' }).click();
}
async function step(name, action, title, expected) {
  note(`--- ${name}`);
  await action();
  await expectVote(title, expected);
  await page.waitForTimeout(800);
  note(`ranking DOM: ${await rankingDom()}`);
  await shot(page, `votes-${name}`);
}

note(`ranking DOM inicial: ${await rankingDom()}`);
await step('01-jogaria', () => choose('Candidato Longo', 'Jogaria'), 'Candidato Longo', 'would_play | - | -');
await step('02-neutro', () => choose('Candidato Médio', 'Neutro'), 'Candidato Médio', 'neutral | - | -');
await step('03-nao-motivo', () => chooseNo('Candidato Extra', 'Não consigo rodar'), 'Candidato Extra', 'would_not_play | cannot_run | -');
await step('04-nao-outro', () => chooseNo('Candidato Curto', 'Outro', 'Sem tempo este mês'), 'Candidato Curto', 'would_not_play | other | Sem tempo este mês');
await step('05-trocar-jogaria-para-neutro', () => choose('Candidato Longo', 'Neutro'), 'Candidato Longo', 'neutral | - | -');
await step('06-trocar-nao-para-jogaria', () => choose('Candidato Extra', 'Jogaria'), 'Candidato Extra', 'would_play | - | -');
await step('07-retirar-neutro', () => choose('Candidato Longo', 'Neutro'), 'Candidato Longo', '');
await step('08-retirar-nao', () => choose('Candidato Curto', 'Não'), 'Candidato Curto', '');

note('--- recarregar e comparar DOM com o banco');
await page.reload();
await page.waitForSelector('article.ranking-card');
await closeQuickVoting(page);
await page.waitForTimeout(1000);
note(`ranking DOM após reload: ${await rankingDom()}`);
note(`votes no banco:\n${sql(`select p.name, g.title, v.choice, coalesce(v.reason,'-'), coalesce(v.reason_text,'-') from votes v join games g on g.id=v.game_id join profiles p on p.id=v.user_id where v.vote_month='${voteMonth}' order by g.title, p.name`)}`);
note(`supabase.co requests: ${ana.forbidden.length}`);
await shot(page, 'votes-09-reload');
await finish(browser);
