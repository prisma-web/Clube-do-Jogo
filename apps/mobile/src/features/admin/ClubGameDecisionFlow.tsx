import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { ClubGameUndoPreview } from '@clube-do-jogo/data';
import { formatMonth, formatShortDate } from '@/lib/format';
import { Button } from '@/components/Button';
import { usePreviewClubGameUndo, useRedoClubGameChange } from '@/state/admin-queries';
import { themedStyles, radii, spacing, typography } from '@/theme';
import { UndoConfirmBody } from './UndoConfirmSheet';
import { canContinueUndoChain } from './club-undo-chain';
import { useRedoExpired } from './use-redo-expired';
import type { RecentDecision } from './use-persisted-club-decision';

type UndoTarget = { eventId: string; preview: ClubGameUndoPreview };

/**
 * Fluxo pós-decisão dentro do próprio sheet (paridade com as fases done/confirm-undo/undone do
 * club-game-admin-dialog da web): desfazer, refazer em até 5 min e continuar voltando pelos
 * ciclos anteriores. Cada transição é entregue a `onDecision`, que persiste a decisão para o
 * DecisionBanner de Configurações › Administração continuar em sincronia.
 */
export function ClubGameDecisionFlow({ decision, onDecision, onClose, onBusyChange }: {
  decision: RecentDecision;
  onDecision: (decision: RecentDecision) => void;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const styles = useStyles();
  const previewUndo = usePreviewClubGameUndo();
  const redoChange = useRedoClubGameChange();
  const [undoTarget, setUndoTarget] = useState<UndoTarget | null>(null);
  const [undoUnavailable, setUndoUnavailable] = useState(false);
  const [undoPending, setUndoPending] = useState(false);
  const redoExpiresAt = decision.kind === 'undone' ? decision.result.redoExpiresAt : undefined;
  const expired = useRedoExpired(redoExpiresAt);
  const busy = previewUndo.isPending || redoChange.isPending || undoPending;
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);

  const beginUndo = (eventId: string) => {
    setUndoUnavailable(false);
    previewUndo.mutate({ eventId }, {
      onSuccess: preview => {
        if (preview) setUndoTarget({ eventId, preview });
        else setUndoUnavailable(true);
      },
    });
  };

  if (undoTarget) {
    return (
      <UndoConfirmBody
        key={undoTarget.eventId}
        preview={undoTarget.preview}
        onCancel={() => setUndoTarget(null)}
        onPendingChange={setUndoPending}
        onUndone={result => {
          setUndoTarget(null);
          onDecision({ kind: 'undone', result });
        }}
      />
    );
  }

  const errorMessage = previewUndo.isError ? previewUndo.error.message
    : undoUnavailable ? 'Essa decisão não está mais disponível para desfazer.'
      : null;

  if (decision.kind === 'applied') {
    const { result } = decision;
    return (
      <ScrollView contentContainerStyle={styles.body} testID="admin-club-decision-flow">
        <View style={[styles.card, styles.cardApplied]}>
          <Text style={styles.cardText}>
            {result.outcome === 'reconciled'
              ? 'Essa decisão já havia sido aplicada por outra sessão.'
              : `Decisão aplicada: o jogo do ciclo de ${formatMonth(result.month)} foi definido. Você pode desfazê-la e, se necessário, continuar voltando pelos ciclos anteriores.`}
          </Text>
        </View>
        {errorMessage ? <Text style={styles.error} accessibilityRole="alert">{errorMessage}</Text> : null}
        <View style={styles.actions}>
          <Button label="Concluir" variant="secondary" disabled={busy} onPress={onClose} style={styles.actionButton} />
          {result.undoEventId ? (
            <Button
              label="Desfazer"
              variant="primary"
              loading={previewUndo.isPending}
              disabled={busy}
              accessibilityLabel="Desfazer decisão de ciclo"
              style={styles.actionButton}
              onPress={() => beginUndo(result.undoEventId as string)}
            />
          ) : null}
        </View>
      </ScrollView>
    );
  }

  const { result } = decision;
  const canRedo = Boolean(result.redoEventId) && !expired;
  const canContinueUndo = canContinueUndoChain(decision);
  return (
    <ScrollView contentContainerStyle={styles.body} testID="admin-club-decision-flow">
      <View style={[styles.card, styles.cardUndone]}>
        <Text style={styles.cardText}>
          {result.outcome === 'reconciled' ? 'Essa decisão já havia sido desfeita por outra sessão.' : 'Decisão desfeita.'}
          {canRedo
            ? ` Você tem 5 minutos para refazê-la (até ${formatShortDate(result.redoExpiresAt)}). Uma nova definição manual cancela essa possibilidade.`
            : ' O prazo para refazer essa decisão já passou.'}
        </Text>
      </View>
      {errorMessage ? <Text style={styles.error} accessibilityRole="alert">{errorMessage}</Text> : null}
      {redoChange.isError ? <Text style={styles.error} accessibilityRole="alert">{redoChange.error.message}</Text> : null}
      <View style={styles.actions}>
        {canRedo ? (
          <Button
            label="Refazer"
            variant="secondary"
            loading={redoChange.isPending}
            disabled={busy}
            accessibilityLabel="Refazer decisão de ciclo"
            style={styles.actionButton}
            onPress={() => redoChange.mutate({ eventId: result.redoEventId }, {
              onSuccess: redone => onDecision({ kind: 'applied', result: redone }),
            })}
          />
        ) : null}
        {canContinueUndo ? (
          <Button
            label="Continuar voltando"
            variant="primary"
            loading={previewUndo.isPending}
            disabled={busy}
            accessibilityLabel="Continuar voltando pelos ciclos anteriores"
            style={styles.actionButton}
            onPress={() => beginUndo(result.previousUndoEventId as string)}
          />
        ) : null}
      </View>
      <Button label="Concluir" variant="secondary" disabled={busy} onPress={onClose} />
    </ScrollView>
  );
}

const useStyles = themedStyles(colors => ({
  body: { padding: spacing.lg, gap: spacing.md },
  card: { borderRadius: radii.lg, borderWidth: 1, padding: spacing.md },
  cardApplied: { borderColor: 'rgba(52,211,153,0.2)', backgroundColor: 'rgba(16,185,129,0.06)' },
  cardUndone: { borderColor: 'rgba(56,189,248,0.2)', backgroundColor: 'rgba(14,165,233,0.06)' },
  cardText: { ...typography.small, color: colors.zinc300, textTransform: 'none', lineHeight: 18 },
  error: { ...typography.small, color: colors.red300, lineHeight: 16 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  actionButton: { flex: 1 },
}));
