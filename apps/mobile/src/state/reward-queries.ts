import {
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import * as React from 'react';
import type { RewardGrant, ThemeId } from '@clube-do-jogo/domain';
import { unlockedThemeIds } from '@clube-do-jogo/domain';
import {
  createRewardsClient,
  type RewardsClient,
} from '@clube-do-jogo/data';
import { getMobileSupabaseClient } from '@/platform';
import { useAppInternal } from './app-provider';

type RewardsContext = ReturnType<typeof useAppInternal>;

let demoRewardsClient: RewardsClient | undefined;
let liveRewardsClient: RewardsClient | undefined;

function getRewardsClient(isDemo: boolean): RewardsClient {
  if (isDemo) {
    demoRewardsClient ||= createRewardsClient({ demo: true });
    return demoRewardsClient;
  }
  liveRewardsClient ||= createRewardsClient({ supabase: getMobileSupabaseClient() });
  return liveRewardsClient;
}

function rewardKey(sessionEpoch: number, userId: string | null, isDemo: boolean) {
  return ['rewards', sessionEpoch, userId, isDemo] as const;
}

export function rewardQueryKey(context: RewardsContext) {
  return rewardKey(context.sessionEpoch, context.userId, context.isDemo);
}

function requireUser(userId: string | null) {
  if (!userId) throw new Error('Entre na sua conta para continuar.');
  return userId;
}

function staleSessionError() {
  return new Error('Sua sessão mudou. Tente novamente.');
}

export function useRewardGrants(): UseQueryResult<RewardGrant[], Error> {
  const context = useAppInternal();
  const { isDemo, isSessionCurrent, queryClient, ready, sessionEpoch, userId } = context;
  const client = React.useMemo(() => getRewardsClient(isDemo), [isDemo]);
  const epoch = sessionEpoch;
  const key = React.useMemo(() => rewardKey(sessionEpoch, userId, isDemo), [isDemo, sessionEpoch, userId]);
  const query = useQuery<RewardGrant[], Error>({
    queryKey: key,
    enabled: ready && Boolean(userId),
    queryFn: async () => {
      if (!isSessionCurrent(epoch)) throw staleSessionError();
      const grants = await client.read({ userId: requireUser(userId), isDemo });
      if (!isSessionCurrent(epoch)) throw staleSessionError();
      return grants;
    },
  });
  React.useEffect(() => {
    if (!ready || !userId) return undefined;
    let active = true;
    const unsubscribe = client.subscribe({
      userId,
      isDemo,
      onEvent: () => {
        if (!active || !isSessionCurrent(epoch)) return;
        void queryClient.invalidateQueries({ queryKey: key });
      },
      onStatus: status => {
        if (active && status === 'SUBSCRIBED' && isSessionCurrent(epoch)) {
          void queryClient.invalidateQueries({ queryKey: key });
        }
      },
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [client, epoch, isDemo, isSessionCurrent, key, queryClient, ready, userId]);
  return query;
}

export function useAcknowledgeReward(): UseMutationResult<void, Error, string> {
  const context = useAppInternal();
  const { isDemo, isSessionCurrent, queryClient, sessionEpoch, userId } = context;
  const client = React.useMemo(() => getRewardsClient(isDemo), [isDemo]);
  const epoch = sessionEpoch;
  const key = React.useMemo(() => rewardKey(sessionEpoch, userId, isDemo), [isDemo, sessionEpoch, userId]);
  return useMutation<void, Error, string>({
    mutationFn: async grantId => {
      if (!isSessionCurrent(epoch)) throw staleSessionError();
      await client.acknowledge({ userId: requireUser(userId), isDemo, grantId });
      if (!isSessionCurrent(epoch)) throw staleSessionError();
    },
    onSuccess: (_value, grantId) => {
      if (!isSessionCurrent(epoch)) return;
      queryClient.setQueryData<RewardGrant[]>(key, current => current?.map(grant =>
        grant.id === grantId && !grant.seen_at
          ? { ...grant, seen_at: new Date().toISOString() }
          : grant,
      ));
    },
    onSettled: (_value, _error, grantId) => {
      if (!grantId || !isSessionCurrent(epoch)) return;
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useUnlockedThemeIds(): ThemeId[] {
  const grants = useRewardGrants();
  return React.useMemo(() => unlockedThemeIds(grants.data || []), [grants.data]);
}
