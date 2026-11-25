import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  computeBolaoProgress,
  createDemoGotyState,
  GOTY_2026_CURATED_CATALOG,
} from '@clube-do-jogo/domain';
import {
  applyBolaoConfirmation,
  applyBolaoVote,
  applyCategoryWinner,
  applyEventPatch,
  applyPersonalPick,
  ballotFilterCount,
  buildSearchGamesPath,
  filterBallotCategories,
  formatDeadlineInput,
  hasUnresolvedGameCovers,
  isTabBarRoute,
  gotyBadgeBottomOffset,
  gotyBadgeClearance,
  parseDeadlineInput,
  parseGotyTab,
  removePersonalPick,
  resolveCoversInBatches,
  searchGotyDemoCatalog,
  shouldShowGotyBadge,
} from '../../apps/mobile/src/features/goty/goty-logic';
import {
  clearNavIntent,
  captureNavIntent,
  consumeNavIntent,
  GOTY_ROUTE,
  resolveNavIntent,
} from '../../apps/mobile/src/lib/nav-intent';

const USER = 'demo-user';

test('deep link /goty-2026 vira intent da tela GOTY, com ?tab opcional e validado', () => {
  assert.deepEqual(resolveNavIntent('/goty-2026'), { pathname: GOTY_ROUTE });
  assert.deepEqual(resolveNavIntent('/goty-2026/'), { pathname: GOTY_ROUTE });
  assert.deepEqual(resolveNavIntent('/goty-2026?tab=seu-goty'), { pathname: GOTY_ROUTE, params: { tab: 'seu-goty' } });
  assert.deepEqual(resolveNavIntent('clubedojogo://goty-2026?tab=bolao'), { pathname: GOTY_ROUTE, params: { tab: 'bolao' } });
  assert.deepEqual(resolveNavIntent('clubedojogo://goty-2026?tab=hack'), { pathname: GOTY_ROUTE });
  assert.equal(resolveNavIntent('https://evil.example/goty-2026'), null);
  assert.equal(resolveNavIntent('/goty-2026/extra'), null);
});

test('deep links antigos continuam iguais e captura ignora rotas desconhecidas', () => {
  clearNavIntent();
  assert.deepEqual(resolveNavIntent('/jogos/abc%20d?x=1'), { pathname: '/(app)/jogos/[id]', params: { id: 'abc d' } });
  assert.deepEqual(resolveNavIntent('clubedojogo://perfil/u1'), { pathname: '/(app)/perfil/[id]', params: { id: 'u1' } });
  assert.equal(resolveNavIntent('/jogos/%E0%A4%A'), null);

  captureNavIntent('/goty-2026?tab=seu-goty');
  captureNavIntent('/rota-que-nao-existe');
  assert.deepEqual(consumeNavIntent(), { pathname: GOTY_ROUTE, params: { tab: 'seu-goty' } });
  assert.equal(consumeNavIntent(), null);
});

test('param ?tab da tela aceita apenas bolao|seu-goty', () => {
  assert.equal(parseGotyTab('seu-goty'), 'seu-goty');
  assert.equal(parseGotyTab(['seu-goty']), 'seu-goty');
  assert.equal(parseGotyTab('bolao'), 'bolao');
  assert.equal(parseGotyTab(undefined), 'bolao');
  assert.equal(parseGotyTab('qualquer'), 'bolao');
});

test('badge flutuante some só na rota GOTY e sobe acima da tab bar nas abas', () => {
  assert.equal(shouldShowGotyBadge('/goty-2026'), false);
  assert.equal(shouldShowGotyBadge('/goty-2026/x'), false);
  assert.equal(shouldShowGotyBadge('/ranking'), true);
  assert.equal(shouldShowGotyBadge('/jogos/abc'), true);
  assert.equal(isTabBarRoute('/jogos'), true);
  assert.equal(isTabBarRoute('/jogos/abc'), false);
  assert.equal(isTabBarRoute('/configuracoes'), false);
});

