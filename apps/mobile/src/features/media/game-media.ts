import type { Game } from '@clube-do-jogo/domain';

export const MIN_SCREENSHOTS = 3;

export function needsGameMediaRefresh(game: Pick<Game, 'screenshot_urls' | 'genres' | 'platforms' | 'platform_ids'> | null | undefined): boolean {
  if (!game) return false;
  return (game.screenshot_urls?.length ?? 0) < MIN_SCREENSHOTS
    || !game.genres?.length
    || !game.platforms?.length
    || !game.platform_ids?.length;
}

export function igdbRatingToTen(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(10, value / 10));
}
