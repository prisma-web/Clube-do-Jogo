import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppHeader } from '@/components/AppHeader';
import { Avatar } from '@/components/Avatar';
import { GameListRow } from '@/components/GameListRow';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { ProfileEditSheet } from '@/features/profile/ProfileEditSheet';
import { PlatformPicker } from '@/features/profile/PlatformPicker';
import { useApp } from '@/state/app-provider';
import { useProfile, useUpdateProfile } from '@/state/profile-queries';
import { formatShortDate } from '@/lib/format';
import { themedStyles, useThemeColors, radii, spacing, typography } from '@/theme';
import type { Game } from '@clube-do-jogo/domain';

const TABS = [
  { key: 'favorites', label: 'Favoritos', icon: 'heart-outline' as const },
  { key: 'backlog', label: 'Jogos', icon: 'library-outline' as const },
  { key: 'completed', label: 'Finalizados', icon: 'flag-outline' as const },
  { key: 'platforms', label: 'Consoles', icon: 'game-controller-outline' as const },
];
type TabKey = typeof TABS[number]['key'];

export default function ProfileScreen() {
  const colors = useThemeColors();
  const styles = useStyles();
  const router = useRouter();
  const { signOut } = useApp();
  const profileQuery = useProfile();
  const updateProfile = useUpdateProfile();
  const [editOpen, setEditOpen] = useState(false);
  const [platformsOpen, setPlatformsOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>('favorites');

  if (profileQuery.isLoading) {
    return (
      <Screen>
        <LoadingState label="Carregando perfil…" />
      </Screen>
    );
  }

  if (profileQuery.isError) {
    return (
      <Screen>
        <ErrorState message={profileQuery.error.message} onRetry={() => profileQuery.refetch()} />
      </Screen>
    );
  }

  const data = profileQuery.data;
  if (!data?.profile) {
    return (
      <Screen>
        <EmptyState icon="person-outline" title="Perfil não encontrado" description="Tente novamente em instantes." />
      </Screen>
    );
  }

  const person = data.profile;
  const counts: Record<TabKey, number> = {
    favorites: data.favorites.length,
    backlog: data.backlog.length,
    completed: data.completed.length,
    platforms: data.platforms.length,
  };

  function saveProfile(input: { name: string; bio: string; avatarUrl: string | null }) {
    updateProfile.mutate(
      {
        name: input.name.trim() || null,
        bio: input.bio.trim() || null,
        avatar_url: input.avatarUrl,
        avatar_crop: input.avatarUrl === person.avatar_url ? person.avatar_crop ?? null : null,
      },
      { onSuccess: () => setEditOpen(false) },
    );
  }

  function openGame(game: Game) {
    router.push({ pathname: '/(app)/jogos/[id]', params: { id: game.id } });
  }

  return (
    <Screen onRefresh={() => profileQuery.refetch()} refreshing={profileQuery.isRefetching}>
      <AppHeader
        title="Perfil"
        right={
          <Pressable
            onPress={() => router.push('/(app)/configuracoes')}
            accessibilityRole="button"
            accessibilityLabel="Abrir configurações"
            hitSlop={8}
          >
            <Ionicons name="settings-outline" size={20} color={colors.zinc300} />
          </Pressable>
        }
      />

      <View style={styles.hero}>
        <Pressable
          onPress={() => setEditOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Editar perfil"
          style={styles.editButton}
        >
          <Ionicons name="pencil" size={16} color={colors.violet300} />
        </Pressable>
        <Avatar uri={person.avatar_url} crop={person.avatar_crop} name={person.name} size={88} />
        <Text style={styles.name}>{person.name || 'Membro do clube'}</Text>
        {person.bio ? <Text style={styles.bio}>{person.bio}</Text> : null}
        {person.created_at ? <Text style={styles.since}>Desde {formatShortDate(person.created_at)}</Text> : null}
      </View>

      <View style={styles.tabsRow}>
        {TABS.map(item => {
          const active = tab === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setTab(item.key)}
              accessibilityRole="tab"
              accessibilityLabel={`${item.label}, ${counts[item.key]}`}
              accessibilityState={{ selected: active }}
              style={[styles.tabButton, active && styles.tabButtonActive]}
            >
              <Ionicons name={item.icon} size={16} color={active ? colors.violet300 : colors.zinc500} />
              <Text style={[styles.tabCount, active && styles.tabCountActive]}>{counts[item.key]}</Text>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {tab === 'platforms' ? (
        <View style={styles.section}>
          <Pressable
            onPress={() => setPlatformsOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Adicionar ou remover plataformas"
            style={styles.managePlatforms}
          >
            <Ionicons name="add-circle-outline" size={16} color={colors.violet300} />
            <Text style={styles.managePlatformsLabel}>Adicionar ou remover plataformas</Text>
          </Pressable>
          {data.platforms.length ? (
            <View style={styles.platformGrid}>
              {data.platforms.map(platform => (
                <View key={platform.igdb_platform_id} style={styles.platformCard}>
                  <Ionicons name="game-controller-outline" size={18} color={colors.violet300} />
                  <Text style={styles.platformName} numberOfLines={1}>{platform.name}</Text>
                  {platform.abbreviation ? <Text style={styles.platformAbbr}>{platform.abbreviation}</Text> : null}
                </View>
              ))}
            </View>
          ) : (
            <EmptyState icon="game-controller-outline" title="Nenhum console adicionado" />
          )}
        </View>
      ) : (
        <View style={styles.section}>
          {(tab === 'favorites' ? data.favorites : tab === 'backlog' ? data.backlog : data.completed).length ? (
            <View style={styles.list}>
              {(tab === 'favorites' ? data.favorites : tab === 'backlog' ? data.backlog : data.completed).map(game => (
                <GameListRow key={game.id} game={game} onPress={() => openGame(game)} />
              ))}
            </View>
          ) : (
            <EmptyState
              icon="game-controller-outline"
              title={tab === 'favorites' ? 'Nenhum jogo favorito' : tab === 'backlog' ? 'Nenhum jogo adicionado' : 'Nenhum jogo finalizado'}
            />
          )}
        </View>
      )}

      <Pressable
        onPress={() => router.push({ pathname: '/(app)/perfil/[id]', params: { id: person.id } })}
        accessibilityRole="button"
        accessibilityLabel="Ver perfil público"
        style={styles.menuRow}
      >
        <Ionicons name="eye-outline" size={18} color={colors.zinc300} />
        <Text style={styles.menuLabel}>Ver perfil público</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.zinc600} />
      </Pressable>

      <Pressable
        onPress={() => void signOut().catch(error => {
          Alert.alert('Não foi possível sair', error instanceof Error ? error.message : 'Tente novamente.');
        })}
        accessibilityRole="button"
        accessibilityLabel="Sair da conta"
        style={[styles.menuRow, styles.menuRowDanger]}
      >
        <Ionicons name="log-out-outline" size={18} color={colors.red300} />
        <Text style={[styles.menuLabel, styles.menuLabelDanger]}>Sair da conta</Text>
      </Pressable>

      {editOpen && <ProfileEditSheet
        visible={editOpen}
        profile={person}
        saving={updateProfile.isPending}
        error={updateProfile.error?.message}
        onClose={() => setEditOpen(false)}
        onSave={saveProfile}
      />}
      <PlatformPicker visible={platformsOpen} onClose={() => setPlatformsOpen(false)} />
    </Screen>
  );
}

const useStyles = themedStyles(colors => ({
  hero: {
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.xxl,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSoft,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  editButton: {
    position: 'absolute',
    right: spacing.md,
    top: spacing.md,
    width: 36,
    height: 36,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
  },
  name: { ...typography.h2, color: colors.foreground, marginTop: spacing.sm, textAlign: 'center' },
  bio: { ...typography.small, color: colors.zinc400, textAlign: 'center', maxWidth: 280 },
  since: { ...typography.tiny, color: colors.zinc600, marginTop: spacing.xs },
  tabsRow: { flexDirection: 'row', gap: spacing.xs, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surfaceSofter, padding: spacing.xs, marginBottom: spacing.lg },
  tabButton: { flex: 1, alignItems: 'center', gap: 2, borderRadius: radii.lg, paddingVertical: spacing.sm },
  tabButtonActive: { backgroundColor: 'rgba(139,92,246,0.12)' },
  tabCount: { fontSize: 13, fontWeight: '900', color: colors.zinc400 },
  tabCountActive: { color: colors.violet300 },
  tabLabel: { fontSize: 9, fontWeight: '800', color: colors.zinc600 },
  tabLabelActive: { color: colors.violet300 },
  section: { marginBottom: spacing.lg },
  list: { gap: spacing.sm },
  managePlatforms: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.md },
  managePlatformsLabel: { ...typography.small, color: colors.violet300, fontWeight: '800' },
  platformGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  platformCard: { width: '47%', gap: 4, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surfaceSofter, padding: spacing.md },
  platformName: { ...typography.small, color: colors.foreground, fontWeight: '800' },
  platformAbbr: { ...typography.tiny, color: colors.zinc500 },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSofter,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  menuLabel: { flex: 1, ...typography.small, color: colors.zinc300 },
  menuRowDanger: { borderColor: 'rgba(239,68,68,0.25)', backgroundColor: 'rgba(239,68,68,0.06)' },
  menuLabelDanger: { color: colors.red300 },
}));
