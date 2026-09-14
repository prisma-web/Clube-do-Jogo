import {
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  Game,
  GameMugshot,
  Profile,
  ProfileWithGames,
  UserPlatform,
} from '@clube-do-jogo/domain';
import { normalizeAvatarCrop, shiftMonth } from '@clube-do-jogo/domain';
import type {
  ProfilePatch,
  UserPlatformInput,
} from '@clube-do-jogo/data';
import { useAppInternal } from './app-provider';

export type ProfileVariables = ProfilePatch;
export type PlatformVariables = UserPlatformInput;

function requireUser(userId: string | null) {
  if (!userId) throw new Error('Entre na sua conta para continuar.');
  return userId;
}

function profileKey(context: ReturnType<typeof useAppInternal>, profileId: string) {
  return ['profile', context.sessionEpoch, context.userId, profileId, shiftMonth(context.selectedMonth, 1), context.isDemo] as const;
}

function platformKey(context: ReturnType<typeof useAppInternal>, profileId: string) {
  return ['platforms', context.sessionEpoch, context.userId, profileId, context.isDemo] as const;
}

function normalizedProfilePatch(patch: ProfileVariables): ProfilePatch {
  const normalized: ProfilePatch = {};
  if (patch.name !== undefined) normalized.name = typeof patch.name === 'string' ? patch.name.trim() || null : patch.name;
  if (patch.bio !== undefined) normalized.bio = typeof patch.bio === 'string' ? patch.bio.trim() || null : patch.bio;
  if (patch.avatar_url !== undefined) normalized.avatar_url = typeof patch.avatar_url === 'string' ? patch.avatar_url.trim() || null : patch.avatar_url;
  if (patch.avatar_crop !== undefined) normalized.avatar_crop = patch.avatar_crop ? normalizeAvatarCrop(patch.avatar_crop) : null;
  return normalized;
}

function optimisticProfile(data: ProfileWithGames | undefined, patch: ProfileVariables): ProfileWithGames | undefined {
  if (!data?.profile) return data;
  return { ...data, profile: { ...data.profile, ...normalizedProfilePatch(patch) } };
}

function sortedPlatforms(items: UserPlatform[]) {
  return [...items].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
}

function optimisticProfilePlatforms(data: ProfileWithGames | undefined, platforms: UserPlatform[] | undefined) {
  return data && platforms ? { ...data, platforms: sortedPlatforms(platforms) } : data;
}

export function useProfile(profileId?: string): UseQueryResult<ProfileWithGames, Error> {
  const context = useAppInternal();
  const currentUserId = context.userId;
  const targetId = profileId || currentUserId;
  const key = profileKey(context, targetId || 'anonymous');
  return useQuery<ProfileWithGames, Error>({
    queryKey: key,
    enabled: context.ready && Boolean(currentUserId) && Boolean(targetId),
    queryFn: () => context.dataClient.readLibrary({
      userId: requireUser(currentUserId),
      profileId: requireUser(targetId),
      isDemo: context.isDemo,
      voteMonth: shiftMonth(context.selectedMonth, 1),
    }),
  });
}

type ProfileRollback = {
  previous?: ProfileWithGames;
  queryKey: ReturnType<typeof profileKey>;
};

export function useUpdateProfile(): UseMutationResult<Profile, Error, ProfileVariables, ProfileRollback> {
  const context = useAppInternal();
  const epoch = context.sessionEpoch;
  const userId = context.userId;
  const key = profileKey(context, userId || 'anonymous');
  return useMutation<Profile, Error, ProfileVariables, ProfileRollback>({
    mutationFn: patch => {
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      return context.dataClient.updateProfile({
        userId: requireUser(context.userId),
        isDemo: context.isDemo,
        patch,
      });
    },
    onMutate: async patch => {
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      await context.queryClient.cancelQueries({ queryKey: key });
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      const previous = context.queryClient.getQueryData<ProfileWithGames>(key);
      context.queryClient.setQueryData(key, optimisticProfile(previous, patch));
      return { previous, queryKey: key };
    },
    onSuccess: profile => {
      if (!context.isSessionCurrent(epoch)) return;
      context.queryClient.setQueryData<ProfileWithGames>(key, current => current ? { ...current, profile } : current);
    },
    onError: (_error, _patch, rollback) => {
      if (context.isSessionCurrent(epoch) && rollback?.previous) context.queryClient.setQueryData(rollback.queryKey, rollback.previous);
    },
    onSettled: (_profile, _error, _patch, rollback) => {
      if (!context.isSessionCurrent(epoch)) return;
      void context.queryClient.invalidateQueries({ queryKey: rollback?.queryKey || key });
      void context.queryClient.invalidateQueries({ queryKey: ['library', context.sessionEpoch] });
    },
  });
}

