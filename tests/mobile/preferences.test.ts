import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createPersistentStateStore,
  resolvePersistentStateKey,
} from '../../apps/mobile/src/hooks/use-persistent-state';
import { mobilePreferencesStorageKey, normalizeMobilePreferences } from '../../apps/mobile/src/hooks/mobile-preferences-core';
import type { NativeStorage } from '../../apps/mobile/src/platform/storage';

class Deferred<T> {
  readonly promise: Promise<T>;
  resolve!: (value: T) => void;
  reject!: (reason: unknown) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

class FakeStorage implements NativeStorage {
  readonly values = new Map<string, string>();
  readonly reads = new Map<string, Deferred<string | null>>();
  readonly writes: Array<{ key: string; value: string; deferred: Deferred<void> }> = [];
  failNextWrite = false;

  getItem(key: string) {
    const deferred = new Deferred<string | null>();
    this.reads.set(key, deferred);
    return deferred.promise;
  }

  setItem(key: string, value: string) {
    const deferred = new Deferred<void>();
    this.writes.push({ key, value, deferred });
    if (this.failNextWrite) {
      this.failNextWrite = false;
      deferred.reject(new Error('storage indisponível'));
    }
    return deferred.promise.then(() => {
      this.values.set(key, value);
    });
  }

  removeItem(key: string) {
    this.values.delete(key);
    return Promise.resolve();
  }
}

function flush() {
  return new Promise<void>(resolve => setImmediate(resolve));
}

test('a local write wins over a late storage read', async () => {
  const storage = new FakeStorage();
  const store = createPersistentStateStore('account/member', { value: 'initial' }, { storage });
  store.hydrate();
  store.set({ value: 'typed locally' });
  storage.reads.get('account/member')?.resolve(JSON.stringify({ value: 'old remote' }));
  storage.writes[0]?.deferred.resolve();
  await flush();
  assert.deepEqual(store.get(), { value: 'typed locally' });
});

test('serializes writes and keeps the latest value durable', async () => {
  const storage = new FakeStorage();
  const store = createPersistentStateStore('account/member', 0, { storage });
  store.set(1);
  store.set(2);
  await flush();
  assert.equal(storage.writes.length, 1);
  storage.writes[0]?.deferred.resolve();
  await flush();
  assert.equal(storage.writes.length, 2);
  storage.writes[1]?.deferred.resolve();
  await flush();
  assert.equal(storage.values.get('account/member'), '2');
  assert.equal(store.get(), 2);
  assert.equal(store.getStatus().error, null);
});

test('write failures are observable and retry persists the current value', async () => {
  const storage = new FakeStorage();
  const store = createPersistentStateStore('account/member', 'latest', { storage });
  storage.failNextWrite = true;
  store.set('latest');
  await flush();
  assert.match(store.getStatus().error?.message || '', /indisponível/);
  store.retry();
  await flush();
  assert.equal(storage.writes.length, 2);
  storage.writes[1]?.deferred.resolve();
  await flush();
  assert.equal(storage.values.get('account/member'), JSON.stringify('latest'));
  assert.equal(store.getStatus().error, null);
});

test('preference scopes separate accounts and demo from one another', () => {
  const member = mobilePreferencesStorageKey('member', false, 1);
  const other = mobilePreferencesStorageKey('other', false, 1);
  const demo = mobilePreferencesStorageKey('member', true, 1);
  assert.notEqual(member, other);
  assert.notEqual(member, demo);
  assert.notEqual(mobilePreferencesStorageKey(null, false, 1), mobilePreferencesStorageKey(null, false, 2));
  assert.deepEqual(normalizeMobilePreferences({ themeId: 'locked', reduceMotion: true, ratingScale: 7 }), {
    themeId: 'original', reduceMotion: true, audioEnabled: false, ratingScale: 10,
  });
});

test('usePersistentState resolves a distinct key per account by default, so a caller that never scopes still isolates two identities', () => {
  const keyA = resolvePersistentStateKey('clube-do-jogo:mobile:library-playable', true, 'user-a', false, 1);
  const keyB = resolvePersistentStateKey('clube-do-jogo:mobile:library-playable', true, 'user-b', false, 1);
  assert.equal(keyA, 'clube-do-jogo:mobile:library-playable/account/user-a');
  assert.equal(keyB, 'clube-do-jogo:mobile:library-playable/account/user-b');
  assert.notEqual(keyA, keyB);
});

test('two accounts writing the same unscoped feature key end up with isolated stored values', async () => {
  const storage = new FakeStorage();
  const keyA = resolvePersistentStateKey('clube-do-jogo:mobile:library-playable', true, 'user-a', false, 1);
  const keyB = resolvePersistentStateKey('clube-do-jogo:mobile:library-playable', true, 'user-b', false, 1);

  const storeA = createPersistentStateStore(keyA, false, { storage });
  storeA.set(true);
  await flush();
  storage.writes[0]?.deferred.resolve();
  await flush();

  const storeB = createPersistentStateStore(keyB, false, { storage });
  storeB.set(false);
  await flush();
  storage.writes[1]?.deferred.resolve();
  await flush();

  assert.equal(storage.values.get(keyA), 'true');
  assert.equal(storage.values.get(keyB), 'false');
  assert.equal(storage.values.has('clube-do-jogo:mobile:library-playable'), false);
});

test('logging out resolves a fresh anonymous key, never the previous account key', () => {
  const loggedIn = resolvePersistentStateKey('clube-do-jogo:mobile:library-playable', true, 'user-a', false, 1);
  const loggedOut = resolvePersistentStateKey('clube-do-jogo:mobile:library-playable', true, null, false, 2);
  assert.notEqual(loggedIn, loggedOut);
  assert.equal(loggedOut, 'clube-do-jogo:mobile:library-playable/account/anonymous-2');
});
