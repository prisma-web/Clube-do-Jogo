import type { Game } from '@clube-do-jogo/domain';

export const MIN_SCREENSHOTS = 3;

/**
 * Mirrors src/app/jogos/[id]/page.tsx: only ask the server to refresh IGDB media
 * when the stored game is missing screenshots, genres or platforms.
 */
export function needsGameMediaRefresh(game: Pick<Game, 'screenshot_urls' | 'genres' | 'platforms' | 'platform_ids'> | null | undefined): boolean {
  if (!game) return false;
  return (game.screenshot_urls?.length ?? 0) < MIN_SCREENSHOTS
    || !game.genres?.length
    || !game.platforms?.length
    || !game.platform_ids?.length;
}

/** IGDB `average_rating` is 0–100; the app stores and displays ratings on 0–10. */
export function igdbRatingToTen(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(10, value / 10));
}
