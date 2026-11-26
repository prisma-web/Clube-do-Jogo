import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import type { ProductUpdate, ProductUpdateHistory } from '@clube-do-jogo/domain';
import { GET } from '../../src/app/api/product-update/route';

const latest = 'https://github.com/prisma-web/Clube-do-Jogo/releases/latest/download';
const historyUrl = `${latest}/product-updates.json`;
const singleUrl = `${latest}/product-update.json`;

function update(tag: string): ProductUpdate {
  return {
    id: tag,
    version: tag,
    title: `Novidades da ${tag}`,
    steps: [{ eyebrow: 'RANKING', title: 'Empates dividem a posição', body: 'Mesma pontuação, mesma posição.', artwork: 'overview' }],
  };
}

const history: ProductUpdateHistory = { id: 'v1.3.7', releases: [update('v1.3.7'), update('v1.3.6')] };
const CDN_HOUR = 'public, s-maxage=3600, stale-while-revalidate=86400';
const CDN_MINUTE = 'public, s-maxage=60';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const notFound = () => new Response('Not Found', { status: 404 });

function github(answers: Record<string, () => Response | Promise<Response>>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return (answers[String(input)] ?? notFound)();
  }) as typeof fetch;
  return calls;
}

async function answerOf(response: Response) {
  return { status: response.status, cacheControl: response.headers.get('cache-control'), body: await response.json() };
}

test('serves the history of the latest release, downloaded outside the Next data cache and bounded by a timeout', async () => {
  const calls = github({ [historyUrl]: () => Response.json(history) });
  assert.deepEqual(await answerOf(await GET()), { status: 200, cacheControl: CDN_HOUR, body: { history } });
  assert.deepEqual(calls.map(call => call.url), [historyUrl]);
  assert.equal(calls[0].init?.cache, 'no-store');
  assert.equal((calls[0].init as { next?: unknown }).next, undefined);
  assert.ok(calls[0].init?.signal instanceof AbortSignal);
});

test('a latest release published before the history existed is served as a history of its own notes', async () => {
  const calls = github({ [singleUrl]: () => Response.json(update('v1.3.6')) });
  assert.deepEqual(await answerOf(await GET()), { status: 200, cacheControl: CDN_HOUR, body: { history: { id: 'v1.3.6', releases: [update('v1.3.6')] } } });
  assert.deepEqual(calls.map(call => call.url), [historyUrl, singleUrl]);
});

test('a release without notes is cached by the CDN for an hour, like one with notes', async () => {
  for (const answers of [{}, { [historyUrl]: () => Response.json({ id: 'v1.3.7', releases: [] }) }, { [singleUrl]: () => Response.json({ ...update('v1.3.6'), steps: [] }) }]) {
    github(answers);
    assert.deepEqual(await answerOf(await GET()), { status: 200, cacheControl: CDN_HOUR, body: { history: null } });
  }
});

test('a GitHub failure answers no notes and is cached for a minute only', async () => {
  const failures = [
    () => new Response('Bad Gateway', { status: 502 }),
    () => Promise.reject(new TypeError('fetch failed')),
    () => Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError')),
    () => new Response('<html>', { status: 200 }),
  ];
  for (const failure of failures) {
    for (const answers of [{ [historyUrl]: failure }, { [singleUrl]: failure }]) {
      github(answers);
      assert.deepEqual(await answerOf(await GET()), { status: 200, cacheControl: CDN_MINUTE, body: { history: null } });
    }
  }
});
