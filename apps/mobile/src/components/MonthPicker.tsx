import { FlatList, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radii, spacing, themedStyles, typography, useThemeColors } from '@/theme';
import { formatMonth } from '@/lib/format';
import { Sheet } from './Sheet';

export function MonthPicker({ visible, months, selectedMonth, activeMonth, onSelect, onClose }: {
  visible: boolean;
  months: string[];
  selectedMonth: string;
  activeMonth: string;
  onSelect: (month: string) => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const styles = useStyles();
  return (
    <Sheet visible={visible} title="Ciclo do clube" onClose={onClose}>
      <FlatList
        data={months}
        keyExtractor={month => month}
        contentContainerStyle={styles.list}
        renderItem={({ item: month }) => {
          const selected = month === selectedMonth;
          return (
            <Pressable
              onPress={() => { onSelect(month); onClose(); }}
              accessibilityRole="button"
              accessibilityLabel={`Selecionar ${formatMonth(month)}`}
              accessibilityState={{ selected }}
              style={[styles.item, selected && styles.itemSelected]}
            >
              <View>
                <Text style={[styles.label, selected && styles.labelSelected]}>{formatMonth(month)}</Text>
                {month === activeMonth ? <Text style={styles.activeTag}>Ciclo atual</Text> : null}
              </View>
              {selected ? <Ionicons name="checkmark" size={18} color={colors.violet300} /> : null}
            </Pressable>
          );
        }}
      />
    </Sheet>
  );
}

const useStyles = themedStyles(colors => ({
  list: { padding: spacing.lg, gap: spacing.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: colors.surfaceSofter,
    marginBottom: spacing.sm,
  },
  itemSelected: { backgroundColor: colors.surface, borderColor: colors.violet400 },
  label: { ...typography.small, color: colors.zinc300, fontSize: 13 },
  labelSelected: { color: colors.violet300 },
  activeTag: { ...typography.tiny, color: colors.zinc600, marginTop: 2 },
}));
