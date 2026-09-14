import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cacheIGDBGames } from '../../src/lib/game-cache';
import type { IGDBGameResult } from '../../src/lib/igdb';

type UpsertPayload = Record<string, unknown>;

function igdbGame(overrides: Partial<IGDBGameResult> = {}): IGDBGameResult {
  return {
    id: 1942,
    title: 'Tunic',
    duration_hours: 12,
    average_rating: 84,
    release_year: 2022,
    image_url: null,
    description: 'Uma raposinha explora um mundo cheio de segredos.',
    screenshot_urls: ['https://images.igdb.com/shot-1.jpg'],
    trailer_url: null,
    genres: ['Aventura'],
    platforms: ['PC'],
    platform_ids: [6],
    ...overrides,
  };
}

function fakeSupabase(payloads: UpsertPayload[], failFirstWith?: { code: string }): SupabaseClient {
  let calls = 0;
  const client = {
    from() {
      return {
        upsert(payload: UpsertPayload) {
          payloads.push(payload);
          calls += 1;
          const error = calls === 1 && failFirstWith ? failFirstWith : null;
          return {
            select: () => ({
              single: async () => (error
                ? { data: null, error }
                : { data: { id: 'stored-row', image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/stored.jpg', ...payload }, error: null }),
            }),
          };
        },
      };
    },
  };
  return client as unknown as SupabaseClient;
}

test('a game with no art is upserted without an image_url key at all', async () => {
  const payloads: UpsertPayload[] = [];
  await cacheIGDBGames(fakeSupabase(payloads), [igdbGame({ image_url: null })]);
  assert.equal(payloads.length, 1);
  assert.equal(Object.hasOwn(payloads[0], 'image_url'), false);
  assert.deepEqual(payloads[0], {
    igdb_id: 1942,
    title: 'Tunic',
    duration_hours: 12,
    average_rating: 84,
    release_year: 2022,
    description: 'Uma raposinha explora um mundo cheio de segredos.',
    screenshot_urls: ['https://images.igdb.com/shot-1.jpg'],
    trailer_url: null,
    genres: ['Aventura'],
    platforms: ['PC'],
    platform_ids: [6],
  });
});

test('an empty cover string counts as no art', async () => {
  const payloads: UpsertPayload[] = [];
  await cacheIGDBGames(fakeSupabase(payloads), [igdbGame({ image_url: '' })]);
  assert.equal(Object.hasOwn(payloads[0], 'image_url'), false);
});

test('a game with art is upserted with exactly that url', async () => {
  const payloads: UpsertPayload[] = [];
  await cacheIGDBGames(fakeSupabase(payloads), [
    igdbGame({ image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co65ac.jpg' }),
  ]);
  assert.equal(payloads[0].image_url, 'https://images.igdb.com/igdb/image/upload/t_cover_big/co65ac.jpg');
});

test('the legacy-column retry keeps the same cover decision', async () => {
  const withoutArt: UpsertPayload[] = [];
  await cacheIGDBGames(fakeSupabase(withoutArt, { code: 'PGRST204' }), [igdbGame({ image_url: null })]);
  assert.equal(withoutArt.length, 2);
  assert.deepEqual(Object.keys(withoutArt[1]), ['igdb_id', 'title', 'duration_hours', 'description']);

  const withArt: UpsertPayload[] = [];
  await cacheIGDBGames(fakeSupabase(withArt, { code: 'PGRST204' }), [
    igdbGame({ image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co65ac.jpg' }),
  ]);
  assert.deepEqual(Object.keys(withArt[1]), ['igdb_id', 'title', 'duration_hours', 'image_url', 'description']);
  assert.equal(withArt[1].image_url, 'https://images.igdb.com/igdb/image/upload/t_cover_big/co65ac.jpg');
});

test('a capa já gravada sobrevive e é o que a rota devolve ao cliente', async () => {
  const payloads: UpsertPayload[] = [];
  const saved = await cacheIGDBGames(fakeSupabase(payloads), [igdbGame({ image_url: null })]);
  assert.equal(saved[0].image_url, 'https://images.igdb.com/igdb/image/upload/t_cover_big/stored.jpg');
});

test('capa nova da IGDB substitui a que estava lá', async () => {
  const payloads: UpsertPayload[] = [];
  const saved = await cacheIGDBGames(fakeSupabase(payloads), [igdbGame({ image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/nova.jpg' })]);
  assert.equal(saved[0].image_url, 'https://images.igdb.com/igdb/image/upload/t_cover_big/nova.jpg');
});
