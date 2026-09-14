import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { demoGames } from '@clube-do-jogo/domain/demo';
import type { RatingDetails } from '@clube-do-jogo/domain';
import { DataError, createDataClient } from './index';

const userId = 'demo-user';
const gameId = demoGames[0].id;

test('demo ratings accept 0 and 10, preserve progress, and store detailed criteria', async () => {
  const client = createDataClient();
  const before = (await client.readProgress({ userId, isDemo: true, gameId }))
    .find(item => item.user_id === userId);
  assert.ok(before);

  await client.setRating({ userId, isDemo: true, gameId, rating: 0, ratingMode: 'simple' });
  const zero = (await client.readProgress({ userId, isDemo: true, gameId }))
    .find(item => item.user_id === userId);
  assert.equal(zero?.rating, 0);
  assert.equal(zero?.rating_mode, 'simple');
  assert.equal(zero?.rating_details, null);
  assert.equal(zero?.status, before.status);
  assert.equal(zero?.started_at, before.started_at);
  assert.equal(zero?.finished_at, before.finished_at);

  const details = { graphics: 0, gameplay: 10, story: 8, music: null, fun: 5 } as const;
  await client.setRating({ userId, isDemo: true, gameId, rating: 10, ratingMode: 'detailed', ratingDetails: details });
  const ten = (await client.readProgress({ userId, isDemo: true, gameId }))
    .find(item => item.user_id === userId);
  assert.equal(ten?.rating, 10);
  assert.equal(ten?.rating_mode, 'detailed');
  assert.deepEqual(ten?.rating_details, details);
  assert.equal(ten?.status, before.status);
  assert.equal(ten?.started_at, before.started_at);
  assert.equal(ten?.finished_at, before.finished_at);
});

test('ratings reject values outside 0..10 and unknown criteria', async () => {
  const client = createDataClient();
  for (const rating of [-1, 11, Number.NaN, Number.POSITIVE_INFINITY]) {
    await assert.rejects(
      client.setRating({ userId, isDemo: true, gameId, rating, ratingMode: 'simple' }),
      (error: unknown) => error instanceof DataError && /0 e 10/i.test(error.message),
    );
  }
  await assert.rejects(
    client.setRating({ userId, isDemo: true, gameId, rating: 5, ratingMode: 'detailed', ratingDetails: { camera: 5 } as unknown as RatingDetails }),
    (error: unknown) => error instanceof DataError && /critério/i.test(error.message),
  );
  await assert.rejects(
    client.setRating({ userId, isDemo: true, gameId, rating: 5, ratingMode: 'detailed', ratingDetails: { story: 11 } }),
    (error: unknown) => error instanceof DataError && /0 e 10/i.test(error.message),
  );
});

test('historical ratings are read only before touching demo state', async () => {
  const client = createDataClient();
  const before = (await client.readProgress({ userId, isDemo: true, gameId }))
    .find(item => item.user_id === userId);
  await assert.rejects(
    client.setRating({ userId, isDemo: true, gameId, historical: true, rating: 10, ratingMode: 'simple' }),
    (error: unknown) => error instanceof DataError && /somente leitura/i.test(error.message),
  );
  const after = (await client.readProgress({ userId, isDemo: true, gameId }))
    .find(item => item.user_id === userId);
  assert.deepEqual(after, before);
});

test('real rating validates the owner and preserves status and dates', async () => {
  const existing = { status: 'started', started_at: '2026-09-01T00:00:00.000Z', finished_at: null };
  let payload: unknown;
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    from(table: string) {
      assert.equal(table, 'game_progress');
      const query = {
        select() { return query; },
        eq() { return query; },
        maybeSingle() { return Promise.resolve({ data: existing, error: null }); },
        upsert(next: unknown) {
          payload = next;
          return Promise.resolve({ data: null, error: null });
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  await createDataClient({ supabase }).setRating({
    userId,
    isDemo: false,
    gameId,
    rating: 7.5,
    ratingMode: 'detailed',
    ratingDetails: { gameplay: 8 },
  });
  assert.deepEqual(payload, {
    user_id: userId,
    game_id: gameId,
    status: 'started',
    rating: 7.5,
    rating_mode: 'detailed',
    rating_details: { gameplay: 8 },
    started_at: existing.started_at,
    finished_at: null,
    updated_at: (payload as { updated_at?: unknown }).updated_at,
  });

  const wrongOwner = {
    auth: { getUser: async () => ({ data: { user: { id: 'other-user' } }, error: null }) },
    from() { throw new Error('from should not be called when owner validation fails'); },
  } as unknown as SupabaseClient;
  await assert.rejects(
    createDataClient({ supabase: wrongOwner }).setRating({ userId, isDemo: false, gameId, rating: 5, ratingMode: 'simple' }),
    /autorizada/i,
  );
});