test('filtros e busca do Bolão seguem as regras da web', () => {
  const state = createDemoGotyState();
  assert.equal(state.categories.length, 30);
  const voted = new Map([[state.categories[0].id, state.categories[0].nominees[0].id]]);

  assert.equal(filterBallotCategories(state.categories, voted, 'all', '').length, 30);
  assert.equal(filterBallotCategories(state.categories, voted, 'answered', '').length, 1);
  assert.equal(filterBallotCategories(state.categories, voted, 'pending', '').length, 29);
  const main = filterBallotCategories(state.categories, voted, 'main', '');
  assert.ok(main.length > 0 && main.every(category => category.section === 'main'));
  assert.equal(ballotFilterCount('main', state.categories, 1), main.length);
  assert.equal(ballotFilterCount('pending', state.categories, 1), 29);

  // Busca por indicado, sem acento e sem diferenciar maiúsculas
  const byNominee = filterBallotCategories(state.categories, voted, 'all', 'grand theft');
  assert.ok(byNominee.some(category => category.slug === 'game-of-the-year'));
  const byPtName = filterBallotCategories(state.categories, voted, 'all', 'DIRECAO');
  assert.ok(byPtName.some(category => category.slug === 'best-game-direction'));
  assert.equal(filterBallotCategories(state.categories, voted, 'all', 'zzzz-nada').length, 0);
});

test('transformações otimistas substituem o palpite e a confirmação do usuário', () => {
  const state = createDemoGotyState();
  const category = state.categories[0];
  const first = applyBolaoVote(state, USER, category.id, category.nominees[0].id, '2026-11-24T10:00:00.000Z');
  const second = applyBolaoVote(first, USER, category.id, category.nominees[1].id, '2026-11-24T10:01:00.000Z');
  const mine = second.bolaoVotes.filter(vote => vote.user_id === USER);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].nominee_id, category.nominees[1].id);
  assert.equal(computeBolaoProgress(second.categories, mine).answered, 1);
  assert.equal(state.bolaoVotes.some(vote => vote.user_id === USER), false, 'estado anterior intacto para rollback');

  const confirmed = applyBolaoConfirmation(second, USER, true, '2026-11-24T10:02:00.000Z');
  assert.equal(confirmed.bolaoSubmissions.find(item => item.user_id === USER)?.confirmed_at, '2026-11-24T10:02:00.000Z');
  const reopened = applyBolaoConfirmation(confirmed, USER, false);
  assert.equal(reopened.bolaoSubmissions.filter(item => item.user_id === USER).length, 1);
  assert.equal(reopened.bolaoSubmissions.find(item => item.user_id === USER)?.confirmed_at, null);
});

test('Seu GOTY e Admin aplicam patches otimistas consistentes', () => {
  const state = createDemoGotyState();
  const categoryId = state.personalCategories[0].id;
  const game = GOTY_2026_CURATED_CATALOG[2];
  const picked = applyPersonalPick(state, USER, categoryId, game);
  const pick = picked.personalPicks.find(item => item.user_id === USER && item.category_id === categoryId);
  assert.equal(pick?.game_title, game.title);
  assert.equal(pick?.release_eligibility, game.release_eligibility);
  assert.equal(removePersonalPick(picked, USER, categoryId).personalPicks.some(item => item.user_id === USER), false);

  const locked = applyEventPatch(state, { status: 'locked', personalVotingOpen: false });
  assert.equal(locked.event.status, 'locked');
  assert.equal(locked.event.personal_voting_open, false);
  assert.equal(locked.event.voting_closes_at, state.event.voting_closes_at);
  assert.equal(applyEventPatch(state, { votingClosesAt: null }).event.voting_closes_at, null);

  const goty = state.categories[0];
  const withWinner = applyCategoryWinner(state, USER, goty.id, goty.nominees[2].id, '2026-12-10T23:00:00.000Z');
  assert.equal(withWinner.categories[0].winner_nominee_id, goty.nominees[2].id);
  assert.equal(withWinner.categories[0].winner_set_by, USER);
  const cleared = applyCategoryWinner(withWinner, USER, goty.id, null);
  assert.equal(cleared.categories[0].winner_nominee_id, null);
  assert.equal(cleared.categories[0].winner_set_at, null);
});

