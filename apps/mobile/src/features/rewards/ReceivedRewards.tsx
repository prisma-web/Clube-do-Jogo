import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { themeIdFromReward, type RewardGrant, type ThemeId } from '@clube-do-jogo/domain';
import { useMobilePreferences } from '@/hooks/use-mobile-preferences';
import { useRewardGrants } from '@/state/reward-queries';
import { formatMonth, formatShortDate } from '@/lib/format';
import { radii, spacing, themedStyles, typography, useThemeColors } from '@/theme';

export function ReceivedRewards({ title = 'Recompensas recebidas' }: { title?: string }) {
  const colors = useThemeColors();
  const styles = useStyles();
  const grants = useRewardGrants();
  const preferences = useMobilePreferences();

  return (
    <View style={styles.card} testID="rewards-section">
      <Text style={styles.title}>{title}</Text>

      {grants.isPending ? (
        <View style={styles.state} accessibilityRole="progressbar" accessibilityLabel="Carregando recompensas">
          <ActivityIndicator size="small" color={colors.violet400} />
          <Text style={styles.stateLabel}>Carregando recompensas…</Text>
        </View>
      ) : null}

      {grants.isError ? (
        <View style={styles.errorBanner} accessibilityRole="alert">
          <Ionicons name="alert-circle-outline" size={15} color={colors.red400} />
          <Text style={styles.errorText}>Não foi possível carregar suas recompensas.</Text>
          <Pressable
            onPress={() => void grants.refetch()}
            accessibilityRole="button"
            accessibilityLabel="Tentar carregar as recompensas novamente"
            hitSlop={8}
            testID="rewards-retry"
          >
            <Text style={styles.retryText}>Tentar de novo</Text>
          </Pressable>
        </View>
      ) : null}

      {!grants.isPending && !grants.isError && (grants.data?.length ?? 0) === 0 ? (
        <Text style={styles.empty}>
          Nenhuma recompensa por enquanto. Termine o jogo do mês para receber a próxima.
        </Text>
      ) : null}

      {(grants.data ?? []).map(grant => (
        <RewardRow
          key={grant.id}
          grant={grant}
          currentThemeId={preferences.themeId}
          disabled={preferences.saving || preferences.loading}
          onUseTheme={preferences.setThemeId}
        />
      ))}
    </View>
  );
}

function RewardRow({ grant, currentThemeId, disabled, onUseTheme }: {
  grant: RewardGrant;
  currentThemeId: ThemeId;
  disabled: boolean;
  onUseTheme(themeId: ThemeId): void;
}) {
  const colors = useThemeColors();
  const styles = useStyles();
  const themeId = themeIdFromReward(grant.reward);
  const month = formatMonth(grant.reward.cycle?.month || grant.reward.club_month, { includeYear: false });
  const inUse = themeId !== null && themeId === currentThemeId;

  return (
    <View style={styles.row} testID={`reward-item-${grant.id}`}>
      <View style={styles.thumb}>
        {grant.reward.image_url ? (
          <Image source={{ uri: grant.reward.image_url }} style={styles.thumbImage} contentFit="contain" transition={180} />
        ) : (
          <Ionicons name="gift-outline" size={18} color={colors.violet300} />
        )}
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>{grant.reward.name}</Text>
        <Text style={styles.rowMeta}>
          Ciclo de {month} · recebida em {formatShortDate(grant.granted_at)}
        </Text>
      </View>
      {themeId ? (
        inUse ? (
          <View style={styles.inUse}>
            <Ionicons name="checkmark-circle" size={14} color={colors.emerald400} />
            <Text style={styles.inUseLabel}>Em uso</Text>
          </View>
        ) : (
          <Pressable
            onPress={() => onUseTheme(themeId)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`Usar o tema ${grant.reward.name}`}
            accessibilityState={{ disabled }}
            style={[styles.useButton, disabled && styles.useButtonDisabled]}
            testID={`reward-use-${themeId}`}
          >
            <Text style={styles.useLabel}>Usar tema</Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}

const useStyles = themedStyles(colors => ({
  card: {
    borderRadius: radii.xxl,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSofter,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  title: { ...typography.h3, color: colors.foreground },
  state: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  stateLabel: { ...typography.small, color: colors.zinc500 },
  empty: { ...typography.small, color: colors.zinc500, lineHeight: 18 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.red600,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  errorText: { flex: 1, fontSize: 11, fontWeight: '600', color: colors.red300, lineHeight: 15 },
  retryText: { ...typography.small, fontWeight: '800', color: colors.violet300 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
    overflow: 'hidden',
  },
  thumbImage: { width: 34, height: 34 },
  rowText: { flex: 1, gap: 2 },
  rowName: { ...typography.small, fontWeight: '800', color: colors.foreground },
  rowMeta: { fontSize: 11, fontWeight: '600', color: colors.zinc500 },
  useButton: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSoft,
  },
  useButtonDisabled: { opacity: 0.5 },
  useLabel: { fontSize: 11, fontWeight: '800', color: colors.violet300 },
  inUse: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  inUseLabel: { fontSize: 11, fontWeight: '800', color: colors.emerald400 },
}));
