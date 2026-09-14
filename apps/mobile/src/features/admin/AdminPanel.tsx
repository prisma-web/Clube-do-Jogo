import { useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Chip } from '@/components/Chip';
import { Section } from '@/components/StateViews';
import { useAppInternal } from '@/state/app-provider';
import { themedStyles, useThemeColors, spacing, typography } from '@/theme';
import { AdminAccessPanel } from './AdminAccessPanel';
import { AdminClubPanel } from './AdminClubPanel';

type AdminTab = 'club' | 'access';

export function AdminPanel() {
  const colors = useThemeColors();
  const styles = useStyles();
  const [tab, setTab] = useState<AdminTab>('club');
  const { sessionEpoch } = useAppInternal();

  return (
    <View style={styles.container} testID="admin-panel">
      <View style={styles.header}>
        <Ionicons name="shield-checkmark" size={18} color={colors.violet300} />
        <Text style={styles.title}>Administração</Text>
      </View>

      <View style={styles.tabs}>
        <Chip label="Clube do jogo" selected={tab === 'club'} onPress={() => setTab('club')} />
        <Chip label="Cargos e acesso" selected={tab === 'access'} onPress={() => setTab('access')} />
      </View>

      <Section>
        {tab === 'club' ? <AdminClubPanel key={sessionEpoch} /> : <AdminAccessPanel />}
      </Section>
    </View>
  );
}

const useStyles = themedStyles(colors => ({
  container: { gap: spacing.md, marginBottom: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  title: { ...typography.h2, color: colors.foreground },
  tabs: { flexDirection: 'row', gap: spacing.sm },
}));
