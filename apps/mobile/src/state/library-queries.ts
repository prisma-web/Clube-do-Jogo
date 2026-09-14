import {
  useInfiniteQuery,
  useMutation,
  type InfiniteData,
  type UseMutationResult,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';
import type { DiscoveryFilters, DiscoveryPage } from '@clube-do-jogo/data';
export type { DiscoveryFilters } from '@clube-do-jogo/data';
import type {
  DiscoverSource,
  GameProgress,
  ProfileWithGames,
  RatingDetails,
  RatingMode,
} from '@clube-do-jogo/domain';
import { shiftMonth } from '@clube-do-jogo/domain';
import { useAppInternal } from './app-provider';

const DISCOVERY_PAGE_SIZE = 24;

export type RatingVariables = {
  gameId: string;
  rating: number | null;
  ratingMode: RatingMode;
  ratingDetails?: RatingDetails | null;
};

function requireUser(userId: string | null) {
  if (!userId) throw new Error('Entre na sua conta para continuar.');
  return userId;
}

function requireLive(isHistorical: boolean) {
  if (isHistorical) throw new Error('O histórico é somente leitura.');
}

function progressKey(context: ReturnType<typeof useAppInternal>, gameId: string) {
  return ['progress', context.sessionEpoch, context.userId, context.selectedMonth, context.isHistorical, gameId, context.isDemo] as const;
}

function libraryKey(context: ReturnType<typeof useAppInternal>) {
  return ['library', context.sessionEpoch, context.userId, context.userId, shiftMonth(context.selectedMonth, 1), context.isDemo] as const;
}

function copyDetails(details: RatingDetails | null | undefined) {
  return details ? { ...details } : null;
}

type NormalizedDiscoveryFilters = {
  search: string;
  genre: number | null;
  platform: number | null;
  year: number | null;
  month: string;
};

function normalizeFilterNumber(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

function normalizeDiscoveryFilters(selectedMonth: string, filters?: DiscoveryFilters): NormalizedDiscoveryFilters {
  return {
    search: filters?.search?.trim() || '',
    genre: normalizeFilterNumber(filters?.genre),
    platform: normalizeFilterNumber(filters?.platform),
    year: normalizeFilterNumber(filters?.year),
    month: filters?.month?.trim() || shiftMonth(selectedMonth, 1),
  };
}

function discoveryKey(
  context: ReturnType<typeof useAppInternal>,
  source: DiscoverSource,
  filters: NormalizedDiscoveryFilters,
) {
  return [
    'discovery-pages',
    context.sessionEpoch,
    context.userId,
    context.isDemo,
    context.selectedMonth,
    source,
    filters,
  ] as const;
}

function optimisticProgress(
  items: GameProgress[] | undefined,
  userId: string,
  input: RatingVariables,
  profile: ReturnType<typeof useAppInternal>['profile'],
) {
  if (!items) return items;
  const current = items.find(item => item.user_id === userId && item.game_id === input.gameId);
  const next: GameProgress = {
    id: current?.id || `new-${userId}-${input.gameId}`,
    user_id: userId,
    game_id: input.gameId,
    status: current?.status || 'not_started',
    rating: input.rating,
    rating_mode: input.ratingMode,
    rating_details: copyDetails(input.ratingDetails),
    started_at: current?.started_at || null,
    finished_at: current?.finished_at || null,
    profile: current?.profile || profile || undefined,
  };
  return current ? items.map(item => item === current ? next : item) : [next, ...items];
}

function optimisticLibrary(
  data: ProfileWithGames | undefined,
  input: RatingVariables,
): ProfileWithGames | undefined {
  if (!data) return data;
  const now = new Date().toISOString();
  const library = data.library.map(item => {
    if (item.game.id !== input.gameId) return item;
    return {
      ...item,
      progress: {
        status: item.progress?.status || 'not_started',
        rating: input.rating,
        rating_mode: input.ratingMode,
        rating_details: copyDetails(input.ratingDetails),
        started_at: item.progress?.started_at || null,
        finished_at: item.progress?.finished_at || null,
      },
      updatedAt: now,
    };
  });
  return {
    ...data,
    library,
  };
}

type RatingRollback = {
  previousProgress?: GameProgress[];
  previousLibrary?: ProfileWithGames;
  progressQueryKey: ReturnType<typeof progressKey>;
  libraryQueryKey: ReturnType<typeof libraryKey>;
};

export function useSetRating(): UseMutationResult<void, Error, RatingVariables> {
  const context = useAppInternal();
  const epoch = context.sessionEpoch;
  const ownLibraryQueryKey = libraryKey(context);
  return useMutation<void, Error, RatingVariables, RatingRollback>({
    mutationFn: input => {
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      requireLive(context.isHistorical);
      return context.dataClient.setRating({
        userId: requireUser(context.userId),
        isDemo: context.isDemo,
        historical: context.isHistorical,
        ...input,
      });
    },
    onMutate: async input => {
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      const currentUserId = requireUser(context.userId);
      requireLive(context.isHistorical);
      const progressKeyForGame = progressKey(context, input.gameId);
      await Promise.all([
        context.queryClient.cancelQueries({ queryKey: progressKeyForGame }),
        context.queryClient.cancelQueries({ queryKey: ownLibraryQueryKey }),
      ]);
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      const previousProgress = context.queryClient.getQueryData<GameProgress[]>(progressKeyForGame);
      const previousLibrary = context.queryClient.getQueryData<ProfileWithGames>(ownLibraryQueryKey);
      context.queryClient.setQueryData(
        progressKeyForGame,
        optimisticProgress(previousProgress, currentUserId, input, context.profile),
      );
      context.queryClient.setQueryData(
        ownLibraryQueryKey,
        optimisticLibrary(previousLibrary, input),
      );
      return {
        previousProgress,
        previousLibrary,
        progressQueryKey: progressKeyForGame,
        libraryQueryKey: ownLibraryQueryKey,
      };
    },
    onError: (_error, input, rollback) => {
      if (!context.isSessionCurrent(epoch)) return;
      if (rollback?.previousProgress && rollback.progressQueryKey) {
        context.queryClient.setQueryData(rollback.progressQueryKey, rollback.previousProgress);
      }
      if (rollback?.previousLibrary && rollback.libraryQueryKey) {
        context.queryClient.setQueryData(rollback.libraryQueryKey, rollback.previousLibrary);
      }
    },
    onSettled: (_data, _error, input, rollback) => {
      if (!input || !context.isSessionCurrent(epoch)) return;
      void context.queryClient.invalidateQueries({ queryKey: rollback?.progressQueryKey || progressKey(context, input.gameId) });
      void context.queryClient.invalidateQueries({ queryKey: rollback?.libraryQueryKey || ownLibraryQueryKey });
      void context.queryClient.invalidateQueries({ queryKey: ['library', context.sessionEpoch] });
    },
  });
}

export function useDiscoveryPages(
  source: DiscoverSource,
  filters?: DiscoveryFilters,
): UseInfiniteQueryResult<InfiniteData<DiscoveryPage, number>, Error> {
  const context = useAppInternal();
  const userId = context.userId;
  const normalized = normalizeDiscoveryFilters(context.selectedMonth, filters);
  const queryKey = discoveryKey(context, source, normalized);
  const query = useInfiniteQuery<DiscoveryPage, Error, InfiniteData<DiscoveryPage, number>, typeof queryKey, number>({
    queryKey,
    enabled: context.ready && Boolean(userId),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => context.dataClient.readDiscoveryPage({
      userId: requireUser(userId),
      isDemo: context.isDemo,
      source,
      filters: {
        search: normalized.search || undefined,
        genre: normalized.genre ?? undefined,
        platform: normalized.platform ?? undefined,
        year: normalized.year ?? undefined,
        month: normalized.month,
      },
      offset: pageParam,
      limit: DISCOVERY_PAGE_SIZE,
    }),
    getNextPageParam: (lastPage, pages) => lastPage.hasMore ? pages.length * DISCOVERY_PAGE_SIZE : undefined,
    select: data => {
      const seen = new Set<string>();
      return {
        ...data,
        pages: data.pages.map(page => ({
          ...page,
          items: page.items.filter(item => {
            if (seen.has(item.game.id)) return false;
            seen.add(item.game.id);
            return true;
          }),
        })),
      };
    },
  });
  return query;
}
