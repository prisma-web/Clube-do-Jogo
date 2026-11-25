export * from './api';
export * from './api-contracts';
export * from './comments';
export * from './admin';
export * from './client';
export * from './demo';
export * from './errors';
export * from './media';
export * from './notes';
export * from './profiles';
export * from './rewards';
export * from './goty';
export * from './supabase';

import type { DataSupabaseClient } from './supabase';
import { DataClient } from './client';
import type {
  DiscoverSource,
  Game,
  ProfileWithGames,
  UserPlatform,
} from '@clube-do-jogo/domain';
import type { RankingFormula, RankingItem } from '@clube-do-jogo/domain';

export function fetchRankingData(
  supabase: DataSupabaseClient,
  votingMonth: string,
  userId: string,
  isDemo: boolean,
  historical = false,
  rankingFormula: RankingFormula = 'preference',
): Promise<RankingItem[]> {
  return new DataClient({
    supabase,
    rankingFormula,
  }).readRanking({ userId, isDemo, month: votingMonth, historical });
}

export function fetchGame(supabase: DataSupabaseClient, gameId: string, isDemo: boolean): Promise<Game | null> {
  return new DataClient({ supabase }).readGame({ userId: '', isDemo, gameId });
}

export function fetchGameOfMonth(supabase: DataSupabaseClient, month: string, isDemo: boolean): Promise<Game | null> {
  return new DataClient({ supabase }).readGameOfMonth({ userId: '', isDemo, month });
}

export function fetchUserPlatforms(supabase: DataSupabaseClient, userId: string, isDemo: boolean): Promise<UserPlatform[]> {
  return new DataClient({ supabase }).readUserPlatforms(userId, isDemo);
}

export function fetchProfileWithGames(supabase: DataSupabaseClient, profileId: string, isDemo: boolean, voteMonth?: string): Promise<ProfileWithGames> {
  return new DataClient({ supabase }).readLibrary({ profileId, userId: profileId, isDemo, voteMonth });
}

export function fetchDiscovery(
  client: DataClient,
  userId: string,
  isDemo: boolean,
  source: DiscoverSource,
  search?: string,
  month?: string,
) {
  return client.readDiscovery({ userId, isDemo, source, search, month });
}
