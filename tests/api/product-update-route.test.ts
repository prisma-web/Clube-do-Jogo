import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import type { ProductUpdate } from '@clube-do-jogo/domain';
import { GET } from '../../src/app/api/product-update/route';

const latestUrl = 'https://github.com/prisma-web/Clube-do-Jogo/releases/latest/download/product-update.json';
const update: ProductUpdate = {
  id: 'v1.2.0',
  version: 'v1.2.0',
  title: 'Novidades da v1.2.0',
  steps: [{ eyebrow: 'RANKING', title: 'Empates dividem a posição', body: 'Mesma pontuação, mesma posição.', artwork: 'overview' }],
};
const CDN_HOUR = 'public, s-maxage=3600, stale-while-revalidate=86400';
const CDN_MINUTE = 'public, s-maxage=60';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function github(answer: () => Response | Promise<Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return answer();
  }) as typeof fetch;
  return calls;
}

async function answerOf(response: Response) {
  return { status: response.status, cacheControl: response.headers.get('cache-control'), body: await response.json() };
}

test('serves the latest release notes, downloaded outside the Next data cache and bounded by a timeout', async () => {
  const calls = github(() => Response.json(update));
  assert.deepEqual(await answerOf(await GET()), { status: 200, cacheControl: CDN_HOUR, body: { update } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, latestUrl);
  assert.equal(calls[0].init?.cache, 'no-store');
  assert.equal((calls[0].init as { next?: unknown }).next, undefined);
  assert.ok(calls[0].init?.signal instanceof AbortSignal);
});

test('a release without notes is cached by the CDN for an hour, like one with notes', async () => {
  for (const answer of [() => new Response('Not Found', { status: 404 }), () => Response.json({ ...update, steps: [] })]) {
    github(answer);
    assert.deepEqual(await answerOf(await GET()), { status: 200, cacheControl: CDN_HOUR, body: { update: null } });
  }
});

test('a GitHub failure answers no notes and is cached for a minute only', async () => {
  const failures = [
    () => new Response('Bad Gateway', { status: 502 }),
    () => Promise.reject(new TypeError('fetch failed')),
    () => Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError')),
    () => new Response('<html>', { status: 200 }),
  ];
  for (const answer of failures) {
    github(answer);
    assert.deepEqual(await answerOf(await GET()), { status: 200, cacheControl: CDN_MINUTE, body: { update: null } });
  }
});
