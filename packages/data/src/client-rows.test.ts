import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DataError, createDataClient } from './index';

type Step = [string, ...unknown[]];
type Call = { table: string; chain: Step[] };
type Result = { data?: unknown; error?: unknown };

function recorder(results: Record<string, Result> = {}) {
  const calls: Call[] = [];
  let sessionChecks = 0;
  const supabase = {
    auth: {
      async getUser() {
        sessionChecks += 1;
        return { data: { user: { id: 'u1' } }, error: null };
      },
    },
    from(table: string) {
      const call: Call = { table, chain: [] };
      calls.push(call);
      const outcome = () => ({ data: results[table]?.data ?? null, error: results[table]?.error ?? null });
      const query: unknown = new Proxy({}, {
        get(_target, prop) {
          if (prop === 'then') {
            return (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(outcome()).then(resolve, reject);
          }
          return (...args: unknown[]) => {
            call.chain.push([String(prop), ...args]);
            return query;
          };
        },
      });
      return query;
    },
  } as unknown as SupabaseClient;
  return { client: createDataClient({ supabase }), calls, sessionChecks: () => sessionChecks };
}

test('upsertVote keeps the vote key and omits reason columns that were not given', async () => {
  const { client, calls, sessionChecks } = recorder();
  await client.upsertVote({ userId: 'u1', gameId: 'g1', voteMonth: '2026-12', choice: 'would_play' });
  await client.upsertVote({ userId: 'u1', gameId: 'g1', voteMonth: '2026-12', choice: 'would_not_play', reason: 'other', reasonText: ' texto ' });
  await client.upsertVote({ userId: 'u1', gameId: 'g1', voteMonth: '2026-12', choice: 'neutral', reason: null, reasonText: null });

  assert.deepEqual(calls, [
    { table: 'votes', chain: [['upsert', { user_id: 'u1', game_id: 'g1', vote_month: '2026-12', choice: 'would_play' }, { onConflict: 'user_id,game_id,vote_month' }]] },
    { table: 'votes', chain: [['upsert', { user_id: 'u1', game_id: 'g1', vote_month: '2026-12', choice: 'would_not_play', reason: 'other', reason_text: ' texto ' }, { onConflict: 'user_id,game_id,vote_month' }]] },
    { table: 'votes', chain: [['upsert', { user_id: 'u1', game_id: 'g1', vote_month: '2026-12', choice: 'neutral', reason: null, reason_text: null }, { onConflict: 'user_id,game_id,vote_month' }]] },
  ]);
  assert.equal(sessionChecks(), 0);
});

test('deleteVote filters by user, game and vote month', async () => {
  const { client, calls } = recorder();
  await client.deleteVote({ userId: 'u1', gameId: 'g1', voteMonth: '2026-12' });
  assert.deepEqual(calls, [{ table: 'votes', chain: [['delete'], ['eq', 'user_id', 'u1'], ['eq', 'game_id', 'g1'], ['eq', 'vote_month', '2026-12']] }]);
});

test('backlog and favorite rows upsert on user and game and delete by the same key', async () => {
  const { client, calls } = recorder();
  const row = { userId: 'u1', gameId: 'g1' };
  await client.upsertBacklog(row);
  await client.deleteBacklog(row);
  await client.upsertFavorite(row);
  await client.deleteFavorite(row);
  assert.deepEqual(calls, [
    { table: 'backlogs', chain: [['upsert', { user_id: 'u1', game_id: 'g1' }, { onConflict: 'user_id,game_id' }]] },
    { table: 'backlogs', chain: [['delete'], ['eq', 'user_id', 'u1'], ['eq', 'game_id', 'g1']] },
    { table: 'favorite_games', chain: [['upsert', { user_id: 'u1', game_id: 'g1' }, { onConflict: 'user_id,game_id' }]] },
    { table: 'favorite_games', chain: [['delete'], ['eq', 'user_id', 'u1'], ['eq', 'game_id', 'g1']] },
  ]);
});

test('upsertProgress writes only the stored progress columns given by the caller', async () => {
  const { client, calls } = recorder();
  const progress = {
    id: 'local-id',
    user_id: 'u1',
    game_id: 'g1',
    status: 'finished' as const,
    rating: 8,
    rating_mode: 'simple' as const,
    rating_details: null,
    started_at: '2026-11-01T00:00:00.000Z',
    finished_at: '2026-11-20T00:00:00.000Z',
    profile: { id: 'u1', name: 'Ana', avatar_url: null },
  };
  await client.upsertProgress({ userId: 'u1', gameId: 'g1', progress, updatedAt: '2026-11-25T10:00:00.000Z' });
  assert.deepEqual(calls, [{
    table: 'game_progress',
    chain: [['upsert', {
      user_id: 'u1',
      game_id: 'g1',
      status: 'finished',
      rating: 8,
      rating_mode: 'simple',
      rating_details: null,
      started_at: '2026-11-01T00:00:00.000Z',
      finished_at: '2026-11-20T00:00:00.000Z',
      updated_at: '2026-11-25T10:00:00.000Z',
    }, { onConflict: 'user_id,game_id' }]],
  }]);
});

test('updateRating updates the existing progress row without upserting', async () => {
  const { client, calls } = recorder();
  await client.updateRating({ userId: 'u1', gameId: 'g1', rating: 7.5, ratingMode: 'detailed', ratingDetails: { fun: 9, story: null } });
  assert.equal(calls.length, 1);
  const [update, ...filters] = calls[0].chain;
  assert.equal(calls[0].table, 'game_progress');
  assert.equal(update[0], 'update');
  const values = update[1] as Record<string, unknown>;
  assert.deepEqual({ ...values, updated_at: typeof values.updated_at }, { rating: 7.5, rating_mode: 'detailed', rating_details: { fun: 9, story: null }, updated_at: 'string' });
  assert.ok(!Number.isNaN(Date.parse(values.updated_at as string)));
  assert.deepEqual(filters, [['eq', 'user_id', 'u1'], ['eq', 'game_id', 'g1']]);
});

test('user platforms upsert on user and IGDB id and fill missing optional columns with null', async () => {
  const { client, calls } = recorder();
  await client.upsertUserPlatform({ userId: 'u1', platform: { igdb_platform_id: 130, name: 'Nintendo Switch', abbreviation: 'Switch' } });
  await client.deleteUserPlatform({ userId: 'u1', igdbPlatformId: 130 });
  assert.deepEqual(calls, [
    { table: 'user_platforms', chain: [['upsert', { user_id: 'u1', igdb_platform_id: 130, name: 'Nintendo Switch', abbreviation: 'Switch', logo_url: null }, { onConflict: 'user_id,igdb_platform_id' }]] },
    { table: 'user_platforms', chain: [['delete'], ['eq', 'user_id', 'u1'], ['eq', 'igdb_platform_id', 130]] },
  ]);
});

test('updateProfileFields sends the patch as given plus updated_at and does not read the row back', async () => {
  const { client, calls } = recorder();
  await client.updateProfileFields({ userId: 'u1', patch: { name: '  Ana  ', avatar_crop: { x: 0.5, y: 0.5, zoom: 1 } } });
  const [update, filter, ...rest] = calls[0].chain;
  assert.equal(calls[0].table, 'profiles');
  assert.equal(update[0], 'update');
  const values = update[1] as Record<string, unknown>;
  assert.equal(values.name, '  Ana  ');
  assert.deepEqual(values.avatar_crop, { x: 0.5, y: 0.5, zoom: 1 });
  assert.equal(typeof values.updated_at, 'string');
  assert.deepEqual(filter, ['eq', 'id', 'u1']);
  assert.deepEqual(rest, []);
});

test('row operations reject with an Error carrying the Supabase message instead of a DataError', async () => {
  const failure = { message: 'new row violates row-level security policy', code: '42501', details: null, hint: null };
  const { client } = recorder({ votes: { error: failure }, backlogs: { error: failure } });
  await assert.rejects(
    client.upsertVote({ userId: 'u1', gameId: 'g1', voteMonth: '2026-12', choice: 'would_play' }),
    (error: unknown) => error instanceof Error && !(error instanceof DataError)
      && error.message === failure.message && (error as { code?: string }).code === '42501',
  );
  await assert.rejects(
    client.deleteBacklog({ userId: 'u1', gameId: 'g1' }),
    (error: unknown) => error instanceof Error && error.message === failure.message,
  );
});

test('readRewardGrants uses the web reward selection ordered by newest grant', async () => {
  const grants = [{ id: 'grant', reward_id: 'reward', granted_at: '2026-11-01', seen_at: null, reward: null }];
  const { client, calls } = recorder({ user_reward_grants: { data: grants } });
  assert.deepEqual(await client.readRewardGrants('u1'), grants);
  assert.deepEqual(calls, [{
    table: 'user_reward_grants',
    chain: [
      ['select', 'id, reward_id, granted_at, seen_at, reward:club_rewards(id, club_month, code, kind, name, description, theme_id, image_url, cycle:club_months(month, game:games(title, image_url)))'],
      ['eq', 'user_id', 'u1'],
      ['order', 'granted_at', { ascending: false }],
    ],
  }]);
});

test('readSessionProfile can ignore read errors while the default still throws', async () => {
  const failure = { message: 'timeout' };
  const failing = recorder({ profiles: { error: failure }, user_roles: { data: { role: 'admin' } } });
  assert.deepEqual(await failing.client.readSessionProfile('u1', false, { ignoreErrors: true }), { profile: null, isAdmin: true });
  assert.deepEqual(failing.calls, [
    { table: 'profiles', chain: [['select', '*'], ['eq', 'id', 'u1'], ['maybeSingle']] },
    { table: 'user_roles', chain: [['select', 'role'], ['eq', 'user_id', 'u1'], ['maybeSingle']] },
  ]);
  await assert.rejects(failing.client.readSessionProfile('u1', false), (error: unknown) => error instanceof DataError);

  const profile = { id: 'u1', name: 'Ana', avatar_url: null };
  const ok = recorder({ profiles: { data: profile }, user_roles: { error: failure } });
  assert.deepEqual(await ok.client.readSessionProfile('u1', false, { ignoreErrors: true }), { profile, isAdmin: false });
});

test('readGameAudience groups votes by choice and treats backlog and favorite errors as absent', async () => {
  const { client, calls } = recorder({
    votes: { data: [
      { user_id: 'u1', choice: 'would_not_play', reason: 'other', reason_text: 'Longo demais' },
      { user_id: 'u2', choice: 'would_play', reason: null, reason_text: null },
      { user_id: 'u3', choice: 'unavailable', reason: null, reason_text: null },
    ] },
    game_progress: { data: [{ user_id: 'u2' }, { user_id: 'u4' }] },
    backlogs: { error: { message: 'falhou' } },
    favorite_games: { data: { id: 'fav' } },
    profiles: { data: [{ id: 'u2', name: 'Bia', avatar_url: null }] },
  });
  const audience = await client.readGameAudience({ userId: 'u1', gameId: 'g1', voteMonth: '2026-12' });

  assert.deepEqual(calls, [
    { table: 'votes', chain: [['select', 'user_id, choice, reason, reason_text'], ['eq', 'game_id', 'g1'], ['eq', 'vote_month', '2026-12']] },
    { table: 'game_progress', chain: [['select', 'user_id'], ['eq', 'game_id', 'g1'], ['eq', 'status', 'finished']] },
    { table: 'backlogs', chain: [['select', 'id'], ['eq', 'game_id', 'g1'], ['eq', 'user_id', 'u1'], ['maybeSingle']] },
    { table: 'favorite_games', chain: [['select', 'id'], ['eq', 'game_id', 'g1'], ['eq', 'user_id', 'u1'], ['maybeSingle']] },
    { table: 'profiles', chain: [['select', 'id, name, avatar_url, avatar_crop'], ['in', 'id', ['u1', 'u2', 'u3', 'u4']]] },
  ]);
  assert.deepEqual(audience.choiceProfiles.would_play, [{ id: 'u2', name: 'Bia', avatar_url: null, reason: null, reasonText: null }]);
  assert.deepEqual(audience.choiceProfiles.would_not_play, [{ id: 'u1', name: 'Membro', avatar_url: null, reason: 'other', reasonText: 'Longo demais' }]);
  assert.deepEqual(audience.voters.map(person => person.id).sort(), ['u1', 'u2']);
  assert.deepEqual(audience.completed, [{ id: 'u2', name: 'Bia', avatar_url: null }, { id: 'u4', name: 'Membro', avatar_url: null }]);
  assert.equal(audience.myChoice, 'would_not_play');
  assert.equal(audience.myReason, 'other');
  assert.equal(audience.myReasonText, 'Longo demais');
  assert.equal(audience.votedByMe, true);
  assert.equal(audience.completedByMe, false);
  assert.equal(audience.inBacklog, false);
  assert.equal(audience.favorite, true);
});

test('readGameAudience skips the profile read without participants and fails on vote errors', async () => {
  const empty = recorder({ votes: { data: [] }, game_progress: { data: [] } });
  const audience = await empty.client.readGameAudience({ userId: 'u1', gameId: 'g1', voteMonth: '2026-12' });
  assert.equal(empty.calls.some(call => call.table === 'profiles'), false);
  assert.equal(audience.votedByMe, false);
  assert.equal(audience.myChoice, null);

  const failing = recorder({ votes: { error: { message: 'sem acesso' } } });
  await assert.rejects(failing.client.readGameAudience({ userId: 'u1', gameId: 'g1', voteMonth: '2026-12' }), /sem acesso/);
});

function comment(id: string, user_id: string, parent_id: string | null, created_at: string) {
  return { id, user_id, game_id: 'g1', club_month: '2026-11', parent_id, body: id, created_at, updated_at: created_at };
}

test('readCommentTimeline keeps two levels, attaches reactions and marks my reactions', async () => {
  const { client, calls } = recorder({
    club_comments: { data: [
      comment('root', 'u2', null, '2026-11-01T10:00:00Z'),
      comment('reply', 'u1', 'root', '2026-11-01T11:00:00Z'),
      comment('reply-of-reply', 'u3', 'reply', '2026-11-01T12:00:00Z'),
    ] },
    comment_reactions: { data: [
      { comment_id: 'root', emoji: '🔥', user_id: 'u1' },
      { comment_id: 'root', emoji: '🔥', user_id: 'u4' },
      { comment_id: 'reply', emoji: '👍', user_id: 'u2' },
    ] },
    profiles: { data: [{ id: 'u1', name: 'Ana', avatar_url: null }, { id: 'u2', name: 'Bia', avatar_url: null }] },
  });
  const timeline = await client.readCommentTimeline({ userId: 'u1', gameId: 'g1', clubMonth: '2026-11' });

  assert.deepEqual(calls, [
    { table: 'club_comments', chain: [['select', '*'], ['eq', 'game_id', 'g1'], ['eq', 'club_month', '2026-11'], ['order', 'created_at']] },
    { table: 'comment_reactions', chain: [['select', 'comment_id, emoji, user_id'], ['eq', 'game_id', 'g1'], ['eq', 'club_month', '2026-11']] },
    { table: 'profiles', chain: [['select', 'id, name, avatar_url, avatar_crop'], ['in', 'id', ['u2', 'u1', 'u3', 'u4']]] },
  ]);
  assert.equal(timeline.length, 1);
  const [root] = timeline;
  assert.equal(root.profile?.name, 'Bia');
  assert.deepEqual(root.replies.map(reply => reply.id), ['reply', 'reply-of-reply']);
  assert.equal(root.replies[1].profile?.name, 'Membro');
  assert.deepEqual(root.reactions.map(reaction => [reaction.emoji, reaction.users.map(person => person.id), reaction.reactedByMe]), [['🔥', ['u1', 'u4'], true]]);
  assert.deepEqual(root.replies[0].reactions.map(reaction => reaction.reactedByMe), [false]);
});

test('readCommentTimeline does not read profiles for an empty conversation', async () => {
  const { client, calls } = recorder({ club_comments: { data: [] }, comment_reactions: { data: [] } });
  assert.deepEqual(await client.readCommentTimeline({ userId: 'u1', gameId: 'g1', clubMonth: '2026-11' }), []);
  assert.deepEqual(calls.map(call => call.table), ['club_comments', 'comment_reactions']);
});

test('insertComment inserts the row and returns only its id', async () => {
  const { client, calls } = recorder({ club_comments: { data: { id: 'c1' } } });
  const id = await client.insertComment({ userId: 'u1', gameId: 'g1', clubMonth: '2026-11', parentId: null, body: 'Oi' });
  assert.equal(id, 'c1');
  assert.deepEqual(calls, [{
    table: 'club_comments',
    chain: [['insert', { user_id: 'u1', game_id: 'g1', club_month: '2026-11', parent_id: null, body: 'Oi' }], ['select', 'id'], ['single']],
  }]);
  assert.equal(await recorder().client.insertComment({ userId: 'u1', gameId: 'g1', clubMonth: '2026-11', parentId: 'c1', body: 'Oi' }), null);
});

test('writeCommentReaction inserts with the cycle scope and deletes by comment, user and emoji', async () => {
  const { client, calls } = recorder();
  const input = { userId: 'u1', commentId: 'c1', emoji: '🔥', gameId: 'g1', clubMonth: '2026-11' };
  await client.writeCommentReaction({ ...input, enabled: true });
  await client.writeCommentReaction({ ...input, enabled: false });
  assert.deepEqual(calls, [
    { table: 'comment_reactions', chain: [['insert', { comment_id: 'c1', user_id: 'u1', emoji: '🔥', game_id: 'g1', club_month: '2026-11' }]] },
    { table: 'comment_reactions', chain: [['delete'], ['eq', 'comment_id', 'c1'], ['eq', 'user_id', 'u1'], ['eq', 'emoji', '🔥']] },
  ]);
});

test('deleteOwnComment deletes by id and author', async () => {
  const { client, calls } = recorder();
  await client.deleteOwnComment({ userId: 'u1', commentId: 'c1' });
  assert.deepEqual(calls, [{ table: 'club_comments', chain: [['delete'], ['eq', 'id', 'c1'], ['eq', 'user_id', 'u1']] }]);
});

test('readMembersWithRoles lists every profile and defaults missing roles to member', async () => {
  const { client, calls, sessionChecks } = recorder({
    profiles: { data: [{ id: 'u1', name: 'Ana', email: 'a@x', avatar_url: null }, { id: 'u2', name: 'Bia', email: 'b@x', avatar_url: null }] },
    user_roles: { data: [{ user_id: 'u1', role: 'admin' }] },
  });
  const users = await client.readMembersWithRoles();
  assert.deepEqual(calls, [
    { table: 'profiles', chain: [['select', 'id, name, email, avatar_url, avatar_crop, bio, created_at'], ['order', 'name']] },
    { table: 'user_roles', chain: [['select', 'user_id, role']] },
  ]);
  assert.deepEqual(users.map(user => [user.id, user.role]), [['u1', 'admin'], ['u2', 'member']]);
  assert.equal(sessionChecks(), 0);
});

test('readNoteSnapshots reads the frozen notes of one cycle and maps them to local notes', async () => {
  const { client, calls } = recorder({
    cycle_note_snapshots: { data: [{ note_id: 'n1', user_id: 'u1', game_id: 'g1', body: 'Chefe difícil', image_data_url: null, created_at: '2026-10-02', updated_at: '2026-10-03' }] },
  });
  const notes = await client.readNoteSnapshots({ userId: 'u1', gameId: 'g1', month: '2026-10' });
  assert.deepEqual(calls, [{
    table: 'cycle_note_snapshots',
    chain: [['select', '*'], ['eq', 'user_id', 'u1'], ['eq', 'cycle_month', '2026-10'], ['eq', 'game_id', 'g1'], ['order', 'created_at']],
  }]);
  assert.deepEqual(notes, [{ id: 'n1', userId: 'u1', gameId: 'g1', body: 'Chefe difícil', imageDataUrl: undefined, createdAt: '2026-10-02', updatedAt: '2026-10-03' }]);
});

test('readCycles and readProgress build the queries the web used to build itself', async () => {
  const { client, calls } = recorder({
    profiles: { data: [{ id: 'u1', name: 'Ana', avatar_url: null }, { id: 'u2', name: 'Bia', avatar_url: null }] },
    game_progress: { data: [{ id: 'p1', user_id: 'u2', game_id: 'g1', status: 'started', rating: 6, rating_mode: 'simple', rating_details: null, started_at: '2026-11-02', finished_at: null }] },
  });
  await client.readCycles(false);
  const progress = await client.readProgress({ userId: 'u1', isDemo: false, gameId: 'g1' });
  await client.readProgress({ userId: 'u1', isDemo: false, gameId: 'g1', month: '2026-10', historical: true });
  assert.deepEqual(calls, [
    { table: 'club_months', chain: [['select', 'month, game_id, status, started_at, closed_at, selected_by, game:games (*)'], ['order', 'month', { ascending: false }]] },
    { table: 'profiles', chain: [['select', 'id, name, avatar_url, avatar_crop'], ['order', 'name']] },
    { table: 'game_progress', chain: [['select', '*'], ['eq', 'game_id', 'g1']] },
    { table: 'cycle_progress_snapshots', chain: [['select', '*, profile:profiles!cycle_progress_snapshots_user_id_fkey (id, name, avatar_url, avatar_crop)'], ['eq', 'cycle_month', '2026-10'], ['eq', 'game_id', 'g1']] },
  ]);
  assert.deepEqual(progress.map(item => [item.id, item.status, item.rating]), [['new-u1', 'not_started', null], ['p1', 'started', 6]]);
});
