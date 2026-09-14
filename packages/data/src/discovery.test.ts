import assert from 'node:assert/strict';
import test from 'node:test';
import { demoGames } from '@clube-do-jogo/domain/demo';
import { DataError, createDataClient } from './index';

const userId = 'demo-user';

test('demo discovery pages apply filters, preserve metadata, and stop at the final page', async () => {
  const client = createDataClient();
  const first = await client.readDiscoveryPage({
    userId,
    isDemo: true,
    source: 'friends',
    filters: { search: 'adventure' },
    offset: 0,
    limit: 1,
  });
  assert.equal(first.items.length, 1);
  assert.equal(first.items[0]?.game.id, 'outer-wilds');
  assert.equal(first.items[0]?.activityCount, 1);
  assert.deepEqual(first.items[0]?.people, ['Marina Costa']);
  assert.equal(first.hasMore, false);

  const pageOne = await client.readDiscoveryPage({ userId, isDemo: true, source: 'popular', limit: 5 });
  const pageTwo = await client.readDiscoveryPage({ userId, isDemo: true, source: 'popular', offset: 5, limit: 5 });
  const finalPage = await client.readDiscoveryPage({ userId, isDemo: true, source: 'popular', offset: 10, limit: 5 });
  const ids = [...pageOne.items, ...pageTwo.items, ...finalPage.items].map(item => item.game.id);
  assert.equal(pageOne.items.length, 5);
  assert.equal(pageOne.hasMore, true);
  assert.equal(pageTwo.items.length, 5);
  assert.equal(pageTwo.hasMore, true);
  assert.equal(finalPage.items.length, demoGames.length - 10);
  assert.equal(finalPage.hasMore, false);
  assert.equal(new Set(ids).size, ids.length);

  const noMatches = await client.readDiscoveryPage({
    userId,
    isDemo: true,
    source: 'popular',
    filters: { search: 'jogo-que-nao-existe' },
    limit: 24,
  });
  assert.deepEqual(noMatches, { items: [], hasMore: false });
});

test('real discovery sends GET filters and returns the API page shape', async () => {
  const calls: Array<{ path: string; method?: string }> = [];
  const api = {
    request: async (path: string, init?: RequestInit) => {
      calls.push({ path, method: init?.method });
      return {
        ok: true,
        json: async () => ({ items: [{ game: demoGames[0] }], hasMore: false }),
      } as Response;
    },
  };
  const client = createDataClient({ api });
  const page = await client.readDiscoveryPage({
    userId,
    isDemo: false,
    source: 'rated',
    filters: { search: ' Hades ', genre: 12, platform: 130, year: 2020, month: '2026-10' },
    offset: 24,
    limit: 24,
  });

  assert.deepEqual(page, { items: [{ game: demoGames[0] }], hasMore: false });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.method, 'GET');
  const url = new URL(`https://example.test${calls[0]?.path || ''}`);
  assert.equal(url.pathname, '/api/discover');
  assert.equal(url.searchParams.get('source'), 'rated');
  assert.equal(url.searchParams.get('q'), 'Hades');
  assert.equal(url.searchParams.get('genre'), '12');
  assert.equal(url.searchParams.get('platform'), '130');
  assert.equal(url.searchParams.get('year'), '2020');
  assert.equal(url.searchParams.get('month'), '2026-10');
  assert.equal(url.searchParams.get('offset'), '24');
  assert.equal(url.searchParams.get('limit'), '24');
});

test('real discovery turns HTTP failures into a data error', async () => {
  const client = createDataClient({
    api: {
      request: async () => ({
        ok: false,
        json: async () => ({ error: 'Catálogo indisponível' }),
      } as Response),
    },
  });
  await assert.rejects(
    client.readDiscoveryPage({ userId, isDemo: false, source: 'popular' }),
    (error: unknown) => error instanceof DataError && /carregar a descoberta/i.test(error.message),
  );
});

test('array discovery responses remain compatible with the original client method', async () => {
  const client = createDataClient({
    api: {
      request: async () => ({
        ok: true,
        json: async () => [{ game: demoGames[1] }],
      } as Response),
    },
  });
  const items = await client.readDiscovery({ userId, isDemo: false, source: 'popular' });
  assert.deepEqual(items, [{ game: demoGames[1] }]);
});
