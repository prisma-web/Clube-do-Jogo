import { Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radii, spacing, themedStyles, useThemeColors } from '@/theme';
import { formatMonth } from '@/lib/format';

export function MonthTrigger({ month, onPress }: { month: string; onPress: () => void }) {
  const colors = useThemeColors();
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Alterar ciclo, atual ${formatMonth(month)}`}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Ionicons name="calendar-outline" size={14} color={colors.zinc300} />
      <Text style={styles.label} numberOfLines={1}>{formatMonth(month, { includeYear: false })}</Text>
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
    maxWidth: 150,
  },
  pressed: { opacity: 0.8 },
  label: { fontSize: 11, fontWeight: '800', color: colors.zinc300, flexShrink: 1 },
}));
