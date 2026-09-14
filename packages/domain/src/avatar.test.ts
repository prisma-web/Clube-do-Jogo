import assert from 'node:assert/strict';
import test from 'node:test';
import { avatarImageStyle, DEFAULT_AVATAR_CROP, normalizeAvatarCrop } from './avatar';

test('avatar crop uses the shared defaults and clamps every boundary', () => {
  assert.deepEqual(normalizeAvatarCrop(), DEFAULT_AVATAR_CROP);
  assert.deepEqual(normalizeAvatarCrop({ x: -1, y: 101, zoom: 3 }), { x: 0, y: 100, zoom: 2.5 });
  assert.deepEqual(normalizeAvatarCrop({ x: 0, y: 100, zoom: 1 }), { x: 0, y: 100, zoom: 1 });
});

test('invalid avatar crop values fall back without producing NaN styles', () => {
  const crop = normalizeAvatarCrop({ x: Number.NaN, y: Number.POSITIVE_INFINITY, zoom: Number.NEGATIVE_INFINITY });
  assert.deepEqual(crop, DEFAULT_AVATAR_CROP);
  assert.deepEqual(avatarImageStyle(crop), {
    objectPosition: '50% 50%',
    transform: 'scale(1)',
    transformOrigin: '50% 50%',
  });
});
