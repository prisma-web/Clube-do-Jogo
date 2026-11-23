import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radii, spacing, themedStyles, useThemeColors } from '@/theme';
import type { VoteChoice } from '@clube-do-jogo/domain';
import { voteChoiceOptions } from './vote-choice-options';

export function PreferenceButtons({ value, disabled, onChange }: {
  value: VoteChoice | null;
  disabled?: boolean;
  onChange: (choice: VoteChoice) => void;
}) {
  const colors = useThemeColors();
  const styles = useStyles();
  return (
    <View style={styles.row}>
      {voteChoiceOptions.map(option => {
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
              active && [styles.active, { borderColor: option.accent(colors) }],
              disabled && styles.disabled,
              pressed && !disabled && styles.pressed,
            ]}
          >
            <Ionicons name={option.icon} size={15} color={active ? option.selected(colors) : colors.zinc400} />
            <Text style={[styles.label, active && { color: option.selected(colors) }]}>{option.label}</Text>
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
  active: { backgroundColor: colors.surfaceSoft },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
}));
