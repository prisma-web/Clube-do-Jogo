import type { ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radii, spacing, themedStyles, typography, useThemeColors } from '@/theme';

export function LoadingState({ label = 'Carregando…' }: { label?: string }) {
  const colors = useThemeColors();
  const styles = useStyles();
  return (
    <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={colors.violet400} size="large" />
      <Text style={styles.loadingLabel}>{label}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const colors = useThemeColors();
  const styles = useStyles();
  return (
    <View style={[styles.center, styles.box, styles.errorBox]} accessibilityRole="alert">
      <Ionicons name="alert-circle-outline" size={32} color={colors.red400} />
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? (
        <Text
          accessibilityRole="button"
          accessibilityLabel="Tentar novamente"
          onPress={onRetry}
          style={styles.retryText}
        >
          Tentar novamente
        </Text>
      ) : null}
    </View>
  );
}

export function EmptyState({ icon = 'sparkles-outline', title, description }: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
}) {
  const colors = useThemeColors();
  const styles = useStyles();
  return (
    <View style={[styles.center, styles.box]}>
      <Ionicons name={icon} size={32} color={colors.zinc600} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {description ? <Text style={styles.emptyDescription}>{description}</Text> : null}
    </View>
  );
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

const useStyles = themedStyles(colors => ({
  section: { gap: spacing.md, marginBottom: spacing.lg },
  sectionTitle: { ...typography.h3, color: colors.foreground },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.xxxl },
  box: {
    borderRadius: radii.xxl,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.hairline,
    paddingHorizontal: spacing.xl,
  },
  errorBox: { borderStyle: 'solid', borderColor: colors.red600, backgroundColor: colors.surfaceSoft },
  loadingLabel: { ...typography.small, color: colors.zinc500 },
  errorText: { ...typography.body, color: colors.red300, textAlign: 'center' },
  retryText: { ...typography.small, color: colors.violet300, fontWeight: '800', marginTop: spacing.xs },
  emptyTitle: { ...typography.h3, color: colors.zinc300, textAlign: 'center' },
  emptyDescription: { ...typography.small, color: colors.zinc500, textAlign: 'center', maxWidth: 280 },
}));
