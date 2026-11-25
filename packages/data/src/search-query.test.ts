import assert from 'node:assert/strict';
import test from 'node:test';
import { apiRoutes, createDataClient, normalizeSearchQuery } from './index';

const userId = 'user-1';

test('normalizeSearchQuery trims the ends and collapses inner whitespace', () => {
  assert.equal(normalizeSearchQuery(' hades '), 'hades');
  assert.equal(normalizeSearchQuery('  Hades \t  II\n'), 'Hades II');
  assert.equal(normalizeSearchQuery('Hades II'), 'Hades II');
  assert.equal(normalizeSearchQuery(' Hades  II '), 'Hades II');
});

test('normalizeSearchQuery turns blank and missing values into an empty query', () => {
  for (const value of ['', '   ', '\t\n', null, undefined, 42]) assert.equal(normalizeSearchQuery(value), '');
});

test('normalizeSearchQuery is idempotent', () => {
  const once = normalizeSearchQuery('  a   b  ');
  assert.equal(normalizeSearchQuery(once), once);
});

test('search route paths carry the normalized query and encode spaces the same way', () => {
  assert.equal(apiRoutes.searchGames.path({ q: '  Hades   II ' }), '/api/search?q=Hades+II');
  assert.equal(apiRoutes.searchPlatforms.path({ q: ' play   station ' }), '/api/platforms/search?q=play+station');
  assert.equal(apiRoutes.searchGames.path({ q: ' hades ' }), apiRoutes.searchGames.path({ q: 'hades' }));
});

const typed = ['hades', ' hades ', '  Hades   II ', 'The\tLast  of Us', 'ação & aventura', '   ', ''];

function recordingClient() {
  const requests: string[] = [];
  const client = createDataClient({
    api: { async request(path: string) { requests.push(path); return new Response('[]', { status: 200 }); } },
  });
  return { client, requests };
}

test('the app client asks /api/search for exactly the path the web builds from the same text', async () => {
  for (const text of typed) {
    const { client, requests } = recordingClient();
    await client.searchGames({ userId, isDemo: false, query: text });
    if (!normalizeSearchQuery(text)) {
      assert.deepEqual(requests, [], JSON.stringify(text));
      continue;
    }
    assert.deepEqual(requests, [apiRoutes.searchGames.path({ q: text })], JSON.stringify(text));
  }
});

test('the app client asks /api/platforms/search for exactly the path the web builds from the same text', async () => {
  for (const text of typed) {
    const { client, requests } = recordingClient();
    const search = client.searchPlatforms({ userId, isDemo: false, query: text });
    if (!normalizeSearchQuery(text)) {
      await assert.rejects(search);
      assert.deepEqual(requests, [], JSON.stringify(text));
      continue;
    }
    await search;
    assert.deepEqual(requests, [apiRoutes.searchPlatforms.path({ q: text })], JSON.stringify(text));
  }
});
