import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ProductUpdate } from '@clube-do-jogo/domain';
import { loadLatestProductUpdate } from '../../src/lib/product-update-release';

const latestUrl = 'https://github.com/prisma-web/Clube-do-Jogo/releases/latest/download/product-update.json';
const update: ProductUpdate = {
  id: 'v1.2.0',
  version: 'v1.2.0',
  title: 'Novidades da v1.2.0',
  steps: [{ eyebrow: 'RANKING', title: 'Empates dividem a posição', body: 'Mesma pontuação, mesma posição.', artwork: 'overview' }],
};

function fakeFetch(answer: () => Response | Promise<Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return answer();
  }) as typeof fetch;
  return { fetchImpl, calls };
}

test('downloads the latest release notes, cached by Next for an hour and bounded by a timeout', async () => {
  const { fetchImpl, calls } = fakeFetch(() => Response.json(update));
  assert.deepEqual(await loadLatestProductUpdate(fetchImpl), update);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, latestUrl);
  assert.deepEqual((calls[0].init as { next?: unknown }).next, { revalidate: 3600 });
  assert.ok(calls[0].init?.signal instanceof AbortSignal);
});

test('shows no dialog when the latest release has no notes, GitHub fails or answers garbage', async () => {
  const failures = [
    () => new Response('Not Found', { status: 404 }),
    () => new Response('Bad Gateway', { status: 502 }),
    () => Promise.reject(new TypeError('fetch failed')),
    () => new Response('<html>', { status: 200 }),
    () => Response.json({ ...update, steps: [] }),
  ];
  for (const answer of failures) {
    assert.equal(await loadLatestProductUpdate(fakeFetch(answer).fetchImpl), null);
  }
});
