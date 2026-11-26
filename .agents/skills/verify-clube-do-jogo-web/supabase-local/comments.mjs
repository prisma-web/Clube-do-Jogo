import { BASE, closeQuickVoting, finish, launch, newUser, note, shot, sql, tap } from './lib.mjs';

const browser = await launch();
const ana = await newUser(browser, 'ana@example.com', 'ana');
const bruno = await newUser(browser, 'bruno@example.com', 'bruno');
const month = sql("select month from club_months where status='active'");
note(`ciclo ativo ${month}`);

async function openTimeline(user) {
  await user.page.goto(`${BASE}/jogo-do-mes?section=timeline`);
  await closeQuickVoting(user.page);
  const tab = user.page.getByRole('tab', { name: 'Timeline' });
  if (await tab.isVisible().catch(() => false)) await tab.click();
  await user.page.getByPlaceholder('O que você está achando do jogo?').waitFor({ timeout: 60000 });
  await closeQuickVoting(user.page);
}
const comments = () => sql(`select p.name, coalesce(left(parent_id::text,8),'-'), c.body from club_comments c join profiles p on p.id=c.user_id where club_month='${month}' order by c.created_at`);
const reactions = () => sql(`select p.name, r.emoji, left(c.body, 30) from comment_reactions r join profiles p on p.id=r.user_id join club_comments c on c.id=r.comment_id order by r.created_at`);
async function until(label, read, predicate) {
  for (let i = 0; i < 40; i++) {
    const value = read();
    if (predicate(value)) { note(`OK ${label}:\n${value || '(vazio)'}`); return true; }
    await ana.page.waitForTimeout(250);
  }
  note(`FAIL ${label}:\n${read() || '(vazio)'}`);
  return false;
}
const card = (page, text) => page.locator('article.thread-transmission').filter({ hasText: text });

await openTimeline(ana);
await openTimeline(bruno);
await shot(ana.page, 'comments-00-ana');

note('--- Ana comenta; Bruno deve ver sem recarregar (realtime)');
await ana.page.getByPlaceholder('O que você está achando do jogo?').fill('Comentário da Ana pela fixture');
await tap(ana.page, ana.page.getByRole('button', { name: 'Comentar' }), 'Comentar');
await until('club_comments após comentar', comments, value => value.includes('Comentário da Ana pela fixture'));
try {
  await card(bruno.page, 'Comentário da Ana pela fixture').waitFor({ timeout: 15000 });
  note('OK realtime: comentário da Ana apareceu para o Bruno sem reload');
} catch { note('FAIL realtime: comentário da Ana não apareceu para o Bruno em 15 s'); }
await shot(bruno.page, 'comments-01-bruno-ve-ana');

note('--- Bruno responde');
await tap(bruno.page, card(bruno.page, 'Comentário da Ana pela fixture').getByRole('button', { name: 'Responder' }), 'Responder');
await bruno.page.getByPlaceholder('Responder a Ana Fixture…').fill('Resposta do Bruno');
await tap(bruno.page, bruno.page.getByRole('button', { name: 'Enviar resposta' }), 'Enviar resposta');
await until('club_comments após responder', comments, value => value.includes('Resposta do Bruno'));
try {
  await card(ana.page, 'Resposta do Bruno').waitFor({ timeout: 15000 });
  note('OK realtime: resposta do Bruno apareceu para a Ana');
} catch { note('FAIL realtime: resposta do Bruno não apareceu para a Ana'); }

