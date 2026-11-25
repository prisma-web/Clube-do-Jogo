import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { ProductUpdateArtwork, ProductUpdateStep } from '@clube-do-jogo/domain';
import { radii, spacing, themedStyles, useThemeColors } from '@/theme';
import { productUpdateImage } from './product-update-images';

const POSTER_TONES = ['#4c1d95', '#9d174d', '#155e75', '#92400e'];

export function ProductUpdateVisual({ step }: { step: ProductUpdateStep }) {
  const styles = useStyles();
  const image = step.image ? productUpdateImage(step.image.src) : null;
  if (step.image && image) {
    return (
      <View style={[styles.frame, { aspectRatio: image.aspectRatio }]}>
        <Image
          source={image.source}
          style={styles.fill}
          contentFit="cover"
          contentPosition={step.image.position ?? 'center'}
          accessibilityLabel={step.image.alt}
        />
      </View>
    );
  }
  return <UpdateArtwork artwork={step.artwork ?? 'overview'} />;
}

function MiniPoster({ tone, rating }: { tone: string; rating: string }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={[styles.poster, { backgroundColor: tone }]}>
      <View style={styles.posterRating}>
        <Ionicons name="star" size={8} color={colors.amber300} />
        <Text style={styles.posterRatingText}>{rating}</Text>
      </View>
      <View style={styles.posterLines}>
        <View style={styles.posterLine} />
        <View style={[styles.posterLine, { width: '55%' }]} />
      </View>
    </View>
  );
}

function UpdateArtwork({ artwork }: { artwork: ProductUpdateArtwork }) {
  const styles = useStyles();
  const colors = useThemeColors();

  if (artwork === 'performance') {
    const rows = [
      { label: 'Ranking', icon: 'trophy-outline' as const, width: '82%' as const },
      { label: 'Explorar', icon: 'compass-outline' as const, width: '68%' as const },
      { label: 'Meus Jogos', icon: 'library-outline' as const, width: '91%' as const },
    ];
    return (
      <View style={[styles.frame, styles.artwork]} accessibilityLabel="Ilustração: Ranking, Explorar e Meus Jogos carregando mais rápido">
        {rows.map(row => (
          <View key={row.label} style={styles.perfCard}>
            <View style={styles.perfHeader}>
              <View style={styles.perfIcon}>
                <Ionicons name={row.icon} size={14} color={colors.violet300} />
              </View>
              <Text style={styles.perfLabel}>{row.label}</Text>
              <Ionicons name="checkmark-circle" size={14} color={colors.emerald400} style={styles.perfCheck} />
            </View>
            <View style={styles.perfTrack}>
              <View style={[styles.perfFill, { width: row.width }]} />
            </View>
          </View>
        ))}
        <View style={styles.pill}>
          <Ionicons name="flash" size={11} color={colors.violet300} />
          <Text style={styles.pillText}>Em evolução</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.frame, styles.artwork, styles.overview]} accessibilityLabel="Ilustração: novidades da V1.1 com Ranking e Explorar">
      <View style={[styles.overviewCard, styles.overviewLeft]}>
        <View style={styles.cardTitle}>
          <Ionicons name="trophy-outline" size={12} color={colors.violet300} />
          <Text style={styles.cardTitleText}>Ranking</Text>
        </View>
        <View style={styles.posterRow}>
          <MiniPoster tone={POSTER_TONES[0]} rating="9,1" />
          <MiniPoster tone={POSTER_TONES[1]} rating="8,7" />
        </View>
      </View>
      <View style={[styles.overviewCard, styles.overviewRight]}>
        <View style={styles.cardTitle}>
          <Ionicons name="compass-outline" size={12} color={colors.violet300} />
          <Text style={styles.cardTitleText}>Explorar</Text>
        </View>
        <View style={styles.posterRow}>
          <MiniPoster tone={POSTER_TONES[2]} rating="8,9" />
          <MiniPoster tone={POSTER_TONES[3]} rating="9,4" />
        </View>
      </View>
      <View style={[styles.pill, styles.versionPill]}>
        <Ionicons name="sparkles" size={11} color={colors.violet300} />
        <Text style={styles.pillText}>V1.1</Text>
      </View>
    </View>
  );
}

const useStyles = themedStyles(colors => ({
  frame: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceDeep,
  },
  fill: { width: '100%', height: '100%' },
  artwork: { minHeight: 220, padding: spacing.lg, justifyContent: 'center', gap: spacing.sm, borderColor: 'rgba(139,92,246,0.22)', backgroundColor: 'rgba(139,92,246,0.08)' },
  overview: { minHeight: 250, paddingVertical: spacing.xxl },
  overviewCard: { width: '62%', gap: spacing.sm, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, padding: spacing.sm },
  overviewLeft: { alignSelf: 'flex-start', transform: [{ rotate: '-3deg' }] },
  overviewRight: { alignSelf: 'flex-end', transform: [{ rotate: '3deg' }] },
  cardTitle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardTitleText: { fontSize: 10, fontWeight: '900', color: colors.violet300 },
  posterRow: { flexDirection: 'row', gap: spacing.sm },
  poster: { flex: 1, aspectRatio: 3 / 4, borderRadius: radii.sm, overflow: 'hidden', justifyContent: 'space-between', padding: 4 },
  posterRating: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: radii.full, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 4, paddingVertical: 2 },
  posterRatingText: { fontSize: 8, fontWeight: '900', color: colors.amber300 },
  posterLines: { gap: 3 },
  posterLine: { height: 3, width: '80%', borderRadius: radii.full, backgroundColor: 'rgba(255,255,255,0.55)' },
  pill: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radii.full, borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)', backgroundColor: 'rgba(139,92,246,0.14)', paddingHorizontal: spacing.md, paddingVertical: 5 },
  versionPill: { position: 'absolute', top: spacing.md, right: spacing.md },
  pillText: { fontSize: 9, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase', color: colors.violet300 },
  perfCard: { borderRadius: radii.lg, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, padding: spacing.md, gap: spacing.sm },
  perfHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  perfIcon: { width: 26, height: 26, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(139,92,246,0.15)' },
  perfLabel: { fontSize: 11, fontWeight: '900', color: colors.foreground },
  perfCheck: { marginLeft: 'auto' },
  perfTrack: { height: 6, borderRadius: radii.full, overflow: 'hidden', backgroundColor: colors.hairline },
  perfFill: { height: '100%', borderRadius: radii.full, backgroundColor: colors.violet500 },
}));
