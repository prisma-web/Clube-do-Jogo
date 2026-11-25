import assert from 'node:assert/strict';
import test from 'node:test';
import { avatarImageStyle, avatarNativeTransform, DEFAULT_AVATAR_CROP, normalizeAvatarCrop } from './avatar';

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

// Where a point of the (already object-fit/object-position'ed) image box lands on screen.
function webPoint(crop: { x: number; y: number; zoom: number }, size: number, px: number, py: number) {
  // CSS: transform: scale(zoom) with transform-origin: x% y%.
  const ox = (crop.x / 100) * size;
  const oy = (crop.y / 100) * size;
  return [ox + crop.zoom * (px - ox), oy + crop.zoom * (py - oy)];
}

function nativePoint(transform: ReturnType<typeof avatarNativeTransform>, size: number, px: number, py: number) {
  // React Native: transforms around the default origin, the box center. The translate is in
  // points of the parent, then the image is scaled around its center.
  const [tx, ty, s] = transform as [{ translateX: number }, { translateY: number }, { scale: number }];
  const c = size / 2;
  return [c + tx.translateX + s.scale * (px - c), c + ty.translateY + s.scale * (py - c)];
}

test('native avatar transform puts every image point where the web crop does', () => {
  const crops = [
    { x: 82.43055555555556, y: 10, zoom: 1.8229292608973129 }, // full precision saved by the editor
    { x: 38.2, y: 59.4, zoom: 1.05 },
    { x: 0, y: 100, zoom: 2.5 },
    { x: 50, y: 50, zoom: 1 },
  ];
  for (const crop of crops) {
    for (const size of [32, 40, 88, 236]) {
      const transform = avatarNativeTransform(crop, size);
      for (const [px, py] of [[0, 0], [size, 0], [0, size], [size, size], [size * 0.3, size * 0.7]]) {
        const [wx, wy] = webPoint(crop, size, px, py);
        const [nx, ny] = nativePoint(transform, size, px, py);
        assert.ok(Math.abs(wx - nx) < 1e-9 && Math.abs(wy - ny) < 1e-9, `${JSON.stringify(crop)} @${size}: (${px},${py})`);
      }
    }
  }
});

test('native avatar transform only uses numbers, normalizes the crop and is identity without one', () => {
  assert.deepEqual(avatarNativeTransform(null, 40), [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }]);
  const clamped = avatarNativeTransform({ x: 150, y: -10, zoom: 9 }, 100);
  assert.deepEqual(clamped, [{ translateX: -75 }, { translateY: 75 }, { scale: 2.5 }]);
  for (const step of avatarNativeTransform({ x: Number.NaN, y: 12.5, zoom: 1.8229292608973129 }, 88)) {
    for (const value of Object.values(step)) assert.ok(typeof value === 'number' && Number.isFinite(value));
  }
});
