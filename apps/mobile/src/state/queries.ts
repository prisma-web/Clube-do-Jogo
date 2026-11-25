import {
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  shiftMonth,
  transitionProgress,
} from '@clube-do-jogo/domain';
import type {
  DiscoverItem,
  DiscoverSource,
  Game,
  GameProgress,
  LibraryGame,
  Profile,
  ProfileWithGames,
  ProgressStatus,
  RankingItem,
  VoteChoice,
  VoteParticipant,
  VoteReason,
} from '@clube-do-jogo/domain';
import { apiRoutes, type ApiRequestBody } from '@clube-do-jogo/data';
import { createMobileApiTransport, getMobileSupabaseClient } from '@/platform';
import { useAppInternal } from './app-provider';
import { isNewVote, optimisticRanking } from './optimistic-ranking';

// Best-effort push, mirroring src/app/ranking/page.tsx's `notifyRankingLeader`
// (same `/api/push/ranking-leader` route and payload shape). The vote is already
// saved by the time this runs, so a push failure must never surface as a failed vote.
function notifyRankingLeaderPush(voteMonth: string, previousLeaderId: string | null, leaderId: string | null) {
  const transport = createMobileApiTransport(getMobileSupabaseClient());
  void transport.request(apiRoutes.pushRankingLeader.path, {
    method: apiRoutes.pushRankingLeader.method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voteMonth, previousLeaderId, leaderId } satisfies ApiRequestBody<'pushRankingLeader'>),
  }).catch(() => {});
}

function notifyVotingThreshold(voteMonth: string, gameId: string) {
  const transport = createMobileApiTransport(getMobileSupabaseClient());
  void transport.request(apiRoutes.pushVotingThreshold.path, {
    method: apiRoutes.pushVotingThreshold.method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'vote-saved', voteMonth, gameId } satisfies ApiRequestBody<'pushVotingThreshold'>),
  }).catch(() => {});
}

type VoteVariables = {
  gameId: string;
  /** Lets the optimistic update show a game that is not in the ranking yet. */
  game?: Game;
  choice: VoteChoice | null;
  reason?: VoteReason | null;
  reasonText?: string;
};

type ProgressVariables = { gameId: string; status: ProgressStatus };
type BacklogVariables = { gameId: string; inBacklog: boolean };
type FavoriteVariables = { gameId: string; favorite: boolean };

function requireUser(userId: string | null) {
  if (!userId) throw new Error('Entre na sua conta para continuar.');
  return userId;
}

function requireLive(isHistorical: boolean) {
  if (isHistorical) throw new Error('O histórico é somente leitura.');
}

function rankingKey(context: ReturnType<typeof useAppInternal>) {
  return ['ranking', context.sessionEpoch, context.userId, context.selectedMonth, context.isDemo, context.isHistorical] as const;
}

function libraryKey(context: ReturnType<typeof useAppInternal>, profileId: string) {
  return ['library', context.sessionEpoch, context.userId, profileId, shiftMonth(context.selectedMonth, 1), context.isDemo] as const;
}

// Progress is live by default, even while a historical cycle is selected (parity
// with the web game detail and Meus Jogos). Only a caller that explicitly passes a
// `snapshotMonth` (the historical Jogo do Mês) reads the frozen cycle snapshot.
export function progressQueryKey(context: Pick<ReturnType<typeof useAppInternal>, 'sessionEpoch' | 'userId' | 'isDemo'>, gameId: string, snapshotMonth: string | null = null) {
  return ['progress', context.sessionEpoch, context.userId, snapshotMonth, gameId, context.isDemo] as const;
}

function progressKey(context: ReturnType<typeof useAppInternal>, gameId: string) {
  return progressQueryKey(context, gameId, null);
}

function profileForVote(profile: Profile | null, input: VoteVariables): VoteParticipant {
  return {
    ...(profile || { id: 'current-user', name: 'Você', avatar_url: null }),
    reason: input.reason || null,
    reasonText: input.reasonText?.trim() || null,
  };
}

