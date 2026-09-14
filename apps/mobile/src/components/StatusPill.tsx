import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radii, spacing, themedStyles, useThemeColors, type ThemeColors } from '@/theme';
import type { ProgressStatus } from '@clube-do-jogo/domain';

type StatusMeta = Record<ProgressStatus, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }>;

function buildStatusMeta(colors: ThemeColors): StatusMeta {
  return {
    not_started: { label: 'Não iniciado', icon: 'ellipse-outline', color: colors.zinc500 },
    started: { label: 'Comecei', icon: 'play-circle-outline', color: colors.sky400 },
    finished: { label: 'Finalizado', icon: 'checkmark-circle', color: colors.emerald400 },
  };
}

export function useStatusMeta(): StatusMeta {
  return buildStatusMeta(useThemeColors());
}

export function StatusPill({ status }: { status: ProgressStatus }) {
  const styles = useStyles();
  const meta = useStatusMeta()[status];
  return (
    <View style={styles.row}>
      <Ionicons name={meta.icon} size={13} color={meta.color} />
      <Text style={[styles.label, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

const useStyles = themedStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radii.full },
  label: { fontSize: 11, fontWeight: '800' },
}));
