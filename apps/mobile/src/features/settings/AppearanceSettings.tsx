import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMobilePreferences } from '@/hooks/use-mobile-preferences';
import { useUnlockedThemeIds } from '@/state/reward-queries';
import { CosmicAmbienceSettings, ThemeSceneCard } from '@/features/themes';
import { radii, spacing, themedStyles, typography, useThemeColors } from '@/theme';
import { PreferencesPanel } from './PreferencesPanel';
import { ThemePicker } from './ThemePicker';

export function AppearanceSettings() {
  const colors = useThemeColors();
  const styles = useStyles();
  const preferences = useMobilePreferences();
  const unlockedThemeIds = useUnlockedThemeIds();

  return (
    <>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderText}>
            <Text style={styles.cardTitle}>Tema visual</Text>
            <Text style={styles.cardHint}>Salvo somente neste dispositivo.</Text>
          </View>
          {preferences.saving ? <ActivityIndicator size="small" color={colors.violet400} /> : null}
        </View>

        {preferences.error ? (
          <View style={styles.errorBanner} accessibilityRole="alert">
            <Ionicons name="alert-circle-outline" size={15} color={colors.red400} />
            <Text style={styles.errorText}>Não foi possível ler ou salvar suas preferências neste dispositivo.</Text>
            <Pressable
              onPress={preferences.retry}
              accessibilityRole="button"
              accessibilityLabel="Tentar carregar as preferências novamente"
              hitSlop={8}
              testID="settings-preferences-retry"
            >
              <Text style={styles.retryText}>Tentar de novo</Text>
            </Pressable>
          </View>
        ) : null}

        {preferences.loading ? (
          <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel="Carregando preferências">
            <ActivityIndicator size="small" color={colors.violet400} />
            <Text style={styles.loadingLabel}>Carregando preferências…</Text>
          </View>
        ) : (
          <ThemePicker
            value={preferences.themeId}
            unlockedThemeIds={unlockedThemeIds}
            saving={preferences.saving}
            onSelect={preferences.setThemeId}
          />
        )}
      </View>

      <ThemeSceneCard />

      {preferences.themeId === 'cosmic-campfire' ? <CosmicAmbienceSettings /> : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Movimento, som e notas</Text>
        <PreferencesPanel
          reduceMotion={preferences.reduceMotion}
          audioEnabled={preferences.audioEnabled}
          ratingScale={preferences.ratingScale}
          saving={preferences.saving || preferences.loading}
          onReduceMotion={preferences.setReduceMotion}
          onAudioEnabled={preferences.setAudioEnabled}
          onRatingScale={preferences.setRatingScale}
        />
      </View>
    </>
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
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardHeaderText: { flex: 1, gap: 2 },
  cardTitle: { ...typography.h3, color: colors.foreground },
  cardHint: { ...typography.small, color: colors.zinc500 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  loadingLabel: { ...typography.small, color: colors.zinc500 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.red600,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  errorText: { flex: 1, fontSize: 11, fontWeight: '600', color: colors.red300, lineHeight: 15 },
  retryText: { ...typography.small, fontWeight: '800', color: colors.violet300 },
}));
