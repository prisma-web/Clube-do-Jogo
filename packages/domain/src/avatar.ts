import type { AvatarCrop } from './types';

export const DEFAULT_AVATAR_CROP: AvatarCrop = { x: 50, y: 50, zoom: 1 };

function finiteOr(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number | undefined, minimum: number, maximum: number, fallback: number) {
  return Math.max(minimum, Math.min(maximum, finiteOr(value, fallback)));
}

export function normalizeAvatarCrop(crop?: Partial<AvatarCrop> | null): AvatarCrop {
  return {
    x: clamp(crop?.x, 0, 100, DEFAULT_AVATAR_CROP.x),
    y: clamp(crop?.y, 0, 100, DEFAULT_AVATAR_CROP.y),
    zoom: clamp(crop?.zoom, 1, 2.5, DEFAULT_AVATAR_CROP.zoom),
  };
}

/**
 * Native (React Native) equivalent of `avatarImageStyle` for a square box of `size` points.
 *
 * The web scales the image around `transform-origin: x% y%`. On Android (RN 0.86, Fabric) a
 * percentage `transformOrigin` next to `transform: scale` either collapsed the image (the
 * full-precision crops the editor saves, e.g. x 82.43055555555556 / zoom 1.8229292608973129)
 * or scaled it around the wrong point. So the origin is resolved here instead: scaling by `zoom`
 * around `o` equals translating by `(1 - zoom) * (o - center)` and scaling around the center,
 * the default origin on iOS and Android. Only numeric translate/scale reach the native side.
 * `contentPosition` (`left: x%`, `top: y%`) keeps mirroring the web's `object-position`.
 */
export function avatarNativeTransform(crop: Partial<AvatarCrop> | null | undefined, size: number) {
  const next = normalizeAvatarCrop(crop);
  const shift = (percent: number) => (1 - next.zoom) * (percent / 100 - 0.5) * size;
  return [
    { translateX: shift(next.x) },
    { translateY: shift(next.y) },
    { scale: next.zoom },
  ];
}

export function avatarImageStyle(crop?: Partial<AvatarCrop> | null) {
  const next = normalizeAvatarCrop(crop);
  return {
    objectPosition: `${next.x}% ${next.y}%`,
    transform: `scale(${next.zoom})`,
    transformOrigin: `${next.x}% ${next.y}%`,
  };
}
