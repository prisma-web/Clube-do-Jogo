import { Share, Text, View, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { AppHeader } from '@/components/AppHeader';
import { Avatar } from '@/components/Avatar';
import { GameListRow } from '@/components/GameListRow';
import { EmptyState, ErrorState, LoadingState, Section } from '@/components/StateViews';
import { useApp } from '@/state/app-provider';
import { useProfile } from '@/state/profile-queries';
import { getCanonicalProfileUrl } from '@/features/media/canonical-url';
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

  async function shareProfile() {
    const url = getCanonicalProfileUrl(profileId);
    if (!url) return;
    try {
      await Share.share({ message: url, url });
    } catch {
      // usuário cancelou o compartilhamento
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

      <View style={styles.statsGrid}>
        <StatCard label="Favoritos" value={favorites.length} icon="heart-outline" />
        <StatCard label="Na biblioteca" value={backlog.length} icon="library-outline" />
        <StatCard label="Finalizados" value={completed.length} icon="flag-outline" />
      </View>

      {platforms.length ? (
        <Section title="Plataformas">
          <View style={styles.platformRow}>
            {platforms.map(platform => (
              <View key={platform.igdb_platform_id} style={styles.platformChip}>
                <Ionicons name="game-controller-outline" size={13} color={colors.violet300} />
                <Text style={styles.platformChipLabel} numberOfLines={1}>{platform.abbreviation || platform.name}</Text>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      <Section title="Favoritos">
        {favorites.length ? (
          <View style={styles.list}>
            {favorites.map(game => (
              <GameListRow
                key={game.id}
                game={game}
                onPress={() => router.push({ pathname: '/(app)/jogos/[id]', params: { id: game.id } })}
              />
            ))}
          </View>
        ) : (
          <EmptyState icon="heart-outline" title="Nenhum jogo favoritado ainda." />
        )}
      </Section>

      <Section title="Biblioteca">
        {backlog.length ? (
          <View style={styles.list}>
            {backlog.map(game => (
              <GameListRow
                key={game.id}
                game={game}
                onPress={() => router.push({ pathname: '/(app)/jogos/[id]', params: { id: game.id } })}
              />
            ))}
          </View>
        ) : (
          <EmptyState icon="library-outline" title="Nenhum jogo na biblioteca ainda." />
        )}
      </Section>

      <Section title="Finalizados">
        {completed.length ? (
          <View style={styles.list}>
            {completed.map(game => (
              <GameListRow
                key={game.id}
                game={game}
                onPress={() => router.push({ pathname: '/(app)/jogos/[id]', params: { id: game.id } })}
              />
            ))}
          </View>
        ) : (
          <EmptyState icon="flag-outline" title="Nenhum jogo finalizado ainda." />
        )}
      </Section>
    </Screen>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: keyof typeof Ionicons.glyphMap }) {
  const colors = useThemeColors();
  const styles = useStyles();
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={18} color={colors.violet300} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
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
  selfBadge: { marginTop: spacing.xs, borderRadius: radii.full, borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)', backgroundColor: 'rgba(139,92,246,0.12)', paddingHorizontal: spacing.sm, paddingVertical: 4 },
  selfBadgeLabel: { fontSize: 10, fontWeight: '800', color: colors.violet300, textTransform: 'uppercase' },
  statsGrid: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  statCard: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSofter,
    paddingVertical: spacing.lg,
  },
  statValue: { fontSize: 20, fontWeight: '900', color: colors.foreground },
  statLabel: { fontSize: 10, fontWeight: '700', color: colors.zinc500, textAlign: 'center' },
  platformRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  platformChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radii.full, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surfaceSofter, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  platformChipLabel: { fontSize: 11, fontWeight: '800', color: colors.zinc300 },
  list: { gap: spacing.sm },
}));
