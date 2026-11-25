import type { GameProgress } from '@clube-do-jogo/domain';

export function summarizeClubProgress(progress: Pick<GameProgress, 'status' | 'rating'>[]) {
  const rated = progress.filter(item => item.rating !== null && item.rating !== undefined && Number.isFinite(Number(item.rating)));
  return {
    finishedCount: progress.filter(item => item.status === 'finished').length,
    ratingCount: rated.length,
    clubAverage: rated.length ? rated.reduce((total, item) => total + Number(item.rating), 0) / rated.length : null,
  };
}
