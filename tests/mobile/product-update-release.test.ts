import assert from 'node:assert/strict';
import test from 'node:test';
import type { Download, FetchProductUpdate, ProductUpdate, ProductUpdateHistory } from '@clube-do-jogo/domain';
import {
  createInstalledProductUpdateStore,
  loadInstalledProductUpdates,
  markProductUpdateSeen,
  PRODUCT_UPDATE_CACHE_KEY,
  PRODUCT_UPDATE_FROM_KEY,
  PRODUCT_UPDATE_HISTORY_CACHE_KEY,
  PRODUCT_UPDATE_LAST_SEEN_KEY,
  readProductUpdateDigest,
  resolveProductUpdateSource,
} from '../../apps/mobile/src/features/product-updates/release-product-update';
import type { NativeStorage } from '../../apps/mobile/src/platform/storage';

const REPO = 'prisma-web/Clube-do-Jogo';
const RELEASES = `https://github.com/${REPO}/releases`;
const source = { releases: RELEASES, installed: 'v1.3.6' };
const historyUrl = `${RELEASES}/download/v1.3.6/product-updates.json`;

function productUpdate(tag: string, notes = 1): ProductUpdate {
  return {
    id: tag,
    version: tag,
    title: `Novidades da ${tag}`,
    steps: Array.from({ length: notes }, (_, index) => ({
      eyebrow: 'RANKING',
      title: `${tag} nota ${index + 1}`,
      body: 'Jogos com a mesma pontuação ficam lado a lado.',
      image: { src: `https://raw.githubusercontent.com/${REPO}/${tag}/updates/notes/ranking.webp`, alt: 'Ranking.', width: 860, height: 500 },
    })),
  };
}

