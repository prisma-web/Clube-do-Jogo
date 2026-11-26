export type TrailerPlayback = 'loading' | 'playing' | 'paused' | 'ended' | 'closed';

export type TrailerEvent = { type: 'youtube'; state: YoutubePlayerState } | { type: 'close' };

export type YoutubePlayerState = -1 | 0 | 1 | 2 | 3 | 5;

const YOUTUBE_STATES: ReadonlySet<number> = new Set([-1, 0, 1, 2, 3, 5]);

export const TRAILER_IN_PLACE_FRACTION = 0.85;
export const FLOATING_TRAILER_MARGIN = 8;
const FLOATING_TRAILER_MAX_WIDTH = 320;
const FLOATING_TRAILER_WIDTH_SHARE = 0.62;

export function nextTrailerPlayback(current: TrailerPlayback, event: TrailerEvent): TrailerPlayback {
  if (event.type === 'close') return 'closed';
  switch (event.state) {
    case 1: return 'playing';
    case 2: return 'paused';
    case 0: return 'ended';
    default: return current;
  }
}

export function parseTrailerPlayerMessage(message: { data: string; url: string }, embedderOrigin: string): YoutubePlayerState | null {
  let payload: unknown;
  try {
    if (new URL(message.url).origin !== embedderOrigin) return null;
    payload = JSON.parse(message.data);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  const { type, state } = payload as { type?: unknown; state?: unknown };
  if (type !== 'youtube-state' || typeof state !== 'number' || !YOUTUBE_STATES.has(state)) return null;
  return state as YoutubePlayerState;
}

export function trailerVisibleFraction(scrollY: number, viewportHeight: number, anchorTop: number, anchorHeight: number): number {
  'worklet';
  if (anchorHeight <= 0 || viewportHeight <= 0) return 1;
  const visible = Math.min(anchorTop + anchorHeight, scrollY + viewportHeight) - Math.max(anchorTop, scrollY);
  return Math.min(1, Math.max(0, visible / Math.min(anchorHeight, viewportHeight)));
}

export function isTrailerInPlace(scrollY: number, viewportHeight: number, anchorTop: number, anchorHeight: number): boolean {
  'worklet';
  return trailerVisibleFraction(scrollY, viewportHeight, anchorTop, anchorHeight) >= TRAILER_IN_PLACE_FRACTION;
}

export function shouldFloatTrailer(playback: TrailerPlayback, inPlace: boolean): boolean {
  return playback === 'playing' && !inPlace;
}

export function floatingTrailerSize(anchorWidth: number): { width: number; height: number } {
  const width = Math.round(Math.min(anchorWidth * FLOATING_TRAILER_WIDTH_SHARE, FLOATING_TRAILER_MAX_WIDTH));
  return { width, height: Math.round(width * 9 / 16) };
}

export function floatingTrailerTransform(anchorWidth: number, anchorHeight: number, anchorTop: number, scrollY: number, floatingScale: number, progress: number): { scale: number; translateX: number; translateY: number } {
  'worklet';
  const scale = 1 + (floatingScale - 1) * progress;
  const shrink = 1 - scale;
  return {
    scale,
    translateX: anchorWidth * shrink / 2,
    translateY: (scrollY + FLOATING_TRAILER_MARGIN - anchorTop) * progress - anchorHeight * shrink / 2,
  };
}

export function trailerRestoreScrollY(anchorTop: number, anchorHeight: number, viewportHeight: number): number {
  return Math.max(0, Math.round(anchorTop - Math.max(0, (viewportHeight - anchorHeight) / 2)));
}
