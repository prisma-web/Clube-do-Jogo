import test from 'node:test';
import assert from 'node:assert/strict';
import { GotyDataClient, resetDemoGotyState } from '@clube-do-jogo/data';
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

  // Lock bolao and register official winner
  await client.updateEventSettings({ ...scope, status: 'locked' });
  await assert.rejects(
    () => client.saveBolaoVote({ ...scope, categoryId: gotyCategory.id, nomineeId: gotyCategory.nominees[0].id }),
    /encerrado/,
  );

  // Register official winner and verify leaderboard scores the user
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

  // Seu GOTY remains editable even when Bolao is locked
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
