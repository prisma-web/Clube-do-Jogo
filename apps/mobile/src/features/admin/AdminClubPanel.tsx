import { useEffect, useState } from 'react';
import { AppState, Image, Text, View } from 'react-native';
import type { ClubGameUndoPreview } from '@clube-do-jogo/data';
import { gameCoverUrl } from '@clube-do-jogo/domain';
import { formatMonth, formatShortDate } from '@/lib/format';
import { Button } from '@/components/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { useGameOfMonth } from '@/state/queries';
import { usePreviewClubGameUndo, useRedoClubGameChange } from '@/state/admin-queries';
import { useApp } from '@/state/app-provider';
import { themedStyles, radii, spacing, typography } from '@/theme';
import { ClubGameChangeSheet } from './ClubGameChangeSheet';
import { UndoConfirmSheet } from './UndoConfirmSheet';
import { usePersistedClubDecision, type RecentDecision } from './use-persisted-club-decision';
import { canContinueUndoChain } from './club-undo-chain';

type UndoTarget = { eventId: string; preview: ClubGameUndoPreview };

function useRedoExpired(redoExpiresAt: string | undefined): boolean {
  const deadline = redoExpiresAt ? new Date(redoExpiresAt).getTime() : NaN;
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    if (!Number.isFinite(deadline)) return undefined;
    const evaluate = () => setClock(Date.now());
    const timer = setTimeout(evaluate, Math.max(0, deadline - Date.now()));
    const subscription = AppState.addEventListener('change', status => {
      if (status === 'active') evaluate();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [deadline]);

  return !Number.isFinite(deadline) || clock >= deadline;
}

export function AdminClubPanel() {
  const styles = useStyles();
  const { activeMonth, userId, isDemo } = useApp();
  const gameOfMonthQuery = useGameOfMonth(activeMonth);
  const previewUndo = usePreviewClubGameUndo();
  const redoChange = useRedoClubGameChange();
  const [changeSheetOpen, setChangeSheetOpen] = useState(false);
  const [undoTarget, setUndoTarget] = useState<UndoTarget | null>(null);
  const [undoUnavailable, setUndoUnavailable] = useState(false);
  const { decision: recentDecision, setDecision: setRecentDecision, storageError, retry: retryStorage } = usePersistedClubDecision(userId, !isDemo);

  const bannerBusy = previewUndo.isPending || redoChange.isPending;

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Jogo do mês</Text>
        {gameOfMonthQuery.isLoading ? (
          <LoadingState label="Carregando ciclo atual…" />
        ) : gameOfMonthQuery.isError ? (
          <ErrorState message={gameOfMonthQuery.error.message} onRetry={() => void gameOfMonthQuery.refetch()} />
        ) : gameOfMonthQuery.data ? (
          <View style={styles.currentGameRow}>
            <Image source={{ uri: gameCoverUrl(gameOfMonthQuery.data.image_url) }} style={styles.currentGameCover} />
            <View style={styles.currentGameInfo}>
              <Text style={styles.currentGameTitle} numberOfLines={2}>{gameOfMonthQuery.data.title}</Text>
              <Text style={styles.currentGameMeta}>Ciclo de {formatMonth(activeMonth)}</Text>
            </View>
          </View>
        ) : (
          <EmptyState icon="game-controller-outline" title={`Nenhum jogo definido para ${formatMonth(activeMonth)}`} />
        )}

        <Button
          label="Escolher jogo do clube"
          variant="primary"
          accessibilityLabel="Escolher jogo do clube"
          onPress={() => setChangeSheetOpen(true)}
        />
      </View>

      {storageError ? (
        <View style={styles.storageErrorRow} testID="admin-club-storage-error">
          <Text style={styles.bannerError}>Não foi possível salvar a última decisão neste aparelho.</Text>
          <Button label="Tentar novamente" variant="ghost" onPress={retryStorage} />
        </View>
      ) : null}

      {recentDecision ? (
        <DecisionBanner
          decision={recentDecision}
          undoPending={previewUndo.isPending}
          undoError={previewUndo.isError ? previewUndo.error.message : undoUnavailable ? 'Essa decisão não está mais disponível para desfazer.' : null}
          redoError={redoChange.isError ? redoChange.error.message : null}
          redoPending={redoChange.isPending}
          dismissDisabled={bannerBusy}
          onUndo={eventId => {
            setUndoUnavailable(false);
            previewUndo.mutate({ eventId }, {
              onSuccess: preview => {
                if (preview) setUndoTarget({ eventId, preview });
                else setUndoUnavailable(true);
              },
            });
          }}
          onRedo={eventId => redoChange.mutate({ eventId }, {
            onSuccess: result => setRecentDecision({ kind: 'applied', result }),
          })}
          onDismiss={() => setRecentDecision(null)}
        />
      ) : null}

      {changeSheetOpen ? (
        <ClubGameChangeSheet
          visible
          onClose={() => setChangeSheetOpen(false)}
          onApplied={result => setRecentDecision({ kind: 'applied', result })}
        />
      ) : null}

      <UndoConfirmSheet
        key={undoTarget?.eventId || 'closed'}
        target={undoTarget}
        onClose={() => setUndoTarget(null)}
        onUndone={result => {
          setRecentDecision({ kind: 'undone', result });
          setUndoTarget(null);
        }}
      />
    </View>
  );
}