test('prazo do Bolão: formato DD/MM/AAAA HH:mm ida e volta, vazio remove e inválido é recusado', () => {
  const iso = new Date(2026, 11, 10, 20, 59).toISOString();
  const text = formatDeadlineInput(iso);
  assert.equal(text, '10/12/2026 20:59');
  assert.deepEqual(parseDeadlineInput(text), { ok: true, iso });
  assert.deepEqual(parseDeadlineInput('  '), { ok: true, iso: null });
  assert.deepEqual(parseDeadlineInput('10/12/2026'), { ok: true, iso: new Date(2026, 11, 10, 23, 59).toISOString() });
  assert.equal(parseDeadlineInput('31/02/2026 10:00').ok, false);
  assert.equal(parseDeadlineInput('2026-12-10').ok, false);
  assert.equal(parseDeadlineInput('10/13/2026 10:00').ok, false);
});

test('capas: detecta pendências e resolve em lotes até remaining=0 (máx. 6)', async () => {
  const state = createDemoGotyState();
  assert.equal(hasUnresolvedGameCovers(state), true);
  const resolved = {
    ...state,
    categories: state.categories.map(category => ({
      ...category,
      nominees: category.nominees.map(nominee => ({ ...nominee, image_url: 'https://img/x.jpg' })),
    })),
  };
  assert.equal(hasUnresolvedGameCovers(resolved), false);

  const calls: number[] = [];
  const refreshes: number[] = [];
  const responses = [{ updated: 5, remaining: 2 }, { updated: 0, remaining: 1 }, { updated: 3, remaining: 0 }];
  const total = await resolveCoversInBatches({
    limit: 20,
    requestBatch: async limit => {
      calls.push(limit);
      return responses[calls.length - 1];
    },
    onBatchUpdated: updated => {
      refreshes.push(updated);
    },
  });
  assert.equal(total, 8);
  assert.deepEqual(calls, [20, 20, 20]);
  assert.deepEqual(refreshes, [5, 3]);

  let count = 0;
  await resolveCoversInBatches({ limit: 25, requestBatch: async () => { count += 1; return { updated: 1, remaining: 9 }; } });
  assert.equal(count, 6);

  let cancelledCalls = 0;
  await resolveCoversInBatches({ limit: 25, isCancelled: () => true, requestBatch: async () => { cancelledCalls += 1; return {}; } });
  assert.equal(cancelledCalls, 0);
});

test('busca de jogos: rota com includeAllYears e catálogo curado de reserva', () => {
  assert.equal(buildSearchGamesPath(' cairn ', true), '/api/goty/search-games?q=cairn&includeAllYears=true&limit=18');
  assert.equal(buildSearchGamesPath('', false, 5), '/api/goty/search-games?q=&includeAllYears=false&limit=5');

  const only2026 = searchGotyDemoCatalog('', false);
  assert.ok(only2026.length > 0 && only2026.length <= 18);
  assert.ok(only2026.every(game => GOTY_2026_CURATED_CATALOG.includes(game)));
  assert.ok(searchGotyDemoCatalog('grand theft', false).some(game => game.title === 'Grand Theft Auto VI'));

  const withOtherYears = searchGotyDemoCatalog('', true, 500);
  assert.ok(withOtherYears.length > GOTY_2026_CURATED_CATALOG.length);
  assert.ok(withOtherYears.some(game => !game.is_eligible_2026));
});

test('o fim das listas sai de baixo do badge GOTY nas abas e nas telas empilhadas', () => {
  // Abas: o conteúdo termina na tab bar; o badge fica 12 acima dela e tem 48 de altura.
  assert.equal(gotyBadgeBottomOffset('/ranking', 24), 24 + 56 + 12);
  assert.equal(gotyBadgeClearance('/ranking', 24), 12 + 48 + 12);
  assert.equal(gotyBadgeClearance('/ranking', 0), gotyBadgeClearance('/ranking', 48));
  // Telas empilhadas: o conteúdo vai até a borda, então o inset entra na folga.
  assert.equal(gotyBadgeBottomOffset('/jogos/abc', 24), 36);
  assert.equal(gotyBadgeClearance('/jogos/abc', 24), 36 + 48 + 12);
  assert.equal(gotyBadgeClearance('/jogos/abc', 0), 16 + 48 + 12);
  // Onde o badge não aparece, nenhuma folga extra.
  assert.equal(gotyBadgeClearance('/goty-2026', 24), 0);
});
