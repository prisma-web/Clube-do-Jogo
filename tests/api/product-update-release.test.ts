import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ProductUpdate } from '@clube-do-jogo/domain';
import { loadLatestProductUpdate } from '../../src/lib/product-update-release';

const REPO = 'prisma-web/Clube-do-Jogo';
const releaseUrl = `https://api.github.com/repos/${REPO}/releases/latest`;
const assetUrl = `https://github.com/${REPO}/releases/download/v1.2.0/product-update.json`;
const update: ProductUpdate = {
  id: 'v1.2.0',
  version: 'v1.2.0',
  title: 'Novidades da v1.2.0',
  steps: [{ eyebrow: 'RANKING', title: 'Empates dividem a posição', body: 'Mesma pontuação, mesma posição.', artwork: 'overview' }],
};

function fakeFetch(responses: Record<string, Response | Error>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const response = responses[url];
    if (!response) return new Response('Not Found', { status: 404 });
    if (response instanceof Error) throw response;
    return response;
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const release = () => Response.json({ tag_name: 'v1.2.0', assets: [{ name: 'product-update.json', browser_download_url: assetUrl }] });

test('loads the latest release notes, cached by Next for an hour', async () => {
  const { fetchImpl, calls } = fakeFetch({ [releaseUrl]: release(), [assetUrl]: Response.json(update) });
  assert.deepEqual(await loadLatestProductUpdate(fetchImpl), update);
  assert.deepEqual(calls.map(call => call.url), [releaseUrl, assetUrl]);
  for (const call of calls) assert.deepEqual((call.init as { next?: unknown } | undefined)?.next, { revalidate: 3600 });
});

test('shows no dialog when GitHub rate-limits, is unreachable or the release has no notes', async () => {
  const failures = [
    { [releaseUrl]: new Response('{"message":"API rate limit exceeded"}', { status: 403 }) },
    { [releaseUrl]: new TypeError('fetch failed') },
    { [releaseUrl]: Response.json({ tag_name: 'v1.2.0', assets: [] }) },
    { [releaseUrl]: release(), [assetUrl]: new Response('Bad Gateway', { status: 502 }) },
    { [releaseUrl]: release(), [assetUrl]: new Response('<html>', { status: 200 }) },
  ];
  for (const responses of failures) {
    assert.equal(await loadLatestProductUpdate(fakeFetch(responses).fetchImpl), null);
  }
});
