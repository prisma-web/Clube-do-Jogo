import { useCallback, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/Button';
import { usePushNotifications } from '@/state/notification-bridge';
import { themedStyles, useThemeColors, radii, spacing, typography } from '@/theme';

export function NotificationSettings() {
  const colors = useThemeColors();
  const styles = useStyles();
  const { status, registered, remoteUnlinkPending, error, requestPermission, retry } = usePushNotifications();
  const [settingsError, setSettingsError] = useState('');

  const openSystemSettings = useCallback(() => {
    setSettingsError('');
    Linking.openSettings().catch(() => setSettingsError('Não foi possível abrir as configurações do sistema.'));
  }, []);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="notifications-outline" size={18} color={colors.violet300} />
        <Text style={styles.title}>Notificações push</Text>
      </View>

      {status === 'unavailable' ? (
        <Text style={styles.description}>
          Este aparelho ou versão do app ainda não aceita notificações push.
        </Text>
      ) : null}

      {status === 'not-requested' ? (
        <>
          <Text style={styles.description}>
            Ative para receber avisos de novidades do clube.
          </Text>
          <Button label="Ativar notificações" onPress={() => void requestPermission()} />
        </>
      ) : null}

      {status === 'enabling' ? (
        <>
          <Text style={styles.description}>Ativando notificações…</Text>
          <Button label="Ativando…" loading disabled onPress={() => undefined} />
        </>
      ) : null}

      {status === 'denied' ? (
        <>
          <Text style={styles.description}>
            A permissão de notificações foi negada. Ative nas configurações do sistema para receber avisos.
          </Text>
          <Button label="Abrir configurações do sistema" variant="secondary" onPress={openSystemSettings} />
          {settingsError ? <Text style={styles.error}>{settingsError}</Text> : null}
        </>
      ) : null}

      {status === 'enabled' ? (
        <Text style={styles.description}>
          {registered
            ? 'Notificações ativas. O registro deste aparelho foi confirmado pelo servidor.'
            : 'Permissão concedida. Confirmando o registro deste aparelho no servidor…'}
        </Text>
      ) : null}

      {status === 'error' ? (
        <>
          <Text style={styles.error}>{error || 'Não foi possível ativar as notificações.'}</Text>
          <Button label="Tentar novamente" variant="secondary" onPress={() => void retry()} />
        </>
      ) : null}

      {remoteUnlinkPending ? (
        <View style={styles.notice}>
          <Ionicons name="information-circle-outline" size={14} color={colors.amber300} />
          <Text style={styles.noticeText}>
            A desassociação deste aparelho de uma sessão anterior ainda não foi confirmada pelo servidor. Isso não significa que as notificações push pararam de chegar.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = themedStyles(colors => ({
  card: {
    gap: spacing.sm,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSofter,
    padding: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...typography.h3, color: colors.foreground },
  description: { ...typography.small, color: colors.zinc400, lineHeight: 16 },
  error: { ...typography.small, color: colors.red300 },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.2)',
    backgroundColor: 'rgba(251,191,36,0.06)',
    padding: spacing.sm,
  },
  noticeText: { flex: 1, ...typography.small, color: colors.amber200, lineHeight: 16 },
}));
