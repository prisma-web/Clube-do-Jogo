export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;
export const ZOOM_STEP = 0.5;

export type Size = { width: number; height: number };
export type Point = { x: number; y: number };

export function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return MIN_ZOOM;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(value.toFixed(2))));
}

export function containedSize(viewport: Size, image: Size | null): Size {
  if (!image || image.width <= 0 || image.height <= 0) return viewport;
  const ratio = Math.min(viewport.width / image.width, viewport.height / image.height);
  return { width: image.width * ratio, height: image.height * ratio };
}

export function clampPan(pan: Point, zoom: number, viewport: Size, image: Size | null): Point {
  if (zoom <= MIN_ZOOM) return { x: 0, y: 0 };
  const rendered = containedSize(viewport, image);
  const maxX = Math.max(0, (rendered.width * zoom - viewport.width) / 2);
  const maxY = Math.max(0, (rendered.height * zoom - viewport.height) / 2);
  const clamp = (value: number, max: number) => (max === 0 ? 0 : Math.max(-max, Math.min(max, value)));
  return { x: clamp(pan.x, maxX), y: clamp(pan.y, maxY) };
}
