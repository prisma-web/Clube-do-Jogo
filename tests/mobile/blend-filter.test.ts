import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blendLayers, type BlendLayer, type ImageFilter } from '../../apps/mobile/src/features/themes/blend-filter';

type Rgb = [number, number, number];

function cssFilter(filter: ImageFilter, [r, g, b]: Rgb): Rgb {
  let c: Rgb = [r, g, b];
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const matrix = (m: number[]) => {
    c = [0, 1, 2].map((row) => clamp(m[row * 3] * c[0] + m[row * 3 + 1] * c[1] + m[row * 3 + 2] * c[2])) as Rgb;
  };
  for (const fn of filter) {
    if ('grayscale' in fn) {
      const a = 1 - fn.grayscale;
      matrix([
        0.2126 + 0.7874 * a, 0.7152 - 0.7152 * a, 0.0722 - 0.0722 * a,
        0.2126 - 0.2126 * a, 0.7152 + 0.2848 * a, 0.0722 - 0.0722 * a,
        0.2126 - 0.2126 * a, 0.7152 - 0.7152 * a, 0.0722 + 0.9278 * a,
      ]);
    } else if ('sepia' in fn) {
      const a = 1 - fn.sepia;
      matrix([
        0.393 + 0.607 * a, 0.769 - 0.769 * a, 0.189 - 0.189 * a,
        0.349 - 0.349 * a, 0.686 + 0.314 * a, 0.168 - 0.168 * a,
        0.272 - 0.272 * a, 0.534 - 0.534 * a, 0.131 + 0.869 * a,
      ]);
    } else if ('brightness' in fn) {
      c = c.map((v) => clamp(v * fn.brightness)) as Rgb;
    } else {
      c = c.map((v) => clamp((v - 0.5) * fn.contrast + 0.5)) as Rgb;
    }
  }
  return c;
}

const lum = ([r, g, b]: Rgb) => 0.3 * r + 0.59 * g + 0.11 * b;
function clipColor(c: Rgb): Rgb {
  const l = lum(c);
  const n = Math.min(...c);
  const x = Math.max(...c);
  if (n < 0) c = c.map((v) => l + ((v - l) * l) / (l - n)) as Rgb;
  if (x > 1) c = c.map((v) => l + ((v - l) * (1 - l)) / (x - l)) as Rgb;
  return c;
}
const setLum = (c: Rgb, l: number) => clipColor(c.map((v) => v + l - lum(c)) as Rgb);
function setSat(c: Rgb, s: number): Rgb {
  const max = Math.max(...c);
  const min = Math.min(...c);
  return c.map((v) => (max === min ? 0 : ((v - min) * s) / (max - min))) as Rgb;
}
const sat = (c: Rgb) => Math.max(...c) - Math.min(...c);

function parse(color: string): { rgb: Rgb; alpha: number } {
  const [r, g, b, alpha] = color.replace(/rgba\(|\)/g, '').split(',').map(Number);
  return { rgb: [r / 255, g / 255, b / 255], alpha };
}

function paint(layer: BlendLayer, backdrop: Rgb): Rgb {
  const { rgb: source, alpha } = parse(layer.backgroundColor);
  const blended: Rgb = (() => {
    switch (layer.mixBlendMode) {
      case 'saturation': return setLum(setSat(backdrop, sat(source)), lum(backdrop));
      case 'color': return setLum(source, lum(backdrop));
      case 'color-dodge': return backdrop.map((v, i) => (v === 0 ? 0 : source[i] >= 1 ? 1 : Math.min(1, v / (1 - source[i])))) as Rgb;
      case 'multiply': return backdrop.map((v, i) => v * source[i]) as Rgb;
      case 'normal': return source;
      default: throw new Error(`modo sem modelo: ${layer.mixBlendMode}`);
    }
  })();
  return backdrop.map((v, i) => (1 - alpha) * v + alpha * blended[i]) as Rgb;
}

const samples: Rgb[] = [];
for (const r of [0, 0.25, 0.5, 0.75, 1]) for (const g of [0, 0.25, 0.5, 0.75, 1]) for (const b of [0, 0.25, 0.5, 0.75, 1]) samples.push([r, g, b]);

function maxError(filter: ImageFilter) {
  const layers = blendLayers(filter);
  let worst = 0;
  for (const pixel of samples) {
    const expected = cssFilter(filter, pixel);
    const actual = layers.reduce((color, layer) => paint(layer, color), pixel);
    worst = Math.max(worst, ...expected.map((v, i) => Math.abs(v - actual[i]) * 255));
  }
  return worst;
}

test('brilho e contraste por camada de mistura são exatos', () => {
  assert.ok(maxError([{ brightness: 1.3 }]) < 1);
  assert.ok(maxError([{ brightness: 0.6 }]) < 1);
  assert.ok(maxError([{ contrast: 0.8 }]) < 1);
});

test('tons de cinza e sépia ficam perto da web, com a diferença de luminância das misturas', () => {
  assert.ok(maxError([{ grayscale: 1 }]) < 33);
  assert.ok(maxError([{ sepia: 0.12 }]) < 8);
  assert.ok(maxError([{ grayscale: 1 }, { brightness: 1.3 }, { contrast: 0.8 }]) < 34);
  assert.ok(maxError([{ grayscale: 0.25 }, { sepia: 0.12 }]) < 13);
});

test('o fundo do NieR sai em tons de cinza', () => {
  const layers = blendLayers([{ grayscale: 1 }, { brightness: 1.3 }, { contrast: 0.8 }]);
  for (const pixel of samples) {
    const [r, g, b] = layers.reduce((color, layer) => paint(layer, color), pixel);
    assert.ok(Math.abs(r - g) < 1e-9 && Math.abs(g - b) < 1e-9);
  }
});
