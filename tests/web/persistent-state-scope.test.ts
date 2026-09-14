import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ANONYMOUS_SCOPE,
  buildStorageKey,
  readStoredValue,
  scopeFromUserId,
  writeStoredValue,
  type ViewStorage,
} from '../../src/hooks/use-persistent-state';

class FakeViewStorage implements ViewStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.has(key) ? this.values.get(key)! : null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

test('two accounts on the same device do not share a filter value', () => {
  const storage = new FakeViewStorage();
  const accountA = scopeFromUserId('user-a');
  const accountB = scopeFromUserId('user-b');

  writeStoredValue(storage, accountA, 'library:playable', false, true);

  assert.equal(readStoredValue(storage, accountA, 'library:playable', false), true);
  assert.equal(readStoredValue(storage, accountB, 'library:playable', false), false);
});

test('logging out falls back to the anonymous scope, not the previous account value', () => {
  const storage = new FakeViewStorage();
  writeStoredValue(storage, scopeFromUserId('user-a'), 'library:quick-filter', 'all', 'favorites');

  const loggedOutScope = scopeFromUserId(null);
  assert.equal(loggedOutScope, ANONYMOUS_SCOPE);
  assert.equal(readStoredValue(storage, loggedOutScope, 'library:quick-filter', 'all'), 'all');
});

test('a value written before login under the anonymous scope does not leak into the account that logs in next', () => {
  const storage = new FakeViewStorage();
  writeStoredValue(storage, ANONYMOUS_SCOPE, 'discover:genre', '', 'rpg');

  const newAccountScope = scopeFromUserId('brand-new-user');
  assert.equal(readStoredValue(storage, newAccountScope, 'discover:genre', ''), '');
});

test('storage keys are namespaced per scope so the old device-global key is never read again', () => {
  assert.equal(
    buildStorageKey('user-a', 'library:playable'),
    'clube-do-jogo:view:user-a:library:playable',
  );
  assert.notEqual(
    buildStorageKey(scopeFromUserId('user-a'), 'library:playable'),
    'clube-do-jogo:view:library:playable',
  );
});
