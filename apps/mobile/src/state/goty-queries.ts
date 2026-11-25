import { useEffect, useMemo, useRef } from 'react';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  type QueryKey,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  apiRoutes,
  configureGotyDemoStorage,
  GotyDataClient,
  resetDemoGotyState,
  type ApiRequestBody,
  type ApiResult,
  type Unvalidated,
} from '@clube-do-jogo/data';
import {
  GOTY_2026_EDITION_YEAR,
  type GotyFullState,
  type GotySearchGameResult,
} from '@clube-do-jogo/domain';
import { getMobileApiTransport, getMobileSupabaseClient } from '@/platform';
import {
  applyBolaoConfirmation,
  applyBolaoVote,
  applyCategoryWinner,
  applyEventPatch,
  applyPersonalPick,
  buildSearchGamesPath,
  hasUnresolvedGameCovers,
  removePersonalPick,
  resolveCoversInBatches,
  searchGotyDemoCatalog,
  type GotyEventPatch,
} from '@/features/goty/goty-logic';
import { useAppInternal } from './app-provider';

// No React Native não há localStorage: o estado demo do GOTY vive só em memória
// e é reiniciado a cada nova sessão demo (ver useGotyState).
configureGotyDemoStorage(null);

type AppContext = ReturnType<typeof useAppInternal>;

const GOTY_MUTATION_KEY = ['goty-2026-mutation'] as const;

let liveGotyClient: GotyDataClient | undefined;
const demoGotyClient = new GotyDataClient(null);
let lastDemoEpoch: number | null = null;

function getGotyClient(isDemo: boolean): GotyDataClient {
  if (isDemo) return demoGotyClient;
  liveGotyClient ||= new GotyDataClient(getMobileSupabaseClient());
  return liveGotyClient;
}

function requireUser(userId: string | null): string {
  if (!userId) throw new Error('Entre na sua conta para continuar.');
  return userId;
}

function staleSessionError() {
  return new Error('Sua sessão mudou. Tente novamente.');
}

export function gotyQueryKey(sessionEpoch: number, userId: string | null, isDemo: boolean) {
  return ['goty-2026', sessionEpoch, userId, isDemo] as const;
}

async function readJson<T>(response: Response): Promise<Unvalidated<T> | null> {
  try {
    return await response.json() as Unvalidated<T>;
  } catch {
    return null;
  }
}

async function requestResolveCovers(limit: number): Promise<{ updated?: number; remaining?: number }> {
  const response = await getMobileApiTransport().request(apiRoutes.gotyResolveCovers.path, {
    method: apiRoutes.gotyResolveCovers.method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit } satisfies ApiRequestBody<'gotyResolveCovers'>),
  });
  const payload = await readJson<ApiResult<'gotyResolveCovers'>>(response);
  if (!response.ok) {
    const message = typeof payload?.error === 'string' ? payload.error : 'Não foi possível atualizar as capas.';
    throw new Error(message);
  }
  return {
    updated: typeof payload?.updated === 'number' ? payload.updated : 0,
    remaining: typeof payload?.remaining === 'number' ? payload.remaining : 0,
  };
}

/** Estado completo do GOTY 2026 (evento, categorias, palpites, Seu GOTY e perfis). */
export function useGotyState(): UseQueryResult<GotyFullState, Error> {
  const { ready, userId, isDemo, sessionEpoch, isSessionCurrent } = useAppInternal();
  const key = useMemo(() => gotyQueryKey(sessionEpoch, userId, isDemo), [isDemo, sessionEpoch, userId]);
  return useQuery<GotyFullState, Error>({
    queryKey: key,
    enabled: ready && Boolean(userId),
    staleTime: 20_000,
    queryFn: async () => {
      const epoch = sessionEpoch;
      if (!isSessionCurrent(epoch)) throw staleSessionError();
      if (isDemo && lastDemoEpoch !== epoch) {
        resetDemoGotyState();
        lastDemoEpoch = epoch;
      }
      const state = await getGotyClient(isDemo).readFullState({
        userId: requireUser(userId),
        isDemo,
        editionYear: GOTY_2026_EDITION_YEAR,
      });
      if (!isSessionCurrent(epoch)) throw staleSessionError();
      return state;
    },
  });
}

