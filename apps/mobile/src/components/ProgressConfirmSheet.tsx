import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { radii, spacing, themedStyles, typography, useThemeColors } from '@/theme';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { useStatusMeta } from './StatusPill';
import { gameCoverUrl, type Game, type ProgressStatus } from '@clube-do-jogo/domain';

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

// Parity with src/components/game-dialog-preview.tsx: cover, title and duration.
function GamePreview({ game }: { game: Pick<Game, 'title' | 'image_url' | 'duration_hours'> }) {
  const colors = useThemeColors();
  const styles = useStyles();
  return (
    <View style={styles.preview}>
      <Image source={{ uri: gameCoverUrl(game.image_url) }} style={styles.previewCover} contentFit="cover" accessibilityLabel={`Capa de ${game.title}`} />
      <View style={styles.previewInfo}>
        <Text style={styles.previewTitle} numberOfLines={2}>{game.title}</Text>
        <View style={styles.previewMeta}>
          <Ionicons name="time-outline" size={12} color={colors.zinc500} />
          <Text style={styles.previewMetaText}>{game.duration_hours} h</Text>
        </View>
      </View>
    </View>
  );
}

export function ProgressConfirmSheet({ visible, game, currentStatus, targetStatus, onClose, onConfirm }: {
  visible: boolean;
  game?: Pick<Game, 'title' | 'image_url' | 'duration_hours'> | null;
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
        {game ? <GamePreview game={game} /> : null}
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
  preview: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  previewCover: { width: 60, height: 80, borderRadius: radii.lg, backgroundColor: colors.zinc900 },
  previewInfo: { flex: 1, minWidth: 0, gap: spacing.xs },
  previewTitle: { ...typography.small, fontWeight: '800', color: colors.foreground },
  previewMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  previewMetaText: { fontSize: 11, color: colors.zinc500 },
  message: { ...typography.small, color: colors.zinc400, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  actionButton: { flex: 1 },
}));
