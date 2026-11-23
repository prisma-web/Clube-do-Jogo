import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { demoGames } from '@clube-do-jogo/domain/demo';
import { monthKey, rankingScore, shiftMonth } from '@clube-do-jogo/domain';
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
    choice: 'would_not_play',
    reason: 'other',
    reasonText: 'Não quero jogar com o clube.',
  });
  const voted = (await client.readRanking({ userId, isDemo: true, month }))
    .find(entry => entry.game.id === item.game.id);
  assert.equal(voted?.myChoice, 'would_not_play');
  assert.equal(voted?.myReason, 'other');
  assert.equal(voted?.myReasonText, 'Não quero jogar com o clube.');
  assert.equal(voted?.choiceCounts.would_not_play, item.choiceCounts.would_not_play + 1);

  await client.setVote({ userId, isDemo: true, month, gameId: item.game.id, choice: null });
  const cleared = (await client.readRanking({ userId, isDemo: true, month }))
    .find(entry => entry.game.id === item.game.id);
  assert.equal(cleared?.myChoice, null);
  assert.equal(cleared?.choiceCounts.would_not_play, item.choiceCounts.would_not_play);
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

function tableClient(tables: Record<string, unknown[]>) {
  const writes: Array<{ table: string; op: string; values?: unknown }> = [];
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    from(table: string) {
      const result = { data: tables[table] || [], error: null };
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        order: () => query,
        delete() {
          writes.push({ table, op: 'delete' });
          return query;
        },
        insert(values: unknown) {
          writes.push({ table, op: 'insert', values });
          return Promise.resolve({ data: null, error: null });
        },
        then(resolve: (value: typeof result) => unknown) {
          return Promise.resolve(resolve(result));
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { client: createDataClient({ supabase }), writes };
}

const liveGame = { ...demoGames[1], id: 'live-game' };
const neutralOnlyGame = { ...demoGames[2], id: 'neutral-only' };

function vote(user_id: string, game_id: string, choice: string, reason: string | null = null) {
  return { game_id, user_id, choice, reason, reason_text: null, created_at: '2026-11-20T10:00:00.000Z' };
}

test('live neutral votes count as answered, form their own group and score zero', async () => {
  const { client } = tableClient({
    votes: [
      vote('bia', liveGame.id, 'would_play'),
      vote('caio', liveGame.id, 'would_not_play', 'other'),
      vote(userId, liveGame.id, 'neutral'),
      vote('leo', liveGame.id, 'neutral'),
      vote('luiza', liveGame.id, 'unavailable'),
      vote('bia', neutralOnlyGame.id, 'neutral'),
    ],
    games: [liveGame, neutralOnlyGame],
    game_progress: [],
    backlogs: [],
    profiles: [{ id: 'bia', name: 'Bia', avatar_url: null }, { id: 'leo', name: 'Leo', avatar_url: null }],
  });

  const ranking = await client.readRanking({ userId, isDemo: false, month: '2026-11' });
  const live = ranking.find(entry => entry.game.id === liveGame.id);
  const neutralOnly = ranking.find(entry => entry.game.id === neutralOnlyGame.id);

  assert.deepEqual(live?.choiceCounts, { would_play: 1, neutral: 2, would_not_play: 1 });
  assert.deepEqual(live?.choiceProfiles.neutral.map(person => person.id), [userId, 'leo']);
  assert.equal(live?.myChoice, 'neutral');
  assert.equal(live?.votedByMe, true);
  assert.equal(live?.totalPoints, 0);
  assert.equal(live?.votesCount, 4);
  assert.deepEqual(live?.voters.map(person => person.id).sort(), ['bia', 'caio', 'demo-user', 'leo']);
  assert.equal(live?.legacyTotalPoints, rankingScore('legacy', liveGame, { would_play: 1, neutral: 0, would_not_play: 1 }, 0));
  assert.deepEqual(neutralOnly?.choiceCounts, { would_play: 0, neutral: 1, would_not_play: 0 });
  assert.equal(neutralOnly?.votedByMe, false);
  assert.equal(neutralOnly?.totalPoints, 0);
});

test('snapshot rows map neutral counts and ids, and older rows read as zero neutral', async () => {
  const snapshot = (game: typeof liveGame, extra: Record<string, unknown>) => ({
    game_id: game.id,
    vote_count: 3,
    completed_count: 0,
    voter_ids: ['bia', userId, 'leo'],
    completed_user_ids: [],
    playtime_points: 3,
    rating_multiplier: 0.8,
    total_points: 1,
    legacy_total_points: 4.8,
    games: game,
    ...extra,
  });
  const { client } = tableClient({
    ranking_snapshots: [
      snapshot(liveGame, {
        would_play_count: 1,
        neutral_count: 2,
        would_not_play_count: 0,
        would_play_user_ids: ['bia'],
        neutral_user_ids: [userId, 'leo'],
        would_not_play_user_ids: [],
      }),
      snapshot(neutralOnlyGame, { would_play_count: 1, would_not_play_count: 0, would_play_user_ids: ['bia'], would_not_play_user_ids: [] }),
    ],
    profiles: [{ id: 'bia', name: 'Bia', avatar_url: null }],
    backlogs: [],
  });

  const ranking = await client.readRanking({ userId, isDemo: false, month: '2026-10', historical: true });
  const frozen = ranking.find(entry => entry.game.id === liveGame.id);
  const older = ranking.find(entry => entry.game.id === neutralOnlyGame.id);

  assert.deepEqual(frozen?.choiceCounts, { would_play: 1, neutral: 2, would_not_play: 0 });
  assert.deepEqual(frozen?.choiceProfiles.neutral.map(person => person.id), [userId, 'leo']);
  assert.equal(frozen?.myChoice, 'neutral');
  assert.equal(frozen?.votedByMe, true);
  assert.equal(frozen?.totalPoints, 1);
  assert.deepEqual(older?.choiceCounts, { would_play: 1, neutral: 0, would_not_play: 0 });
  assert.deepEqual(older?.choiceProfiles.neutral, []);
  assert.equal(older?.votedByMe, false);
});

test('a neutral vote is stored as a row, not deleted', async () => {
  const { client, writes } = tableClient({});
  await client.setVote({ userId, isDemo: false, month: '2026-11', gameId: liveGame.id, choice: 'neutral', reason: 'other', reasonText: 'sem motivo' });

  const inserted = writes.find(write => write.op === 'insert');
  assert.deepEqual(inserted, {
    table: 'votes',
    op: 'insert',
    values: { user_id: userId, game_id: liveGame.id, vote_month: '2026-12', choice: 'neutral', reason: null, reason_text: null },
  });
});

test('demo neutral answers persist like other demo votes', async () => {
  const client = createDataClient();
  const item = (await client.readRanking({ userId, isDemo: true, month })).find(entry => !entry.votedByMe);
  assert.ok(item);

  await client.setVote({ userId, isDemo: true, month, gameId: item.game.id, choice: 'neutral', reason: 'other', reasonText: 'ignorado' });
  const neutral = (await client.readRanking({ userId, isDemo: true, month })).find(entry => entry.game.id === item.game.id);

  assert.equal(neutral?.myChoice, 'neutral');
  assert.equal(neutral?.votedByMe, true);
  assert.equal(neutral?.myReason, null);
  assert.equal(neutral?.choiceCounts.neutral, item.choiceCounts.neutral + 1);
  assert.equal(neutral?.totalPoints, item.totalPoints);
  assert.ok(neutral?.choiceProfiles.neutral.some(person => person.id === userId));
  assert.ok((await client.readLibrary({ userId, profileId: userId, isDemo: true })).votedGameIds.includes(item.game.id));
});
