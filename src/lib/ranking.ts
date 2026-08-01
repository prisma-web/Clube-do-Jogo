import type { Game, RankingFormula, VoteChoice } from './types';

export const ACTIVE_RANKING_FORMULA: RankingFormula =
  process.env.NEXT_PUBLIC_RANKING_FORMULA === 'legacy' ? 'legacy' : 'preference';

export const voteChoices: VoteChoice[] = ['would_play', 'would_not_play'];

export function legacyPlaytimePoints(hours: number) {
  if (hours < 8) return 1;
  if (hours <= 15) return 3;
  if (hours <= 20) return 2;
  return 1;
}

/**
 * Fórmula original, mantida isolada para permitir comparação e rollback:
 * votos × 2 × peso de duração × (nota IGDB / 100) ÷ penalidade de finalizações.
 */
export function legacyRankingScore(game: Game, votes: number, completed: number) {
  const playtime = legacyPlaytimePoints(Number(game.duration_hours));
  const rating = Number(game.average_rating ?? 50) / 100;
  const penalty = completed > 0 ? completed * 2 : 1;
  return Math.round(((votes * 2 * playtime * rating) / penalty) * 10) / 10;
}

/**
 * Fórmula vigente: cada “Jogaria” vale +1 e cada “Não” vale -1.
 */
export function preferenceRankingScore(counts: Record<VoteChoice, number>) {
  return counts.would_play - counts.would_not_play;
}

export function rankingScore(
  formula: RankingFormula,
  game: Game,
  counts: Record<VoteChoice, number>,
  completed: number,
) {
  return formula === 'legacy'
    ? legacyRankingScore(game, counts.would_play + counts.would_not_play, completed)
    : preferenceRankingScore(counts);
}

export function compareRankingItems<T extends { totalPoints: number; choiceCounts: Record<VoteChoice, number>; game: Game }>(a: T, b: T) {
  return b.totalPoints - a.totalPoints
    || b.choiceCounts.would_play - a.choiceCounts.would_play
    || a.choiceCounts.would_not_play - b.choiceCounts.would_not_play
    || a.game.title.localeCompare(b.game.title, 'pt-BR');
}
