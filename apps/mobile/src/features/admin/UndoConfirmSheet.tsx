import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ClubGameUndoPreview, ClubGameUndoResult } from '@clube-do-jogo/data';
import { formatMonth } from '@/lib/format';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { useUndoClubGameChange } from '@/state/admin-queries';
import { themedStyles, useThemeColors, radii, spacing, typography } from '@/theme';

const AFFECTED_LABELS: Array<{ key: 'comments' | 'reactions' | 'votes' | 'ranking_rows' | 'progress_snapshots' | 'note_snapshots' | 'reward_grants'; label: string }> = [
  { key: 'comments', label: 'Comentários' },
  { key: 'reactions', label: 'Reações' },
  { key: 'votes', label: 'Votos de indicação' },
  { key: 'ranking_rows', label: 'Linhas de ranking' },
  { key: 'progress_snapshots', label: 'Progressos salvos' },
  { key: 'note_snapshots', label: 'Anotações privadas' },
  { key: 'reward_grants', label: 'Recompensas concedidas' },
];

export function UndoConfirmSheet({ target, onClose, onUndone }: {
  target: { eventId: string; preview: ClubGameUndoPreview } | null;
  onClose: () => void;
  onUndone: (result: ClubGameUndoResult) => void;
}) {
  const colors = useThemeColors();
  const styles = useStyles();
  const [confirmDeletion, setConfirmDeletion] = useState(false);
  const undoChange = useUndoClubGameChange();

  if (!target) return null;
  const { preview } = target;
  const willDelete = preview.action === 'created';
  const affectedTotal = AFFECTED_LABELS.reduce((sum, item) => sum + preview[item.key], 0);
  const guardedClose = () => {
    if (undoChange.isPending) return;
    onClose();
  };

  return (
    <Sheet visible title="Desfazer decisão de ciclo" onClose={guardedClose}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.description}>
          {willDelete
            ? `O ciclo de ${formatMonth(preview.cycle_month)} será removido junto com tudo o que foi registrado nele.`
            : `O ciclo de ${formatMonth(preview.cycle_month)} voltará a ter o jogo anterior.`}
        </Text>

        {affectedTotal > 0 ? (
          <View style={styles.affectedCard}>
            <Text style={styles.affectedTitle}>Dados afetados</Text>
            {AFFECTED_LABELS.filter(item => preview[item.key] > 0).map(item => (
              <View key={item.key} style={styles.affectedRow}>
                <Text style={styles.affectedLabel}>{item.label}</Text>
                <Text style={styles.affectedCount}>{preview[item.key]}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.description}>Nenhum dado adicional foi registrado neste ciclo ainda.</Text>
        )}

        {willDelete ? (
          <Pressable
            onPress={() => setConfirmDeletion(current => !current)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: confirmDeletion }}
            accessibilityLabel="Confirmo que quero apagar permanentemente os dados deste ciclo"
            testID="admin-undo-confirm-deletion"
            style={styles.checkboxRow}
          >
            <View style={[styles.checkbox, confirmDeletion && styles.checkboxChecked]}>
              {confirmDeletion ? <Ionicons name="checkmark" size={14} color={colors.background} /> : null}
            </View>
            <Text style={styles.checkboxLabel}>
              Entendo que os dados listados acima serão apagados permanentemente.
            </Text>
          </Pressable>
        ) : null}

        {undoChange.isError ? (
          <Text style={styles.error} accessibilityRole="alert">{undoChange.error.message}</Text>
        ) : null}

        <View style={styles.actions}>
          <Button label="Cancelar" variant="secondary" disabled={undoChange.isPending} onPress={onClose} style={styles.actionButton} />
          <Button
            label="Desfazer"
            variant="danger"
            loading={undoChange.isPending}
            disabled={willDelete && !confirmDeletion}
            accessibilityLabel="Confirmar desfazer decisão de ciclo"
            style={styles.actionButton}
            onPress={() => undoChange.mutate(
              { preview, forceDelete: willDelete },
              { onSuccess: onUndone },
            )}
          />
        </View>
      </ScrollView>
    </Sheet>
  );
}

const useStyles = themedStyles(colors => ({
  body: { padding: spacing.lg, gap: spacing.md },
  description: { ...typography.small, color: colors.zinc300, lineHeight: 18 },
  affectedCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceDeep,
    padding: spacing.md,
    gap: spacing.xs,
  },
  affectedTitle: { ...typography.tiny, color: colors.zinc500, marginBottom: spacing.xs },
  affectedRow: { flexDirection: 'row', justifyContent: 'space-between' },
  affectedLabel: { ...typography.small, color: colors.zinc300, textTransform: 'none' },
  affectedCount: { ...typography.small, color: colors.foreground, fontWeight: '800' },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.zinc500,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: colors.red400, borderColor: colors.red400 },
  checkboxLabel: { flex: 1, ...typography.small, color: colors.zinc300, textTransform: 'none', lineHeight: 17 },
  error: { ...typography.small, color: colors.red300, lineHeight: 16 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  actionButton: { flex: 1 },
}));