export function useUserPlatforms(profileId?: string): UseQueryResult<UserPlatform[], Error> {
  const context = useAppInternal();
  const currentUserId = context.userId;
  const targetId = profileId || currentUserId;
  const key = platformKey(context, targetId || 'anonymous');
  return useQuery<UserPlatform[], Error>({
    queryKey: key,
    enabled: context.ready && Boolean(currentUserId) && Boolean(targetId),
    queryFn: () => context.dataClient.readUserPlatforms(requireUser(targetId), context.isDemo),
  });
}

export function useSearchPlatforms(query: string): UseQueryResult<UserPlatform[], Error> {
  const context = useAppInternal();
  const currentUserId = context.userId;
  const normalized = query.trim();
  return useQuery<UserPlatform[], Error>({
    queryKey: ['platform-search', context.sessionEpoch, currentUserId, context.isDemo, normalized],
    enabled: context.ready && Boolean(currentUserId) && Boolean(normalized),
    queryFn: () => context.dataClient.searchPlatforms({
      userId: requireUser(currentUserId),
      isDemo: context.isDemo,
      query: normalized,
    }),
  });
}

type PlatformRollback = {
  previousPlatforms?: UserPlatform[];
  previousProfile?: ProfileWithGames;
  platformQueryKey: ReturnType<typeof platformKey>;
  profileQueryKey: ReturnType<typeof profileKey>;
};

export function useAddUserPlatform(): UseMutationResult<void, Error, PlatformVariables, PlatformRollback> {
  const context = useAppInternal();
  const epoch = context.sessionEpoch;
  const userId = context.userId;
  const platformQueryKey = platformKey(context, userId || 'anonymous');
  const profileQueryKey = profileKey(context, userId || 'anonymous');
  return useMutation<void, Error, PlatformVariables, PlatformRollback>({
    mutationFn: platform => {
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      return context.dataClient.setUserPlatform({ userId: requireUser(context.userId), isDemo: context.isDemo, platform });
    },
    onMutate: async platform => {
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      const currentUserId = requireUser(context.userId);
      await Promise.all([
        context.queryClient.cancelQueries({ queryKey: platformQueryKey }),
        context.queryClient.cancelQueries({ queryKey: profileQueryKey }),
      ]);
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      const previousPlatforms = context.queryClient.getQueryData<UserPlatform[]>(platformQueryKey);
      const previousProfile = context.queryClient.getQueryData<ProfileWithGames>(profileQueryKey);
      const nextPlatforms = previousPlatforms && !previousPlatforms.some(item => item.igdb_platform_id === platform.igdb_platform_id)
        ? sortedPlatforms([...previousPlatforms, { ...platform, user_id: currentUserId }])
        : previousPlatforms;
      context.queryClient.setQueryData(platformQueryKey, nextPlatforms);
      context.queryClient.setQueryData(profileQueryKey, optimisticProfilePlatforms(previousProfile, nextPlatforms));
      return { previousPlatforms, previousProfile, platformQueryKey, profileQueryKey };
    },
    onError: (_error, _platform, rollback) => {
      if (!context.isSessionCurrent(epoch)) return;
      if (rollback?.previousPlatforms) context.queryClient.setQueryData(rollback.platformQueryKey, rollback.previousPlatforms);
      if (rollback?.previousProfile) context.queryClient.setQueryData(rollback.profileQueryKey, rollback.previousProfile);
    },
    onSettled: (_data, _error, _platform, rollback) => {
      if (!context.isSessionCurrent(epoch)) return;
      void context.queryClient.invalidateQueries({ queryKey: rollback?.platformQueryKey || platformQueryKey });
      void context.queryClient.invalidateQueries({ queryKey: rollback?.profileQueryKey || profileQueryKey });
      void context.queryClient.invalidateQueries({ queryKey: ['library', context.sessionEpoch] });
    },
  });
}

