import assert from 'node:assert/strict';
import test from 'node:test';
import {
  avatarCropAfterPan,
  avatarImageStyle,
  avatarNativeTransform,
  avatarPreviewOffset,
  DEFAULT_AVATAR_CROP,
  normalizeAvatarCrop,
} from './avatar';
import type { AvatarCrop } from './types';

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

function webPoint(crop: { x: number; y: number; zoom: number }, size: number, px: number, py: number) {
  const ox = (crop.x / 100) * size;
  const oy = (crop.y / 100) * size;
  return [ox + crop.zoom * (px - ox), oy + crop.zoom * (py - oy)];
}

function nativePoint(transform: ReturnType<typeof avatarNativeTransform>, size: number, px: number, py: number) {
  const [tx, ty, s] = transform as [{ translateX: number }, { translateY: number }, { scale: number }];
  const c = size / 2;
  return [c + tx.translateX + s.scale * (px - c), c + ty.translateY + s.scale * (py - c)];
}

test('native avatar transform puts every image point where the web crop does', () => {
  const crops = [
    { x: 82.43055555555556, y: 10, zoom: 1.8229292608973129 },
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

const FRAME = 240;
const SQUARE = { width: 800, height: 800 };
const LANDSCAPE = { width: 1500, height: 1000 };
const PORTRAIT = { width: 1000, height: 1500 };
type Size = { width: number; height: number };
type Rect = { left: number; top: number; width: number; height: number };

function coverSize(image: Size) {
  const scale = Math.max(FRAME / image.width, FRAME / image.height);
  return { width: image.width * scale, height: image.height * scale };
}

function rendererRect(image: Size, crop: AvatarCrop): Rect {
  const { width, height } = coverSize(image);
  const origin = { x: (FRAME * crop.x) / 100, y: (FRAME * crop.y) / 100 };
  const left = ((FRAME - width) * crop.x) / 100;
  const top = ((FRAME - height) * crop.y) / 100;
  return {
    left: origin.x + crop.zoom * (left - origin.x),
    top: origin.y + crop.zoom * (top - origin.y),
    width: width * crop.zoom,
    height: height * crop.zoom,
  };
}

function editorRect(image: Size, crop: AvatarCrop): Rect {
  const { width, height } = coverSize(image);
  const center = FRAME / 2;
  const offset = avatarPreviewOffset(FRAME, image, crop);
  return {
    left: center + crop.zoom * ((FRAME - width) / 2 - center) + offset.x,
    top: center + crop.zoom * ((FRAME - height) / 2 - center) + offset.y,
    width: width * crop.zoom,
    height: height * crop.zoom,
  };
}

function assertSameRect(actual: Rect, expected: Rect, label: string) {
  for (const key of ['left', 'top', 'width', 'height'] as const) {
    assert.ok(Math.abs(actual[key] - expected[key]) < 1e-6, `${label}: ${key} do editor ${actual[key]} ≠ renderizador ${expected[key]}`);
  }
}

test('a prévia do editor desenha a imagem onde o avatar salvo vai desenhar', () => {
  for (const [name, image] of [['quadrada', SQUARE], ['3:2', LANDSCAPE], ['2:3', PORTRAIT]] as const) {
    for (const zoom of [1, 1.1, 1.75, 2.5]) {
      for (const [x, y] of [[0, 0], [50, 50], [100, 100], [20, 80], [73, 4]]) {
        const crop = { x, y, zoom };
        assertSameRect(editorRect(image, crop), rendererRect(image, crop), `${name} ${JSON.stringify(crop)}`);
      }
    }
  }
});

test('sem tamanho da imagem a prévia trata como quadrada', () => {
  assert.deepEqual(avatarPreviewOffset(FRAME, null, { x: 0, y: 100, zoom: 2 }), avatarPreviewOffset(FRAME, SQUARE, { x: 0, y: 100, zoom: 2 }));
});

test('o deslocamento é o da sobra que o recorte pede', () => {
  assert.deepEqual(avatarPreviewOffset(FRAME, SQUARE, { x: 0, y: 100, zoom: 1 }), { x: 0, y: 0 });
  assert.deepEqual(avatarPreviewOffset(FRAME, SQUARE, { x: 0, y: 100, zoom: 2 }), { x: 120, y: -120 });
  assert.deepEqual(avatarPreviewOffset(FRAME, LANDSCAPE, { x: 0, y: 0, zoom: 1 }), { x: 60, y: 0 });
  assert.deepEqual(avatarPreviewOffset(FRAME, PORTRAIT, { x: 0, y: 100, zoom: 1 }), { x: 0, y: -60 });
});

test('arrastar move a imagem junto com o dedo', () => {
  for (const [name, image] of [['quadrada', SQUARE], ['3:2', LANDSCAPE], ['2:3', PORTRAIT]] as const) {
    for (const zoom of [1.5, 2]) {
      const start = { x: 50, y: 50, zoom };
      const moved = avatarCropAfterPan(start, { x: 20, y: -15 }, FRAME, image);
      const before = rendererRect(image, start);
      const after = rendererRect(image, moved);
      assert.ok(Math.abs(after.left - before.left - 20) < 1e-6, `${name} zoom ${zoom}: andou ${after.left - before.left} na horizontal`);
      assert.ok(Math.abs(after.top - before.top + 15) < 1e-6, `${name} zoom ${zoom}: andou ${after.top - before.top} na vertical`);
    }
  }
});

test('num eixo sem sobra o arrasto não muda o recorte', () => {
  const start = { x: 30, y: 70, zoom: 1 };
  assert.deepEqual(avatarCropAfterPan(start, { x: 40, y: 40 }, FRAME, SQUARE), start);
  const landscape = avatarCropAfterPan(start, { x: 30, y: 40 }, FRAME, LANDSCAPE);
  assert.equal(landscape.y, 70);
  assert.ok(landscape.x < 30, 'na 3:2 sobra imagem na horizontal');
  const portrait = avatarCropAfterPan(start, { x: 30, y: 40 }, FRAME, PORTRAIT);
  assert.equal(portrait.x, 30);
  assert.ok(portrait.y < 70, 'na 2:3 sobra imagem na vertical');
});

test('o arrasto para na borda da imagem', () => {
  assert.deepEqual(avatarCropAfterPan({ x: 50, y: 50, zoom: 2 }, { x: 1000, y: -1000 }, FRAME, SQUARE), { x: 0, y: 100, zoom: 2 });
});