function DecisionBanner({ decision, undoPending, undoError, redoError, redoPending, dismissDisabled, onUndo, onRedo, onDismiss }: {
  decision: RecentDecision;
  undoPending: boolean;
  undoError: string | null;
  redoError: string | null;
  redoPending: boolean;
  dismissDisabled: boolean;
  onUndo: (eventId: string) => void;
  onRedo: (eventId: string) => void;
  onDismiss: () => void;
}) {
  const styles = useStyles();
  const redoExpiresAt = decision.kind === 'undone' ? decision.result.redoExpiresAt : undefined;
  const expired = useRedoExpired(redoExpiresAt);

  if (decision.kind === 'applied') {
    const { result } = decision;
    const canUndo = Boolean(result.undoEventId);
    return (
      <View style={styles.banner} testID="admin-club-decision-banner">
        <Text style={styles.bannerTitle}>
          {result.outcome === 'reconciled'
            ? 'Essa decisão já havia sido aplicada por outra sessão.'
            : `Jogo definido para o ciclo de ${formatMonth(result.month)}.`}
        </Text>
        {undoError ? <Text style={styles.bannerError} accessibilityRole="alert">{undoError}</Text> : null}
        <View style={styles.bannerActions}>
          {canUndo ? (
            <Button
              label="Desfazer"
              variant="ghost"
              loading={undoPending}
              accessibilityLabel="Desfazer decisão de ciclo"
              onPress={() => onUndo(result.undoEventId as string)}
            />
          ) : null}
          <Button label="Fechar" variant="ghost" disabled={dismissDisabled} onPress={onDismiss} />
        </View>
      </View>
    );
  }

  const { result } = decision;
  const canRedo = Boolean(result.redoEventId) && !expired;
  const canContinueUndo = canContinueUndoChain(decision);

  return (
    <View style={styles.banner} testID="admin-club-decision-banner">
      <Text style={styles.bannerTitle}>
        {result.outcome === 'reconciled' ? 'Essa decisão já havia sido desfeita por outra sessão.' : 'Decisão de ciclo desfeita.'}
      </Text>
      {canRedo ? (
        <Text style={styles.bannerSubtitle}>Você pode refazer até {formatShortDate(result.redoExpiresAt)}.</Text>
      ) : (
        <Text style={styles.bannerSubtitle}>O prazo para refazer essa decisão já passou.</Text>
      )}
      {undoError ? <Text style={styles.bannerError} accessibilityRole="alert">{undoError}</Text> : null}
      {redoError ? <Text style={styles.bannerError} accessibilityRole="alert">{redoError}</Text> : null}
      <View style={styles.bannerActions}>
        {canRedo ? (
          <Button
            label="Refazer"
            variant="ghost"
            loading={redoPending}
            accessibilityLabel="Refazer decisão de ciclo"
            onPress={() => onRedo(result.redoEventId as string)}
          />
        ) : null}
        {canContinueUndo ? (
          <Button
            label="Continuar voltando"
            variant="ghost"
            loading={undoPending}
            accessibilityLabel="Continuar voltando pelos ciclos anteriores"
            onPress={() => onUndo(result.previousUndoEventId as string)}
          />
        ) : null}
        <Button label="Fechar" variant="ghost" disabled={dismissDisabled} onPress={onDismiss} />
      </View>
    </View>
  );
}

const useStyles = themedStyles(colors => ({
  container: { gap: spacing.md },
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSofter,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardLabel: { ...typography.tiny, color: colors.zinc500 },
  currentGameRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  currentGameCover: { width: 52, height: 70, borderRadius: radii.sm, backgroundColor: colors.zinc900 },
  currentGameInfo: { flex: 1, gap: 4 },
  currentGameTitle: { ...typography.h3, color: colors.foreground },
  currentGameMeta: { ...typography.tiny, color: colors.zinc500, textTransform: 'none' },
  storageErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    backgroundColor: 'rgba(239,68,68,0.08)',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  banner: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
    backgroundColor: 'rgba(139,92,246,0.08)',
    padding: spacing.md,
    gap: spacing.sm,
  },
  bannerTitle: { ...typography.small, color: colors.foreground, fontWeight: '700', lineHeight: 18 },
  bannerSubtitle: { ...typography.tiny, color: colors.zinc400, textTransform: 'none' },
  bannerError: { ...typography.tiny, color: colors.red300, textTransform: 'none' },
  bannerActions: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' },
}));
