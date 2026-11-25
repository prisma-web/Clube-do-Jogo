import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProductUpdate } from '@clube-do-jogo/domain';
import {
  loadInstalledProductUpdate,
  PRODUCT_UPDATE_CACHE_KEY,
} from '../../apps/mobile/src/features/product-updates/release-product-update';
import type { NativeStorage } from '../../apps/mobile/src/platform/storage';

const REPO = 'prisma-web/Clube-do-Jogo';
const source = { repo: REPO, installed: { major: 1, minor: 2, patch: 0 } };
const releaseUrl = `https://api.github.com/repos/${REPO}/releases/tags/v1.2.0`;
const assetUrl = `https://github.com/${REPO}/releases/download/v1.2.0/product-update.json`;

function productUpdate(tag = 'v1.2.0'): ProductUpdate {
  return {
    id: tag,
    version: tag,
    title: `Novidades da ${tag}`,
    steps: [{
      eyebrow: 'RANKING',
      title: 'Empates dividem a posição',
      body: 'Jogos com a mesma pontuação ficam lado a lado.',
      image: { src: `https://raw.githubusercontent.com/${REPO}/${tag}/updates/notes/ranking.webp`, alt: 'Ranking.', width: 860, height: 500 },
    }],
  };
}

function memoryStorage(initial: Record<string, string> = {}, { failReads = false, failWrites = false } = {}) {
  const values = new Map(Object.entries(initial));
  const storage: NativeStorage = {
    getItem: async key => {
      if (failReads) throw new Error('storage offline');
      return values.get(key) ?? null;
    },
    setItem: async (key, value) => {
      if (failWrites) throw new Error('storage full');
      values.set(key, value);
    },
    removeItem: async key => {
      values.delete(key);
    },
  };
  return { storage, values };
}

function github(responses: Record<string, unknown>) {
  const requested: string[] = [];
  const fetchJson = async (url: string) => {
    requested.push(url);
    const response = responses[url];
    if (response === undefined || response instanceof Error) throw response ?? new Error(`404 ${url}`);
    return response;
  };
  return { fetchJson, requested };
}

const published = {
  [releaseUrl]: { tag_name: 'v1.2.0', assets: [{ name: 'product-update.json', browser_download_url: assetUrl }] },
  [assetUrl]: productUpdate(),
};

test('downloads the notes of the installed version and caches them', async () => {
  const { storage, values } = memoryStorage();
  const { fetchJson, requested } = github(published);
  assert.deepEqual(await loadInstalledProductUpdate(source, { storage, fetchJson }), productUpdate());
  assert.deepEqual(requested, [releaseUrl, assetUrl]);
  assert.deepEqual(JSON.parse(values.get(PRODUCT_UPDATE_CACHE_KEY) ?? 'null'), productUpdate());
});

test('reuses the cached notes of the installed version without calling GitHub', async () => {
  const { storage } = memoryStorage({ [PRODUCT_UPDATE_CACHE_KEY]: JSON.stringify(productUpdate()) });
  const { fetchJson, requested } = github({});
  assert.deepEqual(await loadInstalledProductUpdate(source, { storage, fetchJson }), productUpdate());
  assert.deepEqual(requested, []);
});

test('replaces cached notes of an older version with the installed version ones', async () => {
  const { storage, values } = memoryStorage({ [PRODUCT_UPDATE_CACHE_KEY]: JSON.stringify(productUpdate('v1.1.0')) });
  const { fetchJson } = github(published);
  assert.equal((await loadInstalledProductUpdate(source, { storage, fetchJson }))?.id, 'v1.2.0');
  assert.equal(JSON.parse(values.get(PRODUCT_UPDATE_CACHE_KEY) ?? 'null').id, 'v1.2.0');
});

test('shows nothing when GitHub fails, and never the cached notes of another version', async () => {
  const { storage, values } = memoryStorage({ [PRODUCT_UPDATE_CACHE_KEY]: JSON.stringify(productUpdate('v1.1.0')) });
  const { fetchJson } = github({ [releaseUrl]: new Error('offline') });
  assert.equal(await loadInstalledProductUpdate(source, { storage, fetchJson }), null);
  assert.equal(JSON.parse(values.get(PRODUCT_UPDATE_CACHE_KEY) ?? 'null').id, 'v1.1.0');
});

test('shows nothing for a release without notes and does not cache it', async () => {
  const { storage, values } = memoryStorage();
  const { fetchJson } = github({ [releaseUrl]: { tag_name: 'v1.2.0', assets: [] } });
  assert.equal(await loadInstalledProductUpdate(source, { storage, fetchJson }), null);
  assert.equal(values.has(PRODUCT_UPDATE_CACHE_KEY), false);
});

test('shows nothing for an invalid payload', async () => {
  const { storage } = memoryStorage();
  const { fetchJson } = github({ ...published, [assetUrl]: { ...productUpdate(), steps: [] } });
  assert.equal(await loadInstalledProductUpdate(source, { storage, fetchJson }), null);
});

test('a corrupt or unreadable cache falls back to GitHub', async () => {
  for (const { storage } of [memoryStorage({ [PRODUCT_UPDATE_CACHE_KEY]: '{not json' }), memoryStorage({}, { failReads: true })]) {
    const { fetchJson } = github(published);
    assert.deepEqual(await loadInstalledProductUpdate(source, { storage, fetchJson }), productUpdate());
  }
});

test('a cache write failure still shows the downloaded notes', async () => {
  const { storage } = memoryStorage({}, { failWrites: true });
  const { fetchJson } = github(published);
  assert.deepEqual(await loadInstalledProductUpdate(source, { storage, fetchJson }), productUpdate());
});
