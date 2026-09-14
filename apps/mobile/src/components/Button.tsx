import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { radii, spacing, themedStyles, typography, useThemeColors, type ThemeColors } from '@/theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

function spinnerColor(variant: Variant, colors: ThemeColors): string {
  if (variant === 'secondary' || variant === 'ghost') return colors.violet300;
  return variant === 'danger' ? colors.white : colors.primaryOn;
}

export function Button({ label, onPress, variant = 'primary', disabled, loading, icon, accessibilityLabel, style }: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  accessibilityLabel?: string;
  style?: object;
}) {
  const colors = useThemeColors();
  const styles = useStyles();
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled: isDisabled }}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor(variant, colors)} size="small" />
      ) : (
        <View style={styles.row}>
          {icon}
          <Text style={[styles.label, styles[`${variant}Label`]]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const useStyles = themedStyles(colors => ({
  base: {
    height: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { ...typography.small, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  primary: { backgroundColor: colors.violet600 },
  secondary: { backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.hairline },
  danger: { backgroundColor: colors.red600 },
  ghost: { backgroundColor: 'transparent' },
  primaryLabel: { color: colors.primaryOn },
  secondaryLabel: { color: colors.zinc300 },
  dangerLabel: { color: colors.white },
  ghostLabel: { color: colors.violet300 },
}));
