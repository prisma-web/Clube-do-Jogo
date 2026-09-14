import {
  fetchGame,
  fetchGameOfMonth,
  fetchProfileWithGames,
  fetchRankingData as fetchRankingDataFromPackage,
  fetchUserPlatforms,
} from '@clube-do-jogo/data';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RankingItem } from '@clube-do-jogo/domain';

export { fetchGame, fetchGameOfMonth, fetchProfileWithGames, fetchUserPlatforms };

export function fetchRankingData(
  supabase: SupabaseClient,
  votingMonth: string,
  userId: string,
  isDemo: boolean,
  historical = false,
): Promise<RankingItem[]> {
  const rankingFormula = process.env.NEXT_PUBLIC_RANKING_FORMULA === 'legacy' ? 'legacy' : 'preference';
  return fetchRankingDataFromPackage(supabase, votingMonth, userId, isDemo, historical, rankingFormula);
}