function optimisticProgress(items: GameProgress[] | undefined, userId: string, gameId: string, status: ProgressStatus, profile: Profile | null) {
  if (!items) return items;
  const current = items.find(item => item.user_id === userId && item.game_id === gameId);
  const nextValues = transitionProgress(current, status);
  const next: GameProgress = {
    id: current?.id || `new-${userId}-${gameId}`,
    user_id: userId,
    game_id: gameId,
    ...nextValues,
    profile: current?.profile || profile || undefined,
  };
  return current ? items.map(item => item === current ? next : item) : [next, ...items];
}

function rebuildLibrary(data: ProfileWithGames, library: LibraryGame[]) {
  return {
    ...data,
    library,
    backlog: library.filter(item => item.inBacklog).map(item => item.game),
    completed: library.filter(item => item.progress?.status === 'finished').map(item => item.game),
    favorites: library.filter(item => item.favorite).map(item => item.game),
  };
}

export function useRanking(): UseQueryResult<RankingItem[], Error> {
  const context = useAppInternal();
  const userId = context.userId;
  return useQuery<RankingItem[], Error>({
    queryKey: rankingKey(context),
    enabled: context.ready && Boolean(userId),
    queryFn: () => context.dataClient.readRanking({
      userId: requireUser(userId),
      isDemo: context.isDemo,
      month: context.selectedMonth,
      historical: context.isHistorical,
    }),
  });
}

export function useGameOfMonth(month?: string): UseQueryResult<Game | null, Error> {
  const context = useAppInternal();
  const userId = context.userId;
  const selectedMonth = month || context.selectedMonth;
  return useQuery<Game | null, Error>({
    queryKey: ['game-of-month', context.sessionEpoch, userId, selectedMonth, context.isDemo],
    enabled: context.ready && Boolean(userId),
    queryFn: () => context.dataClient.readGameOfMonth({
      userId: requireUser(userId),
      isDemo: context.isDemo,
      month: selectedMonth,
    }),
  });
}

export function useGame(gameId: string): UseQueryResult<Game | null, Error> {
  const context = useAppInternal();
  const userId = context.userId;
  return useQuery<Game | null, Error>({
    queryKey: ['game', context.sessionEpoch, userId, gameId, context.isDemo],
    enabled: context.ready && Boolean(userId) && Boolean(gameId),
    queryFn: () => context.dataClient.readGame({ userId: requireUser(userId), isDemo: context.isDemo, gameId }),
  });
}

export function useLibrary(profileId?: string): UseQueryResult<ProfileWithGames, Error> {
  const context = useAppInternal();
  const targetId = profileId || context.userId;
  return useQuery<ProfileWithGames, Error>({
    queryKey: libraryKey(context, targetId || 'anonymous'),
    enabled: context.ready && Boolean(targetId),
    queryFn: () => context.dataClient.readLibrary({
      userId: requireUser(context.userId),
      profileId: requireUser(targetId),
      isDemo: context.isDemo,
      voteMonth: shiftMonth(context.selectedMonth, 1),
    }),
  });
}

export function useProgress(gameId: string, options?: { snapshotMonth?: string | null }): UseQueryResult<GameProgress[], Error> {
  const context = useAppInternal();
  const userId = context.userId;
  const snapshotMonth = options?.snapshotMonth || null;
  return useQuery<GameProgress[], Error>({
    queryKey: progressQueryKey(context, gameId, snapshotMonth),
    enabled: context.ready && Boolean(userId) && Boolean(gameId),
    queryFn: () => context.dataClient.readProgress({
      userId: requireUser(userId),
      isDemo: context.isDemo,
      gameId,
      month: snapshotMonth ?? undefined,
      historical: Boolean(snapshotMonth),
    }),
  });
}

