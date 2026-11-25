import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COSMIC_BACKDROP_PREFERENCE_KEY,
  normalizeCosmicBackdropMode,
  parseCosmicBackdropMode,
} from '../../apps/mobile/src/features/themes/cosmic-backdrop-core';
import { resolvePersistentStateKey } from '../../apps/mobile/src/hooks/use-persistent-state';

test('modo de fundo aceita só hearth e spaceflight, com hearth como padrão', () => {
  assert.equal(normalizeCosmicBackdropMode('spaceflight'), 'spaceflight');
  assert.equal(normalizeCosmicBackdropMode('hearth'), 'hearth');
  assert.equal(normalizeCosmicBackdropMode('warp'), 'hearth');
  assert.equal(normalizeCosmicBackdropMode(null), 'hearth');
});

test('modo de fundo lê o JSON gravado e também o valor cru da web', () => {
  assert.equal(parseCosmicBackdropMode(JSON.stringify('spaceflight')), 'spaceflight');
  assert.equal(parseCosmicBackdropMode('spaceflight'), 'spaceflight');
  assert.equal(parseCosmicBackdropMode('{"x":1}'), 'hearth');
});

test('modo de fundo fica escopado por conta e separado do demo', () => {
  const account = resolvePersistentStateKey(COSMIC_BACKDROP_PREFERENCE_KEY, true, 'user-a', false, 1);
  const other = resolvePersistentStateKey(COSMIC_BACKDROP_PREFERENCE_KEY, true, 'user-b', false, 1);
  const demo = resolvePersistentStateKey(COSMIC_BACKDROP_PREFERENCE_KEY, true, 'user-a', true, 1);
  assert.notEqual(account, other);
  assert.notEqual(account, demo);
  assert.ok(account.startsWith(`${COSMIC_BACKDROP_PREFERENCE_KEY}/account/`));
  assert.ok(demo.startsWith(`${COSMIC_BACKDROP_PREFERENCE_KEY}/demo/`));
});
