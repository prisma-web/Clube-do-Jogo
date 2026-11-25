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

export type AvatarImageSize = { width: number; height: number };
type Offset = { x: number; y: number };

// Tamanho da imagem em cover num quadro quadrado. O eixo que cobre fica com o
// tamanho exato do quadro, para a sobra dele dar zero sem erro de arredondamento.
function coverSize(frame: number, image: AvatarImageSize | null | undefined) {
  if (!image || !(image.width > 0) || !(image.height > 0)) return { width: frame, height: frame };
  const ratio = image.width / image.height;
  return ratio >= 1 ? { width: frame * ratio, height: frame } : { width: frame, height: frame / ratio };
}

// Quanto a imagem passa do quadro em cada eixo, já com o zoom.
function overflow(frame: number, image: AvatarImageSize | null | undefined, zoom: number): Offset {
  const cover = coverSize(frame, image);
  return { x: cover.width * zoom - frame, y: cover.height * zoom - frame };
}

const round = (value: number) => Math.round(value * 1e6) / 1e6 + 0;

/**
 * Deslocamento, em pixels de tela, para a prévia do editor bater com o Avatar.
 *
 * O Avatar desenha com cover, object-position x% y% e scale(zoom) em volta de
 * x% y%, o que põe a borda da imagem em x% da sobra. O editor não pode mexer no
 * contentPosition durante o gesto (o expo-image remonta a imagem a cada quadro e
 * o círculo fica vazio), então centraliza a imagem, aplica scale(zoom) em volta
 * do centro e soma este deslocamento num translate anterior ao scale.
 * Sem o tamanho natural da imagem, trata como quadrada.
 */
export function avatarPreviewOffset(frame: number, image: AvatarImageSize | null | undefined, crop: Partial<AvatarCrop> | null | undefined): Offset {
  const next = normalizeAvatarCrop(crop);
  const room = overflow(frame, image, next.zoom);
  return { x: round((room.x * (50 - next.x)) / 100), y: round((room.y * (50 - next.y)) / 100) };
}

/**
 * Recorte depois de arrastar o dedo `translation` pixels a partir de `start`. A
 * imagem acompanha o dedo, e num eixo em que ela não passa do quadro o recorte
 * daquele eixo não muda.
 */
export function avatarCropAfterPan(start: Partial<AvatarCrop>, translation: Offset, frame: number, image: AvatarImageSize | null | undefined): AvatarCrop {
  const next = normalizeAvatarCrop(start);
  const room = overflow(frame, image, next.zoom);
  const move = (value: number, delta: number, space: number) => (space > 1e-6 ? value - (delta / space) * 100 : value);
  return normalizeAvatarCrop({ ...next, x: move(next.x, translation.x, room.x), y: move(next.y, translation.y, room.y) });
}