export function useVote(): UseMutationResult<void, Error, VoteVariables> {
  const context = useAppInternal();
  const epoch = context.sessionEpoch;
  const key = rankingKey(context);
  return useMutation<void, Error, VoteVariables, { previous?: RankingItem[]; queryKey: ReturnType<typeof rankingKey>; previousLeaderId: string | null; nextLeaderId: string | null; newVote: boolean }>({
    mutationFn: input => {
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      const userId = requireUser(context.userId);
      requireLive(context.isHistorical);
      return context.dataClient.setVote({
        userId,
        isDemo: context.isDemo,
        month: context.selectedMonth,
        historical: context.isHistorical,
        gameId: input.gameId,
        choice: input.choice,
        reason: input.reason,
        reasonText: input.reasonText,
      });
    },
    onMutate: async input => {
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      requireUser(context.userId);
      requireLive(context.isHistorical);
      await context.queryClient.cancelQueries({ queryKey: key });
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      const previous = context.queryClient.getQueryData<RankingItem[]>(key);
      const next = optimisticRanking(previous, input, profileForVote(context.profile, input), context.dataClient.rankingFormula);
      context.queryClient.setQueryData(key, next);
      return {
        previous,
        queryKey: key,
        previousLeaderId: previous?.[0]?.game.id || null,
        nextLeaderId: next?.[0]?.game.id || null,
        newVote: isNewVote(previous, input),
      };
    },
    onSuccess: (_data, input, mutationContext) => {
      if (!context.isSessionCurrent(epoch) || !mutationContext || context.isDemo) return;
      if (mutationContext.newVote) notifyVotingThreshold(shiftMonth(context.selectedMonth, 1), input.gameId);
      const { previousLeaderId, nextLeaderId } = mutationContext;
      if (previousLeaderId === nextLeaderId) return;
      notifyRankingLeaderPush(shiftMonth(context.selectedMonth, 1), previousLeaderId, nextLeaderId);
    },
    onError: (_error, _input, rollback) => {
      if (context.isSessionCurrent(epoch) && rollback?.previous) context.queryClient.setQueryData(rollback.queryKey, rollback.previous);
    },
    onSettled: () => {
      if (!context.isSessionCurrent(epoch)) return;
      void context.queryClient.invalidateQueries({ queryKey: ['ranking', context.sessionEpoch] });
      void context.queryClient.invalidateQueries({ queryKey: ['library', context.sessionEpoch] });
    },
  });
}

export function useSetProgress(): UseMutationResult<void, Error, ProgressVariables> {
  const context = useAppInternal();
  const epoch = context.sessionEpoch;
  return useMutation<void, Error, ProgressVariables, { previous?: GameProgress[]; queryKey: ReturnType<typeof progressKey> }>({
    mutationFn: input => {
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      const userId = requireUser(context.userId);
      return context.dataClient.setProgress({ userId, isDemo: context.isDemo, ...input, historical: false });
    },
    onMutate: async input => {
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      const userId = requireUser(context.userId);
      const key = progressKey(context, input.gameId);
      await context.queryClient.cancelQueries({ queryKey: key });
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      const previous = context.queryClient.getQueryData<GameProgress[]>(key);
      context.queryClient.setQueryData(key, optimisticProgress(previous, userId, input.gameId, input.status, context.profile));
      return { previous, queryKey: key };
    },
    onError: (_error, input, rollback) => {
      if (context.isSessionCurrent(epoch) && rollback?.previous) context.queryClient.setQueryData(rollback.queryKey, rollback.previous);
    },
    onSettled: (_data, _error, input) => {
      if (!context.isSessionCurrent(epoch)) return;
      void context.queryClient.invalidateQueries({ queryKey: progressKey(context, input.gameId) });
      void context.queryClient.invalidateQueries({ queryKey: ['library', context.sessionEpoch] });
      void context.queryClient.invalidateQueries({ queryKey: ['ranking', context.sessionEpoch] });
    },
  });
}

