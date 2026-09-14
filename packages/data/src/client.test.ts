import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { demoGames } from '@clube-do-jogo/domain/demo';
import { monthKey, shiftMonth } from '@clube-do-jogo/domain';
import { DataError, createDataClient } from './index';

const userId = 'demo-user';
const month = monthKey();

test('demo votes are mutable in memory and preserve the displayed month boundary', async () => {
  const client = createDataClient();
  const initial = await client.readRanking({ userId, isDemo: true, month });
  const item = initial.find(entry => !entry.votedByMe);
  assert.ok(item);

  await client.setVote({
    userId,
    isDemo: true,
    month,
    gameId: item.game.id,
    choice: 'would_play',
    reason: 'other',
    reasonText: 'Quero jogar com o clube.',
  });
  const voted = (await client.readRanking({ userId, isDemo: true, month }))
    .find(entry => entry.game.id === item.game.id);
  assert.equal(voted?.myChoice, 'would_play');
  assert.equal(voted?.myReason, 'other');
  assert.equal(voted?.myReasonText, 'Quero jogar com o clube.');
  assert.equal(voted?.choiceCounts.would_play, item.choiceCounts.would_play + 1);

  await client.setVote({ userId, isDemo: true, month, gameId: item.game.id, choice: null });
  const cleared = (await client.readRanking({ userId, isDemo: true, month }))
    .find(entry => entry.game.id === item.game.id);
  assert.equal(cleared?.myChoice, null);
  assert.equal(cleared?.choiceCounts.would_play, item.choiceCounts.would_play);
});

test('real vote writes delete before insert and shifts the visible month by one', async () => {
  const calls: Array<[string, unknown?]> = [];
  let inserted: unknown;
  const makeQuery = () => {
    const query = {
      delete() {
        calls.push(['delete']);
        return query;
      },
      eq(column: string, value: unknown) {
        calls.push([column, value]);
        return query;
      },
      insert(values: unknown) {
        inserted = values;
        calls.push(['insert']);
        return Promise.resolve({ data: null, error: null });
      },
      then(resolve: (value: { data: never[]; error: null }) => unknown) {
        return Promise.resolve(resolve({ data: [], error: null }));
      },
    };
    return query;
  };
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    from(table: string) {
      calls.push(['from', table]);
      return makeQuery();
    },
  } as unknown as SupabaseClient;
  const client = createDataClient({ supabase });

  await client.setVote({
    userId,
    isDemo: false,
    month: '2026-12',
    gameId: demoGames[1].id,
    choice: 'would_not_play',
  });

  assert.deepEqual(calls.slice(0, 5), [
    ['from', 'votes'],
    ['delete'],
    ['user_id', userId],
    ['game_id', demoGames[1].id],
    ['vote_month', '2027-01'],
  ]);
  assert.deepEqual(calls[5], ['from', 'votes']);
  assert.deepEqual(calls[6], ['insert']);
  assert.deepEqual(inserted, {
    user_id: userId,
    game_id: demoGames[1].id,
    vote_month: '2027-01',
    choice: 'would_not_play',
    reason: null,
    reason_text: null,
  });
});

test('demo mutations keep the selected ranking formula', async () => {
  const client = createDataClient({ rankingFormula: 'legacy' });
  const item = (await client.readRanking({ userId, isDemo: true, month }))
    .find(entry => !entry.votedByMe);
  assert.ok(item);
  await client.setVote({ userId, isDemo: true, month, gameId: item.game.id, choice: 'would_play' });
  const updated = (await client.readRanking({ userId, isDemo: true, month }))
    .find(entry => entry.game.id === item.game.id);
  assert.equal(updated?.totalPoints, updated?.legacyTotalPoints);
});

test('demo progress, backlog and favorites remain coherent after mutations', async () => {
  const client = createDataClient();
  const gameId = demoGames[10].id;

  await client.setProgress({ userId, isDemo: true, gameId, status: 'started' });
  let progress = await client.readProgress({ userId, isDemo: true, gameId, month });
  assert.equal(progress.find(entry => entry.user_id === userId)?.status, 'started');

  await client.setProgress({ userId, isDemo: true, gameId, status: 'finished' });
  progress = await client.readProgress({ userId, isDemo: true, gameId, month });
  const finished = progress.find(entry => entry.user_id === userId);
  assert.equal(finished?.status, 'finished');
  assert.ok(finished?.started_at);
  assert.ok(finished?.finished_at);

  await client.setBacklog({ userId, isDemo: true, gameId, inBacklog: true });
  await client.setFavorite({ userId, isDemo: true, gameId, favorite: true });
  let library = await client.readLibrary({ userId, profileId: userId, isDemo: true, voteMonth: shiftMonth(month, 1) });
  let entry = library.library.find(item => item.game.id === gameId);
  assert.equal(entry?.inBacklog, true);
  assert.equal(entry?.favorite, true);
  assert.equal(entry?.progress?.status, 'finished');

  await client.setBacklog({ userId, isDemo: true, gameId, inBacklog: false });
  await client.setFavorite({ userId, isDemo: true, gameId, favorite: false });
  library = await client.readLibrary({ userId, profileId: userId, isDemo: true });
  entry = library.library.find(item => item.game.id === gameId);
  assert.equal(entry?.inBacklog, false);
  assert.equal(entry?.favorite, false);
  assert.equal(entry?.progress?.status, 'finished');
});

test('historical demo mutations are rejected as read only', async () => {
  const client = createDataClient();
  await assert.rejects(
    client.setVote({ userId, isDemo: true, month, historical: true, gameId: demoGames[1].id, choice: 'would_play' }),
    (error: unknown) => error instanceof DataError && /somente leitura/i.test(error.message),
  );
  await assert.rejects(
    client.setProgress({ userId, isDemo: true, gameId: demoGames[1].id, historical: true, status: 'started' }),
    (error: unknown) => error instanceof DataError && /somente leitura/i.test(error.message),
  );
});
