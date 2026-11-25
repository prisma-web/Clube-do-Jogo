import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Game, UserPlatform } from '@clube-do-jogo/domain';
import { GameListRow } from '@/components/GameListRow';
import { EmptyState } from '@/components/StateViews';
import { radii, spacing, themedStyles, useThemeColors } from '@/theme';
import { FavoriteGameCard } from './FavoriteGameCard';
import { PlatformCard } from './PlatformCard';

const TABS = [
  { key: 'favorites', label: 'Favoritos', icon: 'heart-outline' as const },
  { key: 'backlog', label: 'Biblioteca', icon: 'library-outline' as const },
  { key: 'completed', label: 'Finalizados', icon: 'flag-outline' as const },
  { key: 'platforms', label: 'Consoles', icon: 'game-controller-outline' as const },
];
type TabKey = typeof TABS[number]['key'];

const EMPTY_TITLES: Record<Exclude<TabKey, 'platforms'>, { icon: keyof typeof Ionicons.glyphMap; title: string }> = {
  favorites: { icon: 'heart-outline', title: 'Nenhum jogo favoritado ainda.' },
  backlog: { icon: 'library-outline', title: 'Nenhum jogo na biblioteca ainda.' },
  completed: { icon: 'flag-outline', title: 'Nenhum jogo finalizado ainda.' },
};

// Shared by the own profile and the public member profile: the four tabs with
// counts (Favoritos, Biblioteca, Finalizados, Consoles), as in src/components/profile-view.tsx.
export function ProfileTabs({ favorites, backlog, completed, platforms, onOpenGame, platformsHeader }: {
  favorites: Game[];
  backlog: Game[];
  completed: Game[];
  platforms: UserPlatform[];
  onOpenGame: (game: Game) => void;
  platformsHeader?: ReactNode;
}) {
  const colors = useThemeColors();
  const styles = useStyles();
  const [tab, setTab] = useState<TabKey>('favorites');
  const counts: Record<TabKey, number> = {
    favorites: favorites.length,
    backlog: backlog.length,
    completed: completed.length,
    platforms: platforms.length,
  };

  return (
    <>
      <View style={styles.tabsRow} accessibilityRole="tablist">
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
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]} numberOfLines={1}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.section}>
        {tab === 'platforms' ? (
          <>
            {platformsHeader}
            {platforms.length ? (
              <View style={styles.platformGrid}>
                {platforms.map(platform => <PlatformCard key={platform.igdb_platform_id} platform={platform} />)}
              </View>
            ) : (
              <EmptyState icon="game-controller-outline" title="Nenhum console adicionado" />
            )}
          </>
        ) : (() => {
          const games = tab === 'favorites' ? favorites : tab === 'backlog' ? backlog : completed;
          if (!games.length) return <EmptyState icon={EMPTY_TITLES[tab].icon} title={EMPTY_TITLES[tab].title} />;
          if (tab === 'favorites') {
            return (
              <View style={styles.posterGrid}>
                {games.map(game => <FavoriteGameCard key={game.id} game={game} onPress={() => onOpenGame(game)} />)}
              </View>
            );
          }
          return (
            <View style={styles.list}>
              {games.map(game => <GameListRow key={game.id} game={game} onPress={() => onOpenGame(game)} />)}
            </View>
          );
        })()}
      </View>
    </>
  );
}

const useStyles = themedStyles(colors => ({
  tabsRow: { flexDirection: 'row', gap: spacing.xs, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surfaceSofter, padding: spacing.xs, marginBottom: spacing.lg },
  tabButton: { flex: 1, alignItems: 'center', gap: 2, borderRadius: radii.lg, paddingVertical: spacing.sm },
  tabButtonActive: { backgroundColor: 'rgba(139,92,246,0.12)' },
  tabCount: { fontSize: 13, fontWeight: '900', color: colors.zinc400 },
  tabCountActive: { color: colors.violet300 },
  tabLabel: { fontSize: 9, fontWeight: '800', color: colors.zinc600 },
  tabLabelActive: { color: colors.violet300 },
  section: { marginBottom: spacing.lg },
  list: { gap: spacing.sm },
  posterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  platformGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.sm },
}));
