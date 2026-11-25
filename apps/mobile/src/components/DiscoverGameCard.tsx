import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { gameCoverUrl, type DiscoverItem } from '@clube-do-jogo/domain';
import { radii, spacing, themedStyles, useThemeColors } from '@/theme';
import { RatingValue } from './RatingValue';

/** "Ana", "Ana +2": the web discover card's summary of who is playing. */
export function peopleSummary(people: readonly string[] | undefined): string | null {
  if (!people?.length) return null;
  return people.length > 1 ? `${people[0]} +${people.length - 1}` : people[0];
}

/** Poster card for Explorar, mirroring src/components/discover-game-card.tsx. */
export function DiscoverGameCard({ item, onOpen, onOptions }: {
  item: DiscoverItem;
  onOpen: () => void;
  onOptions: () => void;
}) {
  const colors = useThemeColors();
  const styles = useStyles();
  const { game } = item;
  const people = peopleSummary(item.people);
  return (
    <View style={styles.card}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`Ver detalhes de ${game.title}`}
        style={styles.header}
      >
        <Text style={styles.title} numberOfLines={1}>{game.title}</Text>
      </Pressable>

      <Pressable onPress={onOpen} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.poster}>
        <Image source={{ uri: gameCoverUrl(game.image_url) }} style={styles.cover} contentFit="cover" accessibilityLabel={`Capa de ${game.title}`} />
        <View style={styles.overlay} pointerEvents="none">
          {item.activityCount ? (
            <View style={styles.badge}>
              <Ionicons name="people-outline" size={11} color={colors.white} />
              <Text style={styles.badgeText}>{item.activityCount}</Text>
            </View>
          ) : <View />}
          {game.average_rating != null ? (
            <View style={styles.badge}>
              <RatingValue value={game.average_rating / 10} size={11} />
            </View>
          ) : null}
        </View>
      </Pressable>

      <View style={styles.footer}>
        <View style={styles.meta}>
          <Ionicons name="time-outline" size={11} color={colors.zinc500} />
          <Text style={styles.metaText}>{game.duration_hours} h</Text>
        </View>
        <Text style={[styles.metaText, styles.people]} numberOfLines={1}>{people ?? ''}</Text>
        {game.release_year ? <Text style={styles.year}>{game.release_year}</Text> : null}
      </View>

      <Pressable
        onPress={onOptions}
        accessibilityRole="button"
        accessibilityLabel={`Opções de ${game.title}`}
        hitSlop={8}
        style={styles.menu}
      >
        <Ionicons name="ellipsis-horizontal" size={14} color={colors.white} />
      </Pressable>
    </View>
  );
}

const useStyles = themedStyles(colors => ({
  card: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSofter,
  },
  header: { minHeight: 40, justifyContent: 'center', paddingLeft: spacing.sm, paddingRight: 40, paddingVertical: 6 },
  title: { fontSize: 11, fontWeight: '800', color: colors.foreground },
  poster: { aspectRatio: 264 / 374, backgroundColor: colors.zinc900 },
  cover: { width: '100%', height: '100%' },
  overlay: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.full,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  badgeText: { fontSize: 10, fontWeight: '800', color: colors.white },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 10, fontWeight: '700', color: colors.zinc500 },
  people: { flex: 1, minWidth: 0, textAlign: 'right' },
  year: { fontSize: 10, fontWeight: '700', color: colors.zinc400, fontVariant: ['tabular-nums'] },
  menu: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
