import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

const seen = { igdbGames: [] as string[], igdbPlatforms: [] as string[], ilike: [] as string[], contexts: 0 };
let userId: string | null = 'member-1';

function gamesTable() {
  const builder = {
    select: () => builder,
    ilike: (_column: string, pattern: string) => { seen.ilike.push(pattern); return builder; },
    limit: async () => ({ data: [], error: null }),
  };
  return builder;
}

mock.module('../../src/lib/supabase/server', {
  exports: {
    createRequestContext: async () => {
      seen.contexts += 1;
      return { supabase: { from: gamesTable }, userId };
    },
  },
});
mock.module('../../src/lib/igdb', {
  exports: {
    searchGamesWithIGDB: async (query: string) => { seen.igdbGames.push(query); return []; },
    searchPlatformsWithIGDB: async (query: string) => { seen.igdbPlatforms.push(query); return []; },
  },
});
mock.module('../../src/lib/game-cache', { exports: { cacheIGDBGames: async () => [] } });

const games = import('../../src/app/api/search/route');
const platforms = import('../../src/app/api/platforms/search/route');

beforeEach(() => {
  seen.igdbGames = [];
  seen.igdbPlatforms = [];
  seen.ilike = [];
  seen.contexts = 0;
  userId = 'member-1';
});

const call = (path: string, q?: string) => {
  const url = new URL(`https://clube.test${path}`);
  if (q !== undefined) url.search = `?q=${q}`;
  return new Request(url);
};

test('/api/search looks up the trimmed, single-spaced query', async () => {
  const { GET } = await games;
  const cases: Array<[string, string]> = [['hades', 'hades'], ['%20hades%20', 'hades'], ['+hades+', 'hades'], ['%20%20Hades+++II%09', 'Hades II']];
  for (const [q, expected] of cases) {
    seen.igdbGames = [];
    seen.ilike = [];
    const response = await GET(call('/api/search', q));
    assert.equal(response.status, 200, q);
    assert.deepEqual(seen.igdbGames, [expected], q);
    assert.deepEqual(seen.ilike, [`%${expected}%`], q);
  }
});

test('/api/search rejects missing and blank queries before touching auth or the catalog', async () => {
  const { GET } = await games;
  for (const q of [undefined, '', '%20%20', '+++', '%09%0A']) {
    const response = await GET(call('/api/search', q));
    assert.equal(response.status, 400, String(q));
    assert.equal((await response.json()).error, 'Parâmetro de busca "q" é obrigatório.');
  }
  assert.equal(seen.contexts, 0);
  assert.deepEqual(seen.igdbGames, []);
});

test('/api/platforms/search looks up the trimmed, single-spaced query', async () => {
  const { GET } = await platforms;
  const cases: Array<[string, string]> = [['switch', 'switch'], ['%20switch%20', 'switch'], ['+++Nintendo++Switch+', 'Nintendo Switch']];
  for (const [q, expected] of cases) {
    seen.igdbPlatforms = [];
    const response = await GET(call('/api/platforms/search', q));
    assert.equal(response.status, 200, q);
    assert.deepEqual(seen.igdbPlatforms, [expected], q);
  }
});

test('/api/platforms/search rejects missing and blank queries', async () => {
  const { GET } = await platforms;
  for (const q of [undefined, '', '%20%20', '+++']) {
    assert.equal((await GET(call('/api/platforms/search', q))).status, 400, String(q));
  }
  assert.equal(seen.contexts, 0);
  assert.deepEqual(seen.igdbPlatforms, []);
});

test('a padded query from a signed-out caller is still refused', async () => {
  const { GET } = await games;
  userId = null;
  assert.equal((await GET(call('/api/search', '%20hades%20'))).status, 401);
  assert.deepEqual(seen.igdbGames, []);
});