export function useBacklog(): UseMutationResult<void, Error, BacklogVariables> {
  const context = useAppInternal();
  const epoch = context.sessionEpoch;
  const targetId = context.userId;
  const key = libraryKey(context, targetId || 'anonymous');
  return useMutation<void, Error, BacklogVariables, { previous?: ProfileWithGames; queryKey: ReturnType<typeof libraryKey> }>({
    mutationFn: input => {
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      return context.dataClient.setBacklog({ userId: requireUser(context.userId), isDemo: context.isDemo, ...input });
    },
    onMutate: async input => {
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      requireUser(context.userId);
      await context.queryClient.cancelQueries({ queryKey: key });
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      const previous = context.queryClient.getQueryData<ProfileWithGames>(key);
      if (previous) {
        const now = new Date().toISOString();
        const library = previous.library.map(item => item.game.id === input.gameId ? { ...item, inBacklog: input.inBacklog, updatedAt: now } : item);
        context.queryClient.setQueryData(key, rebuildLibrary(previous, library));
      }
      return { previous, queryKey: key };
    },
    onError: (_error, _input, rollback) => {
      if (context.isSessionCurrent(epoch) && rollback?.previous) context.queryClient.setQueryData(rollback.queryKey, rollback.previous);
    },
    onSettled: () => {
      if (!context.isSessionCurrent(epoch)) return;
      void context.queryClient.invalidateQueries({ queryKey: key });
      void context.queryClient.invalidateQueries({ queryKey: ['ranking', context.sessionEpoch] });
    },
  });
}

export function useFavorite(): UseMutationResult<void, Error, FavoriteVariables> {
  const context = useAppInternal();
  const epoch = context.sessionEpoch;
  const targetId = context.userId;
  const key = libraryKey(context, targetId || 'anonymous');
  return useMutation<void, Error, FavoriteVariables, { previous?: ProfileWithGames; queryKey: ReturnType<typeof libraryKey> }>({
    mutationFn: input => {
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      return context.dataClient.setFavorite({ userId: requireUser(context.userId), isDemo: context.isDemo, ...input });
    },
    onMutate: async input => {
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      requireUser(context.userId);
      await context.queryClient.cancelQueries({ queryKey: key });
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      const previous = context.queryClient.getQueryData<ProfileWithGames>(key);
      if (previous) {
        const now = new Date().toISOString();
        const library = previous.library.map(item => item.game.id === input.gameId ? { ...item, favorite: input.favorite, updatedAt: now } : item);
        context.queryClient.setQueryData(key, rebuildLibrary(previous, library));
      }
      return { previous, queryKey: key };
    },
    onError: (_error, _input, rollback) => {
      if (context.isSessionCurrent(epoch) && rollback?.previous) context.queryClient.setQueryData(rollback.queryKey, rollback.previous);
    },
    onSettled: () => {
      if (!context.isSessionCurrent(epoch)) return;
      void context.queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useDiscovery(source: DiscoverSource, search?: string): UseQueryResult<DiscoverItem[], Error> {
  const context = useAppInternal();
  const userId = context.userId;
  const month = shiftMonth(context.selectedMonth, 1);
  return useQuery<DiscoverItem[], Error>({
    queryKey: ['discovery', context.sessionEpoch, userId, context.selectedMonth, source, search?.trim() || '', context.isDemo],
    enabled: context.ready && Boolean(userId),
    queryFn: () => context.dataClient.readDiscovery({
      userId: requireUser(userId),
      isDemo: context.isDemo,
      source,
      search,
      month,
    }),
  });
}

/** Title search through `/api/search` (same endpoint as the web ranking search); demo mode filters demo titles. */
export function useGameSearch(query: string): UseQueryResult<Game[], Error> {
  const context = useAppInternal();
  const userId = context.userId;
  const normalized = query.trim();
  return useQuery<Game[], Error>({
    queryKey: ['game-search', context.sessionEpoch, userId, normalized, context.isDemo],
    enabled: context.ready && Boolean(userId) && Boolean(normalized),
    staleTime: 60_000,
    queryFn: () => context.dataClient.searchGames({
      userId: requireUser(userId),
      isDemo: context.isDemo,
      query: normalized,
    }),
  });
}
