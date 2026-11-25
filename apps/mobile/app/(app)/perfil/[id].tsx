import { Share, Text, View, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Game } from '@clube-do-jogo/domain';
import { Screen } from '@/components/Screen';
import { AppHeader } from '@/components/AppHeader';
import { Avatar } from '@/components/Avatar';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { ProfileTabs } from '@/features/profile/ProfileTabs';
import { useApp } from '@/state/app-provider';
import { useProfile } from '@/state/profile-queries';
import { getCanonicalProfileUrl } from '@/features/media/canonical-url';
import { formatShortDate } from '@/lib/format';
import { themedStyles, useThemeColors, radii, spacing, typography } from '@/theme';

export default function MemberProfileScreen() {
  const colors = useThemeColors();
  const styles = useStyles();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const profileId = String(id);
  const { userId } = useApp();
  const isSelf = profileId === userId;
  const profileQuery = useProfile(profileId);

  if (profileQuery.isLoading) {
    return (
      <Screen edges={[]}>
        <LoadingState label="Carregando perfil…" />
      </Screen>
    );
  }

  if (profileQuery.isError) {
    return (
      <Screen edges={[]}>
        <ErrorState message={profileQuery.error.message} onRetry={() => profileQuery.refetch()} />
      </Screen>
    );
  }

  const data = profileQuery.data;
  if (!data?.profile) {
    return (
      <Screen edges={[]}>
        <EmptyState icon="person-outline" title="Perfil não encontrado" description="Esse membro pode não existir mais." />
      </Screen>
    );
  }

  const { profile, favorites, backlog, completed, platforms } = data;

  function openGame(game: Game) {
    router.push({ pathname: '/(app)/jogos/[id]', params: { id: game.id } });
  }

  async function shareProfile() {
    const url = getCanonicalProfileUrl(profileId);
    if (!url) return;
    try {
      await Share.share({ message: url, url });
    } catch {
    }
  }

  return (
    <Screen edges={[]} onRefresh={() => profileQuery.refetch()} refreshing={profileQuery.isRefetching}>
      <AppHeader
        title="Perfil"
        right={
          <Pressable
            onPress={shareProfile}
            accessibilityRole="button"
            accessibilityLabel="Compartilhar perfil"
            hitSlop={8}
          >
            <Ionicons name="share-outline" size={20} color={colors.zinc300} />
          </Pressable>
        }
      />

      <View style={styles.profileCard}>
        <Avatar uri={profile.avatar_url} crop={profile.avatar_crop} name={profile.name ?? 'Membro'} size={80} />
        <Text style={styles.name}>{profile.name ?? 'Membro'}</Text>
        {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
        {profile.created_at ? <Text style={styles.since}>Desde {formatShortDate(profile.created_at)}</Text> : null}
        {isSelf ? (
          <Pressable
            onPress={() => router.push('/(app)/(tabs)/perfil')}
            accessibilityRole="button"
            accessibilityLabel="Ir para o seu perfil"
            style={styles.selfBadge}
          >
            <Text style={styles.selfBadgeLabel}>Esse é você</Text>
          </Pressable>
        ) : null}
      </View>

      <ProfileTabs
        favorites={favorites}
        backlog={backlog}
        completed={completed}
        platforms={platforms}
        onOpenGame={openGame}
      />
    </Screen>
  );
}

const useStyles = themedStyles(colors => ({
  profileCard: {
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.xxl,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSoft,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  name: { ...typography.h2, color: colors.foreground, marginTop: spacing.sm },
  bio: { ...typography.small, color: colors.zinc400, textAlign: 'center', maxWidth: 280 },
  since: { ...typography.tiny, color: colors.zinc600, marginTop: spacing.xs },
  selfBadge: { marginTop: spacing.xs, borderRadius: radii.full, borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)', backgroundColor: 'rgba(139,92,246,0.12)', paddingHorizontal: spacing.sm, paddingVertical: 4 },
  selfBadgeLabel: { fontSize: 10, fontWeight: '800', color: colors.violet300, textTransform: 'uppercase' },
}));
