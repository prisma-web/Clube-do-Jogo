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

export function avatarImageStyle(crop?: Partial<AvatarCrop> | null) {
  const next = normalizeAvatarCrop(crop);
  return {
    objectPosition: `${next.x}% ${next.y}%`,
    transform: `scale(${next.zoom})`,
    transformOrigin: `${next.x}% ${next.y}%`,
  };
}
