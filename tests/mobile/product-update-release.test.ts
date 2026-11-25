import assert from 'node:assert/strict';
import test from 'node:test';
import type { FetchProductUpdate, ProductUpdate, ProductUpdateDownload } from '@clube-do-jogo/domain';
import {
  createInstalledProductUpdateStore,
  loadInstalledProductUpdate,
  PRODUCT_UPDATE_CACHE_KEY,
} from '../../apps/mobile/src/features/product-updates/release-product-update';
import type { NativeStorage } from '../../apps/mobile/src/platform/storage';

const REPO = 'prisma-web/Clube-do-Jogo';
const source = { repo: REPO, installed: { major: 1, minor: 2, patch: 0 } };
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

/** GitHub release downloads: `body` answers 200, a number answers that status, an Error is a network failure. */
function github(answers: Record<string, unknown>) {
  const requested: string[] = [];
  const fetch: FetchProductUpdate = async url => {
    requested.push(url);
    const answer = answers[url] ?? 404;
    if (answer instanceof Error) throw answer;
    const status = typeof answer === 'number' ? answer : 200;
    return { ok: status === 200, status, json: async () => answer };
  };
  return { fetch, requested };
}

const published = { [assetUrl]: productUpdate() };

test('downloads the notes of the installed version from its release and caches them', async () => {
  const { storage, values } = memoryStorage();
  const { fetch, requested } = github(published);
  assert.deepEqual(await loadInstalledProductUpdate(source, { storage, fetch }), { status: 'found', update: productUpdate() });
  assert.deepEqual(requested, [assetUrl]);
  assert.deepEqual(JSON.parse(values.get(PRODUCT_UPDATE_CACHE_KEY) ?? 'null'), productUpdate());
});

test('reuses the cached notes of the installed version without calling GitHub', async () => {
  const { storage } = memoryStorage({ [PRODUCT_UPDATE_CACHE_KEY]: JSON.stringify(productUpdate()) });
  const { fetch, requested } = github({});
  assert.deepEqual(await loadInstalledProductUpdate(source, { storage, fetch }), { status: 'found', update: productUpdate() });
  assert.deepEqual(requested, []);
});

test('replaces cached notes of an older version with the installed version ones', async () => {
  const { storage, values } = memoryStorage({ [PRODUCT_UPDATE_CACHE_KEY]: JSON.stringify(productUpdate('v1.1.0')) });
  const { fetch } = github(published);
  const result = await loadInstalledProductUpdate(source, { storage, fetch });
  assert.equal(result.status === 'found' && result.update.id, 'v1.2.0');
  assert.equal(JSON.parse(values.get(PRODUCT_UPDATE_CACHE_KEY) ?? 'null').id, 'v1.2.0');
});

test('a failed download never shows the cached notes of another version', async () => {
  const { storage, values } = memoryStorage({ [PRODUCT_UPDATE_CACHE_KEY]: JSON.stringify(productUpdate('v1.1.0')) });
  const { fetch } = github({ [assetUrl]: new Error('offline') });
  assert.deepEqual(await loadInstalledProductUpdate(source, { storage, fetch }), { status: 'failed' });
  assert.equal(JSON.parse(values.get(PRODUCT_UPDATE_CACHE_KEY) ?? 'null').id, 'v1.1.0');
});

test('a release without notes, or with notes of another release, is missing and not cached', async () => {
  for (const answers of [{}, { [assetUrl]: productUpdate('v1.1.0') }, { [assetUrl]: { ...productUpdate(), steps: [] } }]) {
    const { storage, values } = memoryStorage();
    assert.deepEqual(await loadInstalledProductUpdate(source, { storage, fetch: github(answers).fetch }), { status: 'missing' });
    assert.equal(values.has(PRODUCT_UPDATE_CACHE_KEY), false);
  }
});

test('a corrupt or unreadable cache falls back to the download', async () => {
  for (const { storage } of [memoryStorage({ [PRODUCT_UPDATE_CACHE_KEY]: '{not json' }), memoryStorage({}, { failReads: true })]) {
    assert.deepEqual(await loadInstalledProductUpdate(source, { storage, fetch: github(published).fetch }), { status: 'found', update: productUpdate() });
  }
});

test('a cache write failure still shows the downloaded notes', async () => {
  const { storage } = memoryStorage({}, { failWrites: true });
  assert.deepEqual(await loadInstalledProductUpdate(source, { storage, fetch: github(published).fetch }), { status: 'found', update: productUpdate() });
});

/** A store whose loads answer from `results` in order, plus a switch to bring the app back to the foreground. */
function storeWith(...results: (ProductUpdateDownload | Error)[]) {
  let loads = 0;
  let pending: (() => void) | null = null;
  const foreground = new Set<() => void>();
  const store = createInstalledProductUpdateStore(
    () => {
      const result = results[Math.min(loads, results.length - 1)];
      loads += 1;
      return new Promise((resolve, reject) => {
        pending = () => (result instanceof Error ? reject(result) : resolve(result));
      });
    },
    callback => {
      foreground.add(callback);
      return () => foreground.delete(callback);
    },
  );
  return {
    store,
    loads: () => loads,
    listening: () => foreground.size,
    /** Answers the load in flight and lets the store react. */
    settle: async () => {
      pending?.();
      pending = null;
      await new Promise(resolve => setImmediate(resolve));
    },
    returnToForeground: () => foreground.forEach(callback => callback()),
  };
}

const found: ProductUpdateDownload = { status: 'found', update: productUpdate() };
const failed: ProductUpdateDownload = { status: 'failed' };
const missing: ProductUpdateDownload = { status: 'missing' };

test('loads once the first screen subscribes and tells every subscriber', async () => {
  const app = storeWith(found);
  let notified = 0;
  app.store.subscribe(() => notified++);
  app.store.subscribe(() => notified++);
  assert.equal(app.loads(), 1);
  assert.equal(app.store.get(), null);
  await app.settle();
  assert.deepEqual(app.store.get(), productUpdate());
  assert.equal(notified, 2);
});

test('a failed load retries on the next return to the foreground, one load at a time', async () => {
  const app = storeWith(failed, new Error('boom'), found);
  app.store.subscribe(() => {});
  app.returnToForeground();
  assert.equal(app.loads(), 1, 'no second load while the first is in flight');
  await app.settle();
  assert.equal(app.store.get(), null);

  app.returnToForeground();
  assert.equal(app.loads(), 2);
  await app.settle();

  app.returnToForeground();
  assert.equal(app.loads(), 3);
  await app.settle();
  assert.deepEqual(app.store.get(), productUpdate());
});

test('a version without notes is not downloaded again in the same run, nor are found notes', async () => {
  for (const result of [missing, found]) {
    const app = storeWith(result);
    const unsubscribe = app.store.subscribe(() => {});
    await app.settle();
    app.returnToForeground();
    unsubscribe();
    app.store.subscribe(() => {});
    assert.equal(app.loads(), 1);
  }
});

test('stops watching the foreground when the last subscriber leaves', async () => {
  const app = storeWith(failed);
  const first = app.store.subscribe(() => {});
  const second = app.store.subscribe(() => {});
  assert.equal(app.listening(), 1);
  first();
  assert.equal(app.listening(), 1);
  second();
  assert.equal(app.listening(), 0);
});
