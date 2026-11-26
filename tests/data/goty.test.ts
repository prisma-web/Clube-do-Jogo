import test from 'node:test';
import assert from 'node:assert/strict';
import { configureGotyDemoStorage, createDataClient, GotyDataClient, resetDemoGotyState } from '@clube-do-jogo/data';
import { computeBolaoLeaderboard, GOTY_2026_CURATED_CATALOG } from '@clube-do-jogo/domain';

test('GotyDataClient demo mode enforces bolao lock while keeping Seu GOTY independent', async () => {
  resetDemoGotyState();
  const client = new GotyDataClient(null);
  const scope = { userId: 'demo-user', isDemo: true };

  const initial = await client.readFullState(scope);
  assert.equal(initial.categories.length, 30);
  assert.equal(initial.personalCategories.length, 9);

  const gotyCategory = initial.categories[0];
  const gtaNominee = gotyCategory.nominees.find(item => item.slug === 'grand-theft-auto-vi');
  assert.ok(gtaNominee);

  await client.saveBolaoVote({ ...scope, categoryId: gotyCategory.id, nomineeId: gtaNominee.id });
  await client.setBolaoConfirmation({ ...scope, confirm: true });

  await client.updateEventSettings({ ...scope, status: 'locked' });
  await assert.rejects(
    () => client.saveBolaoVote({ ...scope, categoryId: gotyCategory.id, nomineeId: gotyCategory.nominees[0].id }),
    /encerrado/,
  );

  await client.setCategoryWinner({ ...scope, categoryId: gotyCategory.id, winnerNomineeId: gtaNominee.id });
  const afterWinner = await client.readFullState(scope);
  const board = computeBolaoLeaderboard(
    afterWinner.categories,
    afterWinner.bolaoVotes,
    afterWinner.bolaoSubmissions,
    afterWinner.profiles,
  );
  const me = board.find(entry => entry.user_id === 'demo-user');
  assert.ok(me);
  assert.equal(me.correctCount, 1);
  assert.equal(me.hitGoty, true);

  const myGotyCat = afterWinner.personalCategories[0];
  const game = GOTY_2026_CURATED_CATALOG[0];
  await client.savePersonalPick({ ...scope, categoryId: myGotyCat.id, game });
  const afterPick = await client.readFullState(scope);
  assert.ok(afterPick.personalPicks.some(pick => pick.user_id === 'demo-user' && pick.category_id === myGotyCat.id));

  await client.clearPersonalPick({ ...scope, categoryId: myGotyCat.id });
  const afterClear = await client.readFullState(scope);
  assert.equal(
    afterClear.personalPicks.some(pick => pick.user_id === 'demo-user' && pick.category_id === myGotyCat.id),
    false,
  );
  resetDemoGotyState();
});

test('GotyDataClient demo mode works without window.localStorage (React Native)', async () => {
  const globalRef = globalThis as { localStorage?: unknown };
  const hadLocalStorage = 'localStorage' in globalRef;
  const previousLocalStorage = globalRef.localStorage;
  delete globalRef.localStorage;
  configureGotyDemoStorage(undefined);
  try {
    resetDemoGotyState();
    const client = new GotyDataClient(null);
    const scope = { userId: 'demo-user', isDemo: true };
    const initial = await client.readFullState(scope);
    const category = initial.categories[1];
    await client.saveBolaoVote({ ...scope, categoryId: category.id, nomineeId: category.nominees[0].id });
    const after = await client.readFullState(scope);
    assert.ok(after.bolaoVotes.some(vote => vote.user_id === 'demo-user' && vote.category_id === category.id));
  } finally {
    if (hadLocalStorage) globalRef.localStorage = previousLocalStorage;
    resetDemoGotyState();
  }
});

test('GotyDataClient demo mode persists through an injected storage and supports memory-only mode', async () => {
  const backing = new Map<string, string>();
  const writes: string[] = [];
  configureGotyDemoStorage({
    getItem: key => backing.get(key) ?? null,
    setItem: (key, value) => {
      writes.push(key);
      backing.set(key, value);
    },
  });
  try {
    resetDemoGotyState();
    const client = new GotyDataClient(null);
    const scope = { userId: 'demo-user', isDemo: true };
    const state = await client.readFullState(scope);
    await client.savePersonalPick({ ...scope, categoryId: state.personalCategories[0].id, game: GOTY_2026_CURATED_CATALOG[1] });
    assert.ok(writes.length >= 2);
    const stored = JSON.parse([...backing.values()][0]) as { personalPicks: Array<{ user_id: string }> };
    assert.ok(stored.personalPicks.some(pick => pick.user_id === 'demo-user'));

    configureGotyDemoStorage(null);
    const before = writes.length;
    await client.clearPersonalPick({ ...scope, categoryId: state.personalCategories[0].id });
    assert.equal(writes.length, before);
    const afterClear = await client.readFullState(scope);
    assert.equal(afterClear.personalPicks.some(pick => pick.user_id === 'demo-user'), false);
  } finally {
    configureGotyDemoStorage(undefined);
    resetDemoGotyState();
  }
});

test('o Placar do GOTY demo mostra o perfil atual do demo, não um snapshot antigo', async () => {
  resetDemoGotyState();
  const client = createDataClient();
  const scope = { userId: 'demo-user', isDemo: true };
  try {
    const before = await client.goty.readFullState(scope);
    const oldAvatar = before.profiles.find(profile => profile.id === 'demo-user')?.avatar_url;
    assert.ok(oldAvatar);

    await client.updateProfile({
      userId: 'demo-user',
      isDemo: true,
      patch: { name: 'Artur Novo', avatar_url: 'https://example.test/novo.jpg' },
    });

    const after = await client.goty.readFullState(scope);
    const me = after.profiles.find(profile => profile.id === 'demo-user');
    assert.equal(me?.avatar_url, 'https://example.test/novo.jpg');
    assert.equal(me?.name, 'Artur Novo');
    const others = after.profiles.filter(profile => profile.id !== 'demo-user').map(profile => profile.id);
    assert.deepEqual(others, before.profiles.filter(profile => profile.id !== 'demo-user').map(profile => profile.id));

    client.resetDemo();
    const reset = await client.goty.readFullState(scope);
    assert.equal(reset.profiles.find(profile => profile.id === 'demo-user')?.avatar_url, oldAvatar);
  } finally {
    resetDemoGotyState();
  }
});
