import assert from 'node:assert/strict';
import test from 'node:test';
import type { DataSupabaseClient } from '@clube-do-jogo/data';
import { cacheIGDBGames } from '../../src/lib/game-cache';
import type { IGDBGameResult } from '../../src/lib/igdb';

type UpsertPayload = Record<string, unknown>;
type StoredRow = UpsertPayload & { id: string };
type UpsertCall = { rows: UpsertPayload[]; columns: string[] };

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

const STORED_COVER = 'https://images.igdb.com/igdb/image/upload/t_cover_big/stored.jpg';

type FakeOptions = {
  calls?: UpsertCall[];
  failFirstWith?: { code: string };
  roundTrips?: { count: number };
  existingByTitle?: Map<string, StoredRow>;
};

function fakeSupabase(payloads: UpsertPayload[], options: FakeOptions = {}): DataSupabaseClient {
  const { calls, failFirstWith, roundTrips, existingByTitle = new Map() } = options;
  const stored = (payload: UpsertPayload, columns: string[]) => ({
    id: `stored-${payload.igdb_id}`,
    image_url: STORED_COVER,
    ...Object.fromEntries(columns.map(column => [column, Object.hasOwn(payload, column) ? payload[column] : null])),
  });
  const titleConflict = (payload: UpsertPayload) => {
    const existing = existingByTitle.get(String(payload.title));
    return Boolean(existing && existing.igdb_id !== payload.igdb_id);
  };
  const client = {
    from() {
      return {
        upsert(payload: UpsertPayload | UpsertPayload[]) {
          const batch = Array.isArray(payload) ? payload : [payload];
          const columns = [...new Set(batch.flatMap(one => Object.keys(one)))];
          batch.forEach(one => payloads.push(one));
          calls?.push({ rows: batch, columns });
          if (roundTrips) roundTrips.count += 1;
          const schemaError = failFirstWith && batch.some(one => Object.hasOwn(one, 'average_rating')) ? failFirstWith : null;
          const error = schemaError ?? (batch.some(titleConflict) ? { code: '23505' } : null);
          const rows = batch.map(one => stored(one, columns)).reverse();
          return {
            select: () => Object.assign(
              Promise.resolve(error ? { data: null, error } : { data: rows, error: null }),
              { single: async () => (error ? { data: null, error } : { data: rows[0], error: null }) },
            ),
          };
        },
        select() {
          return {
            eq: (_column: string, title: string) => ({
              maybeSingle: async () => ({ data: existingByTitle.get(title) ?? null, error: null }),
            }),
          };
        },
        update(metadata: UpsertPayload) {
          return {
            eq: (_column: string, id: string) => ({
              select: () => ({
                single: async () => {
                  const existing = [...existingByTitle.values()].find(row => row.id === id);
                  return { data: existing ? { ...existing, ...metadata } : null, error: null };
                },
              }),
            }),
          };
        },
      };
    },
  };
  return client as unknown as DataSupabaseClient;
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
  await cacheIGDBGames(fakeSupabase(withoutArt, { failFirstWith: { code: 'PGRST204' } }), [igdbGame({ image_url: null })]);
  assert.deepEqual(Object.keys(withoutArt.at(-1)!), ['igdb_id', 'title', 'duration_hours', 'description']);

  const withArt: UpsertPayload[] = [];
  await cacheIGDBGames(fakeSupabase(withArt, { failFirstWith: { code: 'PGRST204' } }), [
    igdbGame({ image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co65ac.jpg' }),
  ]);
  assert.deepEqual(Object.keys(withArt.at(-1)!), ['igdb_id', 'title', 'duration_hours', 'image_url', 'description']);
  assert.equal(withArt.at(-1)!.image_url, 'https://images.igdb.com/igdb/image/upload/t_cover_big/co65ac.jpg');
});

test('a capa já gravada sobrevive e é o que a rota devolve ao cliente', async () => {
  const payloads: UpsertPayload[] = [];
  const saved = await cacheIGDBGames(fakeSupabase(payloads), [igdbGame({ image_url: null })]);
  assert.equal(saved[0].image_url, STORED_COVER);
});

test('capa nova da IGDB substitui a que estava lá', async () => {
  const payloads: UpsertPayload[] = [];
  const saved = await cacheIGDBGames(fakeSupabase(payloads), [igdbGame({ image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/nova.jpg' })]);
  assert.equal(saved[0].image_url, 'https://images.igdb.com/igdb/image/upload/t_cover_big/nova.jpg');
});

test('uma página inteira não vira uma ida ao banco por jogo', async () => {
  const roundTrips = { count: 0 };
  const page = Array.from({ length: 24 }, (_, index) => igdbGame({
    id: 1000 + index,
    title: `Jogo ${index}`,
    image_url: index % 2 === 0 ? `https://images.igdb.com/igdb/image/upload/t_cover_big/capa${index}.jpg` : null,
  }));
  const saved = await cacheIGDBGames(fakeSupabase([], { roundTrips }), page);
  assert.equal(saved.length, 24);
  assert.ok(roundTrips.count <= 2, `esperava no máximo 2 idas ao banco, foram ${roundTrips.count}`);
});

test('a ordem que a IGDB devolveu é a ordem que o cliente recebe', async () => {
  const page = Array.from({ length: 6 }, (_, index) => igdbGame({ id: 2000 + index, title: `Jogo ${index}` }));
  const saved = await cacheIGDBGames(fakeSupabase([]), page);
  assert.deepEqual(saved.map(game => game.title), ['Jogo 0', 'Jogo 1', 'Jogo 2', 'Jogo 3', 'Jogo 4', 'Jogo 5']);
});

test('capas intercaladas voltam na ordem da IGDB, não na ordem dos lotes', async () => {
  const cover = 'https://images.igdb.com/igdb/image/upload/t_cover_big/co65ac.jpg';
  const page = Array.from({ length: 4 }, (_, index) => igdbGame({ id: 3000 + index, title: `Jogo ${index}`, image_url: index % 2 ? null : cover }));
  const saved = await cacheIGDBGames(fakeSupabase([]), page);
  assert.deepEqual(saved.map(game => game.title), ['Jogo 0', 'Jogo 1', 'Jogo 2', 'Jogo 3']);
});

test('jogo com capa e jogo sem capa não viajam no mesmo lote', async () => {
  const calls: UpsertCall[] = [];
  const saved = await cacheIGDBGames(fakeSupabase([], { calls }), [
    igdbGame({ id: 1, title: 'Com capa', image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co65ac.jpg' }),
    igdbGame({ id: 2, title: 'Sem capa', image_url: null }),
  ]);
  for (const call of calls) {
    const withCover = call.rows.filter(row => Object.hasOwn(row, 'image_url')).length;
    assert.ok(withCover === 0 || withCover === call.rows.length, `um upsert misturou linhas com e sem image_url: ${JSON.stringify(call.columns)}`);
  }
  assert.equal(saved.find(game => game.title === 'Sem capa')?.image_url, STORED_COVER);
});

test('jogo que cai na linha de mesmo título com outro igdb_id continua no resultado, na ordem', async () => {
  const existing: StoredRow = { id: 'stored-legado', igdb_id: 777, title: 'Celeste', image_url: STORED_COVER };
  const saved = await cacheIGDBGames(fakeSupabase([], { existingByTitle: new Map([['Celeste', existing]]) }), [
    igdbGame({ id: 10, title: 'Antes' }),
    igdbGame({ id: 11, title: 'Celeste' }),
    igdbGame({ id: 12, title: 'Depois' }),
  ]);
  assert.deepEqual(saved.map(game => game.title), ['Antes', 'Celeste', 'Depois']);
  assert.equal(saved[1].id, 'stored-legado');
});
