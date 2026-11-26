import { FlatList, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { decorInk, decorInkText, radii, spacing, themedStyles, typography, useThemeColors, useThemeDecor } from '@/theme';
import { formatMonth, shiftMonth } from '@/lib/format';
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
  const decor = useThemeDecor();
  const styles = useStyles();
  const historical = selectedMonth !== activeMonth;
  const footer = historical
    ? `${formatMonth(selectedMonth)} é um ciclo encerrado e permanece disponível para consulta.`
    : `Ciclo ativo. A votação atual ajuda a escolher o jogo de ${formatMonth(shiftMonth(selectedMonth, 1), { includeYear: false }).toLowerCase()}.`;
  return (
    <Sheet visible={visible} title="Ciclo do clube" onClose={onClose}>
      <FlatList
        data={months}
        keyExtractor={month => month}
        contentContainerStyle={styles.list}
        renderItem={({ item: month }) => {
          const selected = month === selectedMonth;
          const closed = month !== activeMonth;
          return (
            <Pressable
              onPress={() => { onSelect(month); onClose(); }}
              accessibilityRole="button"
              accessibilityLabel={`Selecionar ${formatMonth(month)}${closed ? ', ciclo encerrado' : ''}`}
              accessibilityState={{ selected }}
              style={[styles.item, selected && styles.itemSelected]}
            >
              <View>
                <Text style={[styles.label, selected && styles.labelSelected]}>{formatMonth(month)}</Text>
                {month === activeMonth ? <Text style={styles.activeTag}>Ciclo atual</Text> : null}
              </View>
              {selected ? (
                <Ionicons name="checkmark" size={18} color={decor?.onInk ?? colors.violet300} />
              ) : closed ? (
                <Ionicons name="time-outline" size={16} color={colors.zinc600} accessibilityLabel="Ciclo encerrado" />
              ) : null}
            </Pressable>
          );
        }}
        ListFooterComponent={
          <View style={styles.footer}>
            <Text style={styles.footerText}>{footer}</Text>
          </View>
        }
      />
    </Sheet>
  );
}

const useStyles = themedStyles((colors, { decor }) => ({
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
    ...(decor && { borderRadius: 0, backgroundColor: decor.panelDeep }),
  },
  itemSelected: { backgroundColor: colors.surface, borderColor: colors.violet400, ...decorInk(decor) },
  label: { ...typography.small, color: colors.zinc300, fontSize: 13 },
  labelSelected: { color: colors.violet300, ...decorInkText(decor) },
  footer: { borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: spacing.md, paddingHorizontal: spacing.xs },
  footerText: { fontSize: 11, lineHeight: 16, color: colors.zinc500 },
  activeTag: { ...typography.tiny, color: colors.zinc600, marginTop: 2 },
}));