export function useRemoveUserPlatform(): UseMutationResult<void, Error, { igdbPlatformId: number }, PlatformRollback> {
  const context = useAppInternal();
  const epoch = context.sessionEpoch;
  const userId = context.userId;
  const platformQueryKey = platformKey(context, userId || 'anonymous');
  const profileQueryKey = profileKey(context, userId || 'anonymous');
  return useMutation<void, Error, { igdbPlatformId: number }, PlatformRollback>({
    mutationFn: ({ igdbPlatformId }) => {
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      return context.dataClient.removeUserPlatform({ userId: requireUser(context.userId), isDemo: context.isDemo, igdbPlatformId });
    },
    onMutate: async ({ igdbPlatformId }) => {
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      requireUser(context.userId);
      await Promise.all([
        context.queryClient.cancelQueries({ queryKey: platformQueryKey }),
        context.queryClient.cancelQueries({ queryKey: profileQueryKey }),
      ]);
      if (!context.isSessionCurrent(epoch)) throw new Error('Sua sessão mudou. Tente novamente.');
      const previousPlatforms = context.queryClient.getQueryData<UserPlatform[]>(platformQueryKey);
      const previousProfile = context.queryClient.getQueryData<ProfileWithGames>(profileQueryKey);
      const nextPlatforms = previousPlatforms?.filter(item => item.igdb_platform_id !== igdbPlatformId);
      context.queryClient.setQueryData(platformQueryKey, nextPlatforms);
      context.queryClient.setQueryData(profileQueryKey, optimisticProfilePlatforms(previousProfile, nextPlatforms));
      return { previousPlatforms, previousProfile, platformQueryKey, profileQueryKey };
    },
    onError: (_error, _input, rollback) => {
      if (!context.isSessionCurrent(epoch)) return;
      if (rollback?.previousPlatforms) context.queryClient.setQueryData(rollback.platformQueryKey, rollback.previousPlatforms);
      if (rollback?.previousProfile) context.queryClient.setQueryData(rollback.profileQueryKey, rollback.previousProfile);
    },
    onSettled: (_data, _error, _input, rollback) => {
      if (!context.isSessionCurrent(epoch)) return;
      void context.queryClient.invalidateQueries({ queryKey: rollback?.platformQueryKey || platformQueryKey });
      void context.queryClient.invalidateQueries({ queryKey: rollback?.profileQueryKey || profileQueryKey });
      void context.queryClient.invalidateQueries({ queryKey: ['library', context.sessionEpoch] });
    },
  });
}

export function useGameMedia(gameId: string): UseQueryResult<Game | null, Error> {
  const context = useAppInternal();
  const userId = context.userId;
  return useQuery<Game | null, Error>({
    queryKey: ['game-media', context.sessionEpoch, userId, context.isDemo, gameId],
    enabled: context.ready && Boolean(userId) && Boolean(gameId),
    staleTime: 300_000,
    queryFn: () => context.dataClient.readGameMedia({ userId: requireUser(userId), isDemo: context.isDemo, gameId }),
  });
}

export function useGameMugshots(gameId: string): UseQueryResult<GameMugshot[], Error> {
  const context = useAppInternal();
  const userId = context.userId;
  return useQuery<GameMugshot[], Error>({
    queryKey: ['game-mugshots', context.sessionEpoch, userId, context.isDemo, gameId],
    enabled: context.ready && Boolean(userId) && Boolean(gameId),
    staleTime: 300_000,
    queryFn: () => context.dataClient.readGameMugshots({ userId: requireUser(userId), isDemo: context.isDemo, gameId }),
  });
}