function history(tag = 'v1.3.6'): ProductUpdateHistory {
  const tags = ['v1.3.6', 'v1.3.5', 'v1.3.4', 'v1.3.3', 'v1.3.2', 'v1.3.1', 'v1.3.0', 'v1.2.0'];
  const notes: Record<string, number> = { 'v1.3.1': 2, 'v1.3.0': 4, 'v1.2.0': 5 };
  return { id: tag, releases: tags.filter(item => item <= tag).map(item => productUpdate(item, notes[item] ?? 1)) };
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

const published = { [historyUrl]: history() };
const seenKey = (key: string) => `${key}/account/membro`;
const seen = (tag: string) => seenKey(`clube-do-jogo:product-update:${tag}:completed`);
const legacyCache = (tag: string) => ({ [PRODUCT_UPDATE_CACHE_KEY]: JSON.stringify(productUpdate(tag)) });

async function load(initial: Record<string, string> = {}, answers: Record<string, unknown> = published) {
  const { storage, values } = memoryStorage(initial);
  const { fetch, requested } = github(answers);
  const result = await loadInstalledProductUpdates(source, { storage, fetch });
  return { result, values, requested, storage };
}

test('the production build reads the notes from the GitHub releases of its own repo and version', () => {
  const updateSource = { repo: REPO, installed: { major: 1, minor: 3, patch: 6 } };
  assert.deepEqual(resolveProductUpdateSource({ updateSource, extra: { productUpdates: { releases: 'http://127.0.0.1:1/releases' } }, installedVersion: '9.9.9' }), source);
});

test('a development build reads the notes from the releases URL of its build, for local tests', () => {
  const extra = { productUpdates: { releases: 'http://127.0.0.1:8787/releases/' } };
  assert.deepEqual(resolveProductUpdateSource({ updateSource: null, extra, installedVersion: '1.3.6' }), { releases: 'http://127.0.0.1:8787/releases', installed: 'v1.3.6' });
  assert.equal(resolveProductUpdateSource({ updateSource: null, extra: {}, installedVersion: '1.3.6' }), null);
  assert.equal(resolveProductUpdateSource({ updateSource: null, extra: { productUpdates: { releases: 'file:///x' } }, installedVersion: '1.3.6' }), null);
  assert.equal(resolveProductUpdateSource({ updateSource: null, extra, installedVersion: null }), null);
});

test('downloads the history of the installed version from its release and caches it', async () => {
  const { result, values, requested } = await load();
  assert.deepEqual(result, { status: 'found', update: { history: history(), installedBefore: null } });
  assert.deepEqual(requested, [historyUrl]);
  assert.deepEqual(JSON.parse(values.get(PRODUCT_UPDATE_HISTORY_CACHE_KEY) ?? 'null'), history());
});

test('reuses the cached history of the installed version without calling GitHub', async () => {
  const { result, requested } = await load({ [PRODUCT_UPDATE_HISTORY_CACHE_KEY]: JSON.stringify(history()) }, {});
  assert.deepEqual(result, { status: 'found', update: { history: history(), installedBefore: null } });
  assert.deepEqual(requested, []);
});

test('replaces the cached history of an older version', async () => {
  const { result, values } = await load({ [PRODUCT_UPDATE_HISTORY_CACHE_KEY]: JSON.stringify(history('v1.3.0')) });
  assert.equal(result.status === 'found' && result.update.history.id, 'v1.3.6');
  assert.equal(JSON.parse(values.get(PRODUCT_UPDATE_HISTORY_CACHE_KEY) ?? 'null').id, 'v1.3.6');
});

test('the notes an older version cached tell which version the member came from', async () => {
  const { result, values } = await load(legacyCache('v1.2.0'));
  assert.equal(result.status === 'found' && result.update.installedBefore, 'v1.2.0');
  assert.ok(values.has(PRODUCT_UPDATE_CACHE_KEY), 'the old cache stays until the member closes the notes');
});

test('a member who upgrades between two new versions without closing the notes keeps the version they came from', async () => {
  const { result, values } = await load({ [PRODUCT_UPDATE_HISTORY_CACHE_KEY]: JSON.stringify(history('v1.3.3')) });
  assert.equal(result.status === 'found' && result.update.installedBefore, 'v1.3.3');
  assert.equal(values.get(PRODUCT_UPDATE_FROM_KEY), 'v1.3.3');
  const again = await loadInstalledProductUpdates(source, { storage: memoryStorage(Object.fromEntries(values)).storage, fetch: github({}).fetch });
  assert.equal(again.status === 'found' && again.update.installedBefore, 'v1.3.3', 'the cache now holds v1.3.6, but where the member came from survives a restart');
});

test('the oldest version the member never closed wins over a newer cached one', async () => {
  const { result } = await load({ ...legacyCache('v1.2.0'), [PRODUCT_UPDATE_HISTORY_CACHE_KEY]: JSON.stringify(history('v1.3.3')) });
  assert.equal(result.status === 'found' && result.update.installedBefore, 'v1.2.0');
});

test('a failed download is a failure, and a release without history is missing and not cached', async () => {
  assert.deepEqual((await load({}, { [historyUrl]: new Error('offline') })).result, { status: 'failed' });
  for (const answers of [{}, { [historyUrl]: history('v1.3.5') }, { [historyUrl]: productUpdate('v1.3.6') }]) {
    const { result, values } = await load({}, answers);
    assert.deepEqual(result, { status: 'missing' });
    assert.equal(values.has(PRODUCT_UPDATE_HISTORY_CACHE_KEY), false);
  }
});

test('a corrupt or unreadable cache falls back to the download, and a cache write failure still shows the notes', async () => {
  const stores = [
    memoryStorage({ [PRODUCT_UPDATE_HISTORY_CACHE_KEY]: '{not json', [PRODUCT_UPDATE_CACHE_KEY]: '{not json' }),
    memoryStorage({}, { failReads: true }),
    memoryStorage({}, { failWrites: true }),
  ];
  for (const { storage } of stores) {
    assert.deepEqual(await loadInstalledProductUpdates(source, { storage, fetch: github(published).fetch }), { status: 'found', update: { history: history(), installedBefore: null } });
  }
});

test('every release of the history comes with its Android copy, downloaded or cached', async () => {
  const android = { body: 'No Android, os empates aparecem no ranking.', highlights: ['Toque para ver a posição'] };
  const withAndroid = history();
  withAndroid.releases[3] = { ...withAndroid.releases[3], steps: [{ ...withAndroid.releases[3].steps[0], android }] };
  const downloaded = await load({}, { [historyUrl]: withAndroid });
  const cached = await load({ [PRODUCT_UPDATE_HISTORY_CACHE_KEY]: downloaded.values.get(PRODUCT_UPDATE_HISTORY_CACHE_KEY) ?? '' }, {});
  for (const { result } of [downloaded, cached]) {
    const step = result.status === 'found' ? result.update.history.releases[3].steps[0] : null;
    assert.equal(step?.body, android.body);
    assert.deepEqual(step?.highlights, android.highlights);
    assert.equal(step && 'android' in step, false);
  }
});

const pageIds = (pages: ProductUpdate[][]) => pages.map(page => page.map(release => release.id));

async function digestFor(initial: Record<string, string>) {
  const { result, storage, values } = await load(initial);
  assert.equal(result.status, 'found');
  const digest = await readProductUpdateDigest(result.status === 'found' ? result.update : { history: history(), installedBefore: null }, storage, seenKey);
  return { digest, storage, values };
}

test('a member who closed the v1.2.0 notes sees every version since, in pages of whole versions', async () => {
  const { digest } = await digestFor({ [seen('v1.2.0')]: 'true', ...legacyCache('v1.2.0') });
  assert.equal(digest.pending, true);
  assert.deepEqual(pageIds(digest.pages), [['v1.3.6', 'v1.3.5', 'v1.3.4', 'v1.3.3', 'v1.3.2', 'v1.3.1'], ['v1.3.0']]);
});

test('a member who had v1.3.3 installed but never closed its notes sees v1.3.3 and later', async () => {
  const { digest } = await digestFor(legacyCache('v1.3.3'));
  assert.deepEqual(pageIds(digest.pages), [['v1.3.6', 'v1.3.5', 'v1.3.4', 'v1.3.3']]);
});

test('a fresh install sees only the installed version', async () => {
  const { digest } = await digestFor({});
  assert.deepEqual({ pending: digest.pending, pages: pageIds(digest.pages) }, { pending: true, pages: [['v1.3.6']] });
});

test('the last version the member closed counts even after it left the history', async () => {
  const { digest } = await digestFor({ [seenKey(PRODUCT_UPDATE_LAST_SEEN_KEY)]: 'v1.1.0' });
  assert.deepEqual(pageIds(digest.pages), [['v1.3.6', 'v1.3.5', 'v1.3.4', 'v1.3.3', 'v1.3.2', 'v1.3.1'], ['v1.3.0', 'v1.2.0']]);
});

test('seen flags belong to the signed-in member', async () => {
  const { digest } = await digestFor({ [`clube-do-jogo:product-update:v1.3.6:completed/account/outro`]: 'true' });
  assert.equal(digest.pending, true);
});

test('closing the notes marks the installed version as seen for the member and forgets the old cache, so nothing is pending next time', async () => {
  const { digest, storage, values } = await digestFor({ [seen('v1.2.0')]: 'true', ...legacyCache('v1.2.0') });
  await markProductUpdateSeen(digest, storage, seenKey);
  assert.equal(values.get(seen('v1.3.6')), 'true');
  assert.equal(values.get(seenKey(PRODUCT_UPDATE_LAST_SEEN_KEY)), 'v1.3.6');
  assert.equal(values.has(PRODUCT_UPDATE_CACHE_KEY), false);
  assert.equal(values.has(PRODUCT_UPDATE_FROM_KEY), false);
  const next = await readProductUpdateDigest({ history: history(), installedBefore: null }, storage, seenKey);
  assert.equal(next.pending, false);
  assert.deepEqual(pageIds(next.pages)[0], ['v1.3.6']);
});

function storeWith(...results: (Download<ProductUpdate> | Error)[]) {
  let loads = 0;
  let pending: (() => void) | null = null;
  const listeners = new Set<(state: string) => void>();
  const appState = {
    addEventListener(_type: 'change', listener: (state: string) => void) {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
  };
  const store = createInstalledProductUpdateStore(() => {
    const result = results[Math.min(loads, results.length - 1)];
    loads += 1;
    return new Promise((resolve, reject) => {
      pending = () => (result instanceof Error ? reject(result) : resolve(result));
    });
  }, appState);
  const moveTo = (state: string) => listeners.forEach(listener => listener(state));
  return {
    store,
    loads: () => loads,
    listening: () => listeners.size,
    settle: async () => {
      pending?.();
      pending = null;
      await new Promise(resolve => setImmediate(resolve));
    },
    moveTo,
    returnToForeground: () => {
      moveTo('background');
      moveTo('active');
    },
  };
}

const found: Download<ProductUpdate> = { status: 'found', update: productUpdate('v1.3.6') };
const failed: Download<ProductUpdate> = { status: 'failed' };
const missing: Download<ProductUpdate> = { status: 'missing' };

test('loads once the first screen subscribes and tells every subscriber', async () => {
  const app = storeWith(found);
  let notified = 0;
  app.store.subscribe(() => notified++);
  app.store.subscribe(() => notified++);
  assert.equal(app.loads(), 1);
  assert.equal(app.store.get(), null);
  await app.settle();
  assert.deepEqual(app.store.get(), productUpdate('v1.3.6'));
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
  assert.deepEqual(app.store.get(), productUpdate('v1.3.6'));
});

test('a failed load waits for the app to become active again, not just for any app state change', async () => {
  const app = storeWith(failed, found);
  app.store.subscribe(() => {});
  await app.settle();
  for (const state of ['inactive', 'background', 'unknown']) app.moveTo(state);
  assert.equal(app.loads(), 1);
  app.moveTo('active');
  assert.equal(app.loads(), 2);
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
