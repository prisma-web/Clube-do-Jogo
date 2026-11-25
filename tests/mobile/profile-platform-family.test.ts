import assert from 'node:assert/strict';
import test from 'node:test';
import { platformFamily } from '../../apps/mobile/src/features/profile/platform-family';

test('classifies platform families like the web PlatformCard', () => {
  assert.equal(platformFamily({ name: 'PlayStation 5', abbreviation: 'PS5' }), 'playstation');
  assert.equal(platformFamily({ name: 'Xbox Series X|S' }), 'xbox');
  assert.equal(platformFamily({ name: 'Nintendo Switch', abbreviation: 'Switch' }), 'nintendo');
  assert.equal(platformFamily({ name: 'PC (Microsoft Windows)', abbreviation: 'PC' }), 'pc');
  assert.equal(platformFamily({ name: 'Atari 2600', abbreviation: null }), 'other');
});