note('--- Bruno reage no comentário da Ana pelo seletor (primeiro clique abre, #34)');
const anaCardForBruno = card(bruno.page, 'Comentário da Ana pela fixture').first();
await tap(bruno.page, anaCardForBruno.getByRole('button', { name: 'Adicionar reação' }).first(), 'Adicionar reação');
const search = bruno.page.getByPlaceholder('Buscar emoji');
try {
  await search.waitFor({ timeout: 5000 });
  note('OK seletor de emoji abriu no primeiro clique');
} catch { note('FAIL seletor de emoji não abriu no primeiro clique'); }
await search.fill('fire');
await tap(bruno.page, bruno.page.locator('button[data-unified]').first(), 'emoji');
await until('comment_reactions após reagir', reactions, value => value.includes('Bruno Fixture'));
await shot(bruno.page, 'comments-02-bruno-reagiu');
const emoji = sql("select emoji from comment_reactions limit 1");
note(`emoji salvo: ${emoji}`);
try {
  await card(ana.page, 'Comentário da Ana pela fixture').first().locator('button.comment-reaction').waitFor({ timeout: 15000 });
  note('OK realtime: reação do Bruno apareceu para a Ana');
} catch { note('FAIL realtime: reação do Bruno não apareceu para a Ana'); }

note('--- Ana reage com o mesmo emoji clicando no chip, depois segura para ver quem reagiu');
const chip = card(ana.page, 'Comentário da Ana pela fixture').first().locator('button.comment-reaction').first();
await tap(ana.page, chip, 'chip');
await until('comment_reactions com Ana', reactions, value => value.includes('Ana Fixture'));
const box = await chip.boundingBox();
await ana.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await ana.page.mouse.down();
await ana.page.waitForTimeout(800);
await ana.page.mouse.up();
const dialog = ana.page.getByRole('dialog', { name: 'Reações' });
try {
  await dialog.waitFor({ timeout: 5000 });
  note(`OK segurar abre "Reações": ${(await dialog.innerText()).replace(/\s+/g, ' ')}`);
  await shot(ana.page, 'comments-03-quem-reagiu');
  await tap(ana.page, dialog.getByRole('button', { name: 'Fechar' }), 'Fechar');
} catch { note('FAIL segurar não abriu o diálogo de reações'); }
await until('segurar não alterna a reação', reactions, value => value.includes('Ana Fixture'));

note('--- Ana desfaz a própria reação com um clique');
await tap(ana.page, chip, 'chip');
await until('comment_reactions sem Ana', reactions, value => !value.includes('Ana Fixture') && value.includes('Bruno Fixture'));

note('--- Bruno apaga a resposta');
await tap(bruno.page, card(bruno.page, 'Resposta do Bruno').getByRole('button', { name: 'Apagar comentário' }), 'Apagar comentário');
await tap(bruno.page, bruno.page.getByRole('dialog').getByRole('button', { name: 'Apagar', exact: true }), 'Apagar');
await until('club_comments sem a resposta', comments, value => !value.includes('Resposta do Bruno') && value.includes('Comentário da Ana'));
try {
  await card(ana.page, 'Resposta do Bruno').waitFor({ state: 'detached', timeout: 15000 });
  note('OK realtime: resposta apagada sumiu para a Ana');
} catch { note('FAIL realtime: resposta apagada continua na tela da Ana'); }

note('--- Bruno não pode apagar o comentário da Ana (sem botão)');
note(`botões de apagar no card da Ana vistos pelo Bruno: ${await card(bruno.page, 'Comentário da Ana pela fixture').getByRole('button', { name: 'Apagar comentário' }).count()}`);

note('--- Ana apaga o próprio comentário (com reação do Bruno)');
await tap(ana.page, card(ana.page, 'Comentário da Ana pela fixture').getByRole('button', { name: 'Apagar comentário' }), 'Apagar comentário');
await tap(ana.page, ana.page.getByRole('dialog').getByRole('button', { name: 'Apagar', exact: true }), 'Apagar');
await until('club_comments vazio', comments, value => value === '');
await until('comment_reactions vazio (cascade)', reactions, value => value === '');
try {
  await card(bruno.page, 'Comentário da Ana pela fixture').waitFor({ state: 'detached', timeout: 15000 });
  note('OK realtime: comentário apagado sumiu para o Bruno');
} catch { note('FAIL realtime: comentário apagado continua na tela do Bruno'); }
await shot(bruno.page, 'comments-04-bruno-final');
note(`supabase.co requests: ${ana.forbidden.length + bruno.forbidden.length}`);
await finish(browser);
