import type { BlendMode } from 'react-native';

export type ImageFilter = ReadonlyArray<
  { grayscale: number } | { sepia: number } | { brightness: number } | { contrast: number }
>;

export type BlendLayer = { readonly backgroundColor: string; readonly mixBlendMode: BlendMode };

const sepiaTone = '255,227,177';

const gray = (level: number, alpha = 1) => {
  const channel = Math.round(level * 255);
  return `rgba(${channel},${channel},${channel},${alpha})`;
};

export function blendLayers(filter: ImageFilter): BlendLayer[] {
  return filter.map((fn): BlendLayer => {
    if ('grayscale' in fn) return { backgroundColor: gray(0.5, fn.grayscale), mixBlendMode: 'saturation' };
    if ('sepia' in fn) return { backgroundColor: `rgba(${sepiaTone},${fn.sepia})`, mixBlendMode: 'color' };
    if ('brightness' in fn) {
      return fn.brightness >= 1
        ? { backgroundColor: gray(1 - 1 / fn.brightness), mixBlendMode: 'color-dodge' }
        : { backgroundColor: gray(fn.brightness), mixBlendMode: 'multiply' };
    }
    return { backgroundColor: gray(0.5, Math.max(0, 1 - fn.contrast)), mixBlendMode: 'normal' };
  });
}
