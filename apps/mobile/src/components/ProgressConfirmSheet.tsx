import { Text, View } from 'react-native';
import { spacing, themedStyles, typography } from '@/theme';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { useStatusMeta } from './StatusPill';
import type { ProgressStatus } from '@clube-do-jogo/domain';

function confirmationMessage(currentStatus: ProgressStatus, targetStatus: ProgressStatus): { message: string; destructive: boolean } {
  const destructive = targetStatus === 'not_started';
  const message = destructive
    ? 'A data de início, a data de fim e sua avaliação serão apagadas.'
    : currentStatus === 'finished' && targetStatus === 'started'
      ? 'A data de início será preservada. A data de finalização será removida.'
      : targetStatus === 'finished'
        ? 'A data de início existente será preservada.'
        : 'A data de início será registrada apenas se ainda não existir.';
  return { message, destructive };
}

export function ProgressConfirmSheet({ visible, currentStatus, targetStatus, onClose, onConfirm }: {
  visible: boolean;
  currentStatus: ProgressStatus;
  targetStatus: ProgressStatus;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const styles = useStyles();
  const statusMeta = useStatusMeta();
  const target = statusMeta[targetStatus];
  const { message, destructive } = confirmationMessage(currentStatus, targetStatus);

  return (
    <Sheet visible={visible} title={`Marcar como ${target.label}`} onClose={onClose}>
      <View style={styles.body}>
        <Text style={styles.message}>{message}</Text>
        <View style={styles.actions}>
          <Button label="Cancelar" variant="secondary" onPress={onClose} style={styles.actionButton} />
          <Button
            label="Confirmar"
            variant={destructive ? 'danger' : 'primary'}
            onPress={onConfirm}
            style={styles.actionButton}
          />
        </View>
      </View>
    </Sheet>
  );
}

const useStyles = themedStyles(colors => ({
  body: { padding: spacing.lg, gap: spacing.md },
  message: { ...typography.small, color: colors.zinc400, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  actionButton: { flex: 1 },
}));
