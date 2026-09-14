import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radii, spacing, themedStyles, useThemeColors } from '@/theme';
import type { VoteChoice } from '@clube-do-jogo/domain';

const options: Array<{ value: VoteChoice; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: 'would_not_play', label: 'Não', icon: 'thumbs-down' },
  { value: 'would_play', label: 'Jogaria', icon: 'thumbs-up' },
];

export function PreferenceButtons({ value, disabled, onChange }: {
  value: VoteChoice | null;
  disabled?: boolean;
  onChange: (choice: VoteChoice) => void;
}) {
  const colors = useThemeColors();
  const styles = useStyles();
  return (
    <View style={styles.row}>
      {options.map(option => {
        const active = value === option.value;
        return (
          <Pressable
            key={option.value}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: active, disabled }}
            style={({ pressed }) => [
              styles.button,
              active && (option.value === 'would_play' ? styles.activePlay : styles.activeSkip),
              disabled && styles.disabled,
              pressed && !disabled && styles.pressed,
            ]}
          >
            <Ionicons name={option.icon} size={15} color={active ? (option.value === 'would_play' ? colors.emerald300 : colors.red300) : colors.zinc400} />
            <Text style={[styles.label, active && (option.value === 'would_play' ? styles.activePlayLabel : styles.activeSkipLabel)]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = themedStyles(colors => ({
  row: { flexDirection: 'row', gap: spacing.sm },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceDeep,
  },
  label: { fontSize: 11, fontWeight: '800', color: colors.zinc400 },
  activePlay: { borderColor: colors.emerald400, backgroundColor: colors.surfaceSoft },
  activePlayLabel: { color: colors.emerald300 },
  activeSkip: { borderColor: colors.red400, backgroundColor: colors.surfaceSoft },
  activeSkipLabel: { color: colors.red300 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
}));
