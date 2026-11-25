import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { gameCoverUrl, ratingForScale, type Game } from '@clube-do-jogo/domain';
import { useRatingScale } from '@/hooks/use-rating-scale';
import { formatRatingValue } from '@/components/RatingValue';
import { radii, spacing, themedStyles, useThemeColors } from '@/theme';

export function FavoriteGameCard({ game, onPress }: { game: Game; onPress?: () => void }) {
  const colors = useThemeColors();
  const styles = useStyles();
  const [scale] = useRatingScale();
  const rating = game.average_rating != null ? ratingForScale(game.average_rating / 10, scale) : null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Ver detalhes de ${game.title}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2}>{game.title}</Text>
      </View>
      <View style={styles.coverWrap}>
        <Image source={{ uri: gameCoverUrl(game.image_url) }} style={styles.cover} contentFit="cover" accessibilityLabel={`Capa de ${game.title}`} />
        {rating !== null ? (
          <View
            style={styles.ratingBadge}
            accessible
            accessibilityLabel={`Nota ${formatRatingValue(rating)} de ${scale}`}
          >
            <Ionicons name="star" size={9} color={colors.amber300} />
            <Text style={styles.ratingText}>{formatRatingValue(rating)}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.footer}>
        <View style={styles.duration}>
          <Ionicons name="time-outline" size={11} color={colors.zinc500} />
          <Text style={styles.footerText}>{game.duration_hours} h</Text>
        </View>
        {game.release_year ? <Text style={styles.year}>{game.release_year}</Text> : null}
      </View>
    </Pressable>
  );
}

const useStyles = themedStyles(colors => ({
  card: {
    width: '31%',
    overflow: 'hidden',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSoft,
  },
  pressed: { opacity: 0.85 },
  header: { minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.sm, paddingVertical: 6 },
  title: { fontSize: 10, lineHeight: 13, fontWeight: '800', color: colors.foreground },
  coverWrap: { aspectRatio: 264 / 374, backgroundColor: colors.zinc900 },
  cover: { width: '100%', height: '100%' },
  ratingBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: radii.full,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  ratingText: { fontSize: 9, fontWeight: '800', color: colors.amber300 },
  footer: { minHeight: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  duration: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  footerText: { fontSize: 9, fontWeight: '700', color: colors.zinc500 },
  year: { fontSize: 9, fontWeight: '700', color: colors.zinc400 },
}));
