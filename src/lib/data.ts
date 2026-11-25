import {
  createDataClient,
  fetchGame,
  fetchGameOfMonth,
  fetchProfileWithGames,
  fetchRankingData as fetchRankingDataFromPackage,
  fetchUserPlatforms,
  type DataClient,
} from '@clube-do-jogo/data';
import type { DataSupabaseClient } from '@clube-do-jogo/data';
import type { RankingFormula, RankingItem } from '@clube-do-jogo/domain';
import { apiFetch } from '@/lib/api-client';

export { fetchGame, fetchGameOfMonth, fetchProfileWithGames, fetchUserPlatforms };

function webRankingFormula(): RankingFormula {
  return process.env.NEXT_PUBLIC_RANKING_FORMULA === 'legacy' ? 'legacy' : 'preference';
}

export function createWebDataClient(supabase: DataSupabaseClient): DataClient {
  return createDataClient({
    supabase,
    api: { request: (path, init) => apiFetch(path, init) },
    rankingFormula: webRankingFormula(),
  });
}

export function fetchRankingData(
  supabase: DataSupabaseClient,
  votingMonth: string,
  userId: string,
  isDemo: boolean,
  historical = false,
): Promise<RankingItem[]> {
  return fetchRankingDataFromPackage(supabase, votingMonth, userId, isDemo, historical, webRankingFormula());
}
