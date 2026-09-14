import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getSelectableThemes, themes, type ThemeId } from '@clube-do-jogo/domain';
import { radii, spacing, themedStyles, typography, useThemeColors } from '@/theme';

export function ThemePicker({ value, unlockedThemeIds, saving, onSelect }: {
  value: ThemeId;
  unlockedThemeIds: readonly ThemeId[];
  saving: boolean;
  onSelect(themeId: ThemeId): void;
}) {
  const colors = useThemeColors();
  const styles = useStyles();
  const selectable = new Set(getSelectableThemes(unlockedThemeIds).map(theme => theme.id));

  return (
    <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel="Tema visual">
      {themes.map(theme => {
        const unlocked = selectable.has(theme.id);
        const selected = theme.id === value;
        return (
          <Pressable
            key={theme.id}
            onPress={() => onSelect(theme.id as ThemeId)}
            disabled={!unlocked || saving}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected, disabled: !unlocked || saving }}
            accessibilityLabel={theme.name}
            accessibilityHint={unlocked ? undefined : 'Disponível ao receber a recompensa correspondente'}
            style={[styles.option, selected && styles.optionSelected, !unlocked && styles.optionLocked]}
            testID={`settings-theme-${theme.id}`}
          >
            <View style={styles.swatches} accessible={false}>
              {theme.colors.map(color => (
                <View key={color} style={[styles.swatch, { backgroundColor: color }]} />
              ))}
            </View>
            <View style={styles.optionFooter}>
              <Text style={[styles.optionName, selected && styles.optionNameSelected]} numberOfLines={1}>
                {theme.name}
              </Text>
              {selected ? <Ionicons name="checkmark-circle" size={16} color={colors.violet400} /> : null}
              {!unlocked ? <Ionicons name="lock-closed" size={13} color={colors.zinc500} /> : null}
            </View>
            {!unlocked ? <Text style={styles.lockHint}>Recompensa do clube</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = themedStyles(colors => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 44,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSoft,
    padding: spacing.md,
    gap: spacing.sm,
  },
  optionSelected: { borderColor: colors.violet400, backgroundColor: colors.surface },
  optionLocked: { opacity: 0.55 },
  swatches: { flexDirection: 'row', gap: 5 },
  swatch: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: colors.hairlineSoft },
  optionFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  optionName: { ...typography.small, color: colors.zinc300, flexShrink: 1 },
  optionNameSelected: { color: colors.foreground, fontWeight: '800' },
  lockHint: { fontSize: 10, fontWeight: '700', color: colors.zinc500 },
}));
