import { Alert, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { useApp } from '@/state/app-provider';
import { radii, spacing, themedStyles, typography, useThemeColors } from '@/theme';
import { AdminPanel } from '@/features/admin';
import { AppearanceSettings } from '@/features/settings';
import { ReceivedRewards } from '@/features/rewards';
import { NotificationSettings } from '@/features/notifications';

export default function SettingsScreen() {
  const { profile, userId, isDemo, isAdmin, signOut } = useApp();
  const colors = useThemeColors();
  const styles = useStyles();

  return (
    <Screen edges={[]}>
      <View style={styles.card}>
        <View style={styles.profileRow}>
          <Avatar uri={profile?.avatar_url ?? null} name={profile?.name ?? 'Membro'} size={56} />
          <View style={styles.profileInfo}>
            <Text style={styles.name}>{profile?.name ?? 'Membro'}</Text>
            {profile?.email ? <Text style={styles.email}>{profile.email}</Text> : null}
            {isDemo ? (
              <View style={styles.demoBadge}>
                <Ionicons name="flask-outline" size={11} color={colors.amber400} />
                <Text style={styles.demoBadgeText}>Modo demonstração</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Conta</Text>
        <InfoRow label="ID do membro" value={userId ?? '—'} />
      </View>

      <AppearanceSettings />

      <NotificationSettings />

      <ReceivedRewards />

      {isAdmin ? <AdminPanel key={userId ?? 'anonymous'} /> : null}

      <Button
        label="Sair da conta"
        variant="danger"
        icon={<Ionicons name="log-out-outline" size={16} color={colors.white} />}
        onPress={() => void signOut().catch(error => {
          Alert.alert('Não foi possível sair', error instanceof Error ? error.message : 'Tente novamente.');
        })}
        accessibilityLabel="Sair da conta"
      />
    </Screen>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const useStyles = themedStyles(colors => ({
  card: {
    borderRadius: radii.xxl,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSofter,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  profileInfo: { flex: 1, gap: 2 },
  name: { ...typography.h3, color: colors.foreground },
  email: { ...typography.small, color: colors.zinc500 },
  demoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radii.full, backgroundColor: 'rgba(251,191,36,0.12)' },
  demoBadgeText: { fontSize: 10, fontWeight: '800', color: colors.amber400 },
  cardTitle: { ...typography.h3, color: colors.foreground },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  infoLabel: { ...typography.small, color: colors.zinc500 },
  infoValue: { ...typography.small, color: colors.zinc300, flexShrink: 1, textAlign: 'right' },
}));
