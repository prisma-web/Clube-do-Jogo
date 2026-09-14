import type { RankingFormula } from '@clube-do-jogo/domain';

export type { RankingFormula } from '@clube-do-jogo/domain';
export {
  compareRankingItems,
  legacyPlaytimePoints,
  legacyRankingScore,
  preferenceRankingScore,
  rankingScore,
  voteChoices,
} from '@clube-do-jogo/domain';

export const ACTIVE_RANKING_FORMULA: RankingFormula =
  process.env.NEXT_PUBLIC_RANKING_FORMULA === 'legacy' ? 'legacy' : 'preference';
