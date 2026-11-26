import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/Avatar';
import { RatingValue } from '@/components/RatingValue';
import { StatusPill } from '@/components/StatusPill';
import { ErrorState, LoadingState } from '@/components/StateViews';
import { formatShortDate } from '@/lib/format';
import { themedStyles, useThemeColors, radii, spacing, typography } from '@/theme';
import type { GameProgress } from '@clube-do-jogo/domain';
import { summarizeClubProgress } from './club-progress';

export function ClubProgressCard({ progress, isLoading, error, onRetry, style }: {
  style?: StyleProp<ViewStyle>;
  progress: GameProgress[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  const colors = useThemeColors();
  const styles = useStyles();
  const { finishedCount, ratingCount, clubAverage } = summarizeClubProgress(progress);

  return (
    <View style={[styles.card, style]}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Progresso do clube</Text>
        <Text style={styles.finishedCount}>{finishedCount} {finishedCount === 1 ? 'finalizou' : 'finalizaram'}</Text>
      </View>
      <View style={styles.averageRow}>
        <View>
          <Text style={styles.averageLabel}>Média do clube</Text>
          <Text style={styles.averageHint}>
            {ratingCount ? `${ratingCount} ${ratingCount === 1 ? 'avaliação' : 'avaliações'}` : 'Ainda sem avaliações'}
          </Text>
        </View>
        {clubAverage !== null ? <RatingValue value={clubAverage} /> : null}
      </View>
      {isLoading ? (
        <LoadingState label="Carregando progresso do clube…" />
      ) : error ? (
        <ErrorState message={error.message} onRetry={onRetry} />
      ) : progress.length ? (
        <View style={styles.list}>
          {progress.map(item => (
            <View key={item.user_id} style={styles.memberRow}>
              <Avatar uri={item.profile?.avatar_url} crop={item.profile?.avatar_crop} name={item.profile?.name} size={36} />
              <View style={styles.memberInfo}>
                <View style={styles.memberNameRow}>
                  <Text style={styles.memberName} numberOfLines={1}>{item.profile?.name || 'Membro'}</Text>
                  {item.rating !== null ? <RatingValue value={Number(item.rating)} size={11} /> : null}
                </View>
                {item.started_at || item.finished_at ? (
                  <View style={styles.memberDates}>
                    {item.started_at ? (
                      <View style={styles.memberDateChip} accessibilityLabel={`Começou em ${formatShortDate(item.started_at)}`}>
                        <Ionicons name="time-outline" size={12} color={colors.sky400} />
                        <Text style={styles.memberDateText}>{formatShortDate(item.started_at)}</Text>
                      </View>
                    ) : null}
                    {item.finished_at ? (
                      <View style={styles.memberDateChip} accessibilityLabel={`Finalizou em ${formatShortDate(item.finished_at)}`}>
                        <Ionicons name="checkmark-done-outline" size={12} color={colors.emerald400} />
                        <Text style={styles.memberDateText}>{formatShortDate(item.finished_at)}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
              <StatusPill status={item.status} />
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.empty}>Ninguém registrou progresso ainda.</Text>
      )}
    </View>
  );
}

const useStyles = themedStyles((colors, { decor }) => ({
  card: { borderRadius: radii.xxl, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surfaceSofter, padding: spacing.lg, gap: spacing.md, marginBottom: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...typography.h3, color: colors.foreground },
  finishedCount: { fontSize: 10, fontWeight: '800', color: colors.zinc600, textTransform: 'uppercase' },
  averageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  averageLabel: { ...typography.small, color: colors.zinc400, fontWeight: '800' },
  averageHint: { fontSize: 10, color: colors.zinc600, marginTop: 2 },
  list: { gap: spacing.sm },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radii.md, backgroundColor: colors.surfaceDeep, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, ...(decor && { borderRadius: 0, backgroundColor: decor.panelDeep }) },
  memberInfo: { flex: 1, minWidth: 0, gap: 4 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  memberName: { ...typography.small, color: colors.zinc300, fontWeight: '800', flexShrink: 1 },
  memberDates: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  memberDateChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  memberDateText: { fontSize: 10, fontWeight: '700', color: colors.zinc500 },
  empty: { ...typography.small, color: colors.zinc600 },
}));
