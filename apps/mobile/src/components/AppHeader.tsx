import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { spacing, themedStyles, typography } from '@/theme';

export function AppHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <View style={styles.texts}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const useStyles = themedStyles(colors => ({
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.lg },
  texts: { flex: 1, minWidth: 0 },
  title: { ...typography.h1, color: colors.foreground },
  subtitle: { ...typography.small, color: colors.zinc500, marginTop: 4 },
}));
