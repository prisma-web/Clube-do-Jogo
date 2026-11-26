import { Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUiSignal } from '@/features/themes/scene-context';
import { controlTextStyle, decorInk, decorInkText, decorSquare, radii, spacing, themedStyles, useThemeColors, useThemeDecor } from '@/theme';

export function Chip({ label, icon, selected, onPress }: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  selected?: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const decor = useThemeDecor();
  const styles = useStyles();
  const playSignal = useUiSignal();
  return (
    <Pressable
      onPress={() => {
        playSignal('select');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: Boolean(selected) }}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      {icon ? <Ionicons name={icon} size={13} color={selected ? decor?.onInk ?? colors.violet300 : colors.zinc400} /> : null}
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = themedStyles((colors, { decor, button }) => ({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSofter,
    ...decorSquare(decor),
  },
  chipSelected: { borderColor: colors.violet400, backgroundColor: colors.surface, ...decorInk(decor) },
  label: { fontSize: 11, fontWeight: '700', color: colors.zinc400, ...controlTextStyle(button, 11) },
  labelSelected: { color: colors.violet300, ...decorInkText(decor) },
}));