/**
 * Em produção, preenche em segundo plano (em lotes) as capas ausentes dos indicados
 * via POST /api/goty/resolve-covers — mesma estratégia de goty-experience.tsx.
 */
export function useGotyAutoResolveCovers(state: GotyFullState | undefined): void {
  const { isDemo, userId, sessionEpoch, isSessionCurrent, queryClient } = useAppInternal();
  const triggeredEpoch = useRef<number | null>(null);
  const needsCovers = Boolean(state && hasUnresolvedGameCovers(state));

  useEffect(() => {
    if (isDemo || !userId || !needsCovers || triggeredEpoch.current === sessionEpoch) return undefined;
    triggeredEpoch.current = sessionEpoch;
    let cancelled = false;
    const key = gotyQueryKey(sessionEpoch, userId, isDemo);
    void resolveCoversInBatches({
      limit: 20,
      requestBatch: requestResolveCovers,
      isCancelled: () => cancelled || !isSessionCurrent(sessionEpoch),
      onBatchUpdated: () => queryClient.invalidateQueries({ queryKey: key }),
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isDemo, isSessionCurrent, needsCovers, queryClient, sessionEpoch, userId]);
}

type OptimisticContext = { previous: GotyFullState | undefined; optimistic: GotyFullState | undefined };

function useOptimisticGotyMutation<TVariables, TResult>(
  apply: (state: GotyFullState, variables: TVariables, userId: string) => GotyFullState,
  run: (client: GotyDataClient, scope: { userId: string; isDemo: boolean }, variables: TVariables) => Promise<TResult>,
): UseMutationResult<TResult, Error, TVariables, OptimisticContext> {
  const context: AppContext = useAppInternal();
  const { queryClient, isSessionCurrent, sessionEpoch, userId, isDemo } = context;
  const key: QueryKey = gotyQueryKey(sessionEpoch, userId, isDemo);

  return useMutation<TResult, Error, TVariables, OptimisticContext>({
    mutationKey: GOTY_MUTATION_KEY,
    mutationFn: async variables => {
      if (!isSessionCurrent(sessionEpoch)) throw staleSessionError();
      const result = await run(getGotyClient(isDemo), { userId: requireUser(userId), isDemo }, variables);
      if (!isSessionCurrent(sessionEpoch)) throw staleSessionError();
      return result;
    },
    onMutate: async variables => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<GotyFullState>(key);
      const optimistic = previous && userId ? apply(previous, variables, userId) : undefined;
      if (optimistic) queryClient.setQueryData<GotyFullState>(key, optimistic);
      return { previous, optimistic };
    },
    onError: (_error, _variables, snapshot) => {
      if (!snapshot?.previous || !isSessionCurrent(sessionEpoch)) return;
      // Só desfaz se ninguém mexeu no cache depois deste palpite; caso contrário,
      // o refetch em onSettled traz a verdade do servidor sem apagar outras edições.
      if (queryClient.getQueryData(key) === snapshot.optimistic) {
        queryClient.setQueryData<GotyFullState>(key, snapshot.previous);
      }
    },
    onSettled: () => {
      if (!isSessionCurrent(sessionEpoch)) return;
      // Evita refetch intermediário enquanto ainda há outros palpites em voo.
      if (queryClient.isMutating({ mutationKey: GOTY_MUTATION_KEY }) > 1) return;
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useSelectBolaoVote() {
  return useOptimisticGotyMutation<{ categoryId: string; nomineeId: string }, unknown>(
    (state, { categoryId, nomineeId }, userId) => applyBolaoVote(state, userId, categoryId, nomineeId),
    (client, scope, { categoryId, nomineeId }) => client.saveBolaoVote({ ...scope, categoryId, nomineeId }),
  );
}

export function useSetBolaoConfirmation() {
  return useOptimisticGotyMutation<boolean, unknown>(
    (state, confirm, userId) => applyBolaoConfirmation(state, userId, confirm),
    (client, scope, confirm) => client.setBolaoConfirmation({ ...scope, confirm }),
  );
}

export function useSavePersonalPick() {
  return useOptimisticGotyMutation<{ categoryId: string; game: GotySearchGameResult }, unknown>(
    (state, { categoryId, game }, userId) => applyPersonalPick(state, userId, categoryId, game),
    (client, scope, { categoryId, game }) => client.savePersonalPick({ ...scope, categoryId, game }),
  );
}

export function useClearPersonalPick() {
  return useOptimisticGotyMutation<string, unknown>(
    (state, categoryId, userId) => removePersonalPick(state, userId, categoryId),
    (client, scope, categoryId) => client.clearPersonalPick({ ...scope, categoryId }),
  );
}

export function useUpdateGotyEvent() {
  return useOptimisticGotyMutation<GotyEventPatch, unknown>(
    (state, patch) => applyEventPatch(state, patch),
    (client, scope, patch) => client.updateEventSettings({ ...scope, ...patch }),
  );
}

export function useSetGotyCategoryWinner() {
  return useOptimisticGotyMutation<{ categoryId: string; winnerNomineeId: string | null }, unknown>(
    (state, { categoryId, winnerNomineeId }, userId) => applyCategoryWinner(state, userId, categoryId, winnerNomineeId),
    (client, scope, { categoryId, winnerNomineeId }) => client.setCategoryWinner({ ...scope, categoryId, winnerNomineeId }),
  );
}

export type SyncCoversResult = { demo: true } | { demo: false; updated: number };

/** Sincronização manual (Admin) das capas dos indicados via IGDB. */
export function useSyncGotyCovers(): UseMutationResult<SyncCoversResult, Error, void> {
  const { isDemo, userId, sessionEpoch, isSessionCurrent, queryClient } = useAppInternal();
  return useMutation<SyncCoversResult, Error, void>({
    mutationFn: async () => {
      if (isDemo) return { demo: true };
      if (!isSessionCurrent(sessionEpoch)) throw staleSessionError();
      const updated = await resolveCoversInBatches({
        limit: 25,
        requestBatch: requestResolveCovers,
        isCancelled: () => !isSessionCurrent(sessionEpoch),
      });
      return { demo: false, updated };
    },
    onSuccess: result => {
      if (result.demo || !isSessionCurrent(sessionEpoch)) return;
      void queryClient.invalidateQueries({ queryKey: gotyQueryKey(sessionEpoch, userId, isDemo) });
    },
  });
}

export interface GotyGameSearchResult {
  items: GotySearchGameResult[];
  /** Mensagem quando a API falhou e o catálogo curado foi usado como reserva. */
  fallbackError: string | null;
}

/** Busca de jogos para o Seu GOTY via GET /api/goty/search-games (catálogo curado no demo/erro). */
export function useGotyGameSearch(params: {
  query: string;
  includeAllYears: boolean;
  enabled: boolean;
}): UseQueryResult<GotyGameSearchResult, Error> {
  const { ready, userId, isDemo, sessionEpoch } = useAppInternal();
  const query = params.query.trim();
  return useQuery<GotyGameSearchResult, Error>({
    queryKey: ['goty-2026-search', sessionEpoch, userId, isDemo, query, params.includeAllYears],
    enabled: params.enabled && ready && Boolean(userId),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      if (isDemo) {
        return { items: searchGotyDemoCatalog(query, params.includeAllYears), fallbackError: null };
      }
      try {
        const response = await getMobileApiTransport().request(
          buildSearchGamesPath(query, params.includeAllYears),
          { signal },
        );
        const payload = await readJson<ApiResult<'gotySearchGames'>>(response);
        if (!response.ok) {
          throw new Error(typeof payload?.error === 'string' ? payload.error : 'Não foi possível buscar jogos de 2026.');
        }
        const items = Array.isArray(payload?.items) ? (payload.items as GotySearchGameResult[]) : [];
        return { items, fallbackError: null };
      } catch (error) {
        if (signal?.aborted) throw error;
        return {
          items: searchGotyDemoCatalog(query, params.includeAllYears),
          fallbackError: error instanceof Error ? error.message : 'Erro ao consultar catálogo de jogos.',
        };
      }
    },
  });
}
