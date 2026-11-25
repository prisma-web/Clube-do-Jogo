import { Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radii, spacing, themedStyles, useThemeColors } from '@/theme';
import { formatMonth } from '@/lib/format';
import { useApp } from '@/state/app-provider';

/**
 * Mirrors the web MonthSelector trigger (src/components/month-selector.tsx):
 * month and year, plus an amber history icon while a closed cycle is shown.
 * `isHistorical` defaults to the app-wide selection so existing call sites
 * keep working without passing it.
 */
export function MonthTrigger({ month, onPress, isHistorical }: { month: string; onPress: () => void; isHistorical?: boolean }) {
  const colors = useThemeColors();
  const styles = useStyles();
  const app = useApp();
  const historical = isHistorical ?? app.isHistorical;
  const label = formatMonth(month, { includeYear: true });
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Alterar ciclo, atual ${label}${historical ? ', ciclo encerrado' : ''}`}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Ionicons name="calendar-outline" size={14} color={colors.violet400} />
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      {historical ? <Ionicons name="time-outline" size={13} color={colors.amber400} testID="month-trigger-historical" /> : null}
      <Ionicons name="chevron-down" size={14} color={colors.zinc500} />
    </Pressable>
  );
}

const useStyles = themedStyles(colors => ({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSoft,
    maxWidth: 190,
  },
  pressed: { opacity: 0.8 },
  label: { fontSize: 11, fontWeight: '800', color: colors.zinc300, flexShrink: 1 },
}));
