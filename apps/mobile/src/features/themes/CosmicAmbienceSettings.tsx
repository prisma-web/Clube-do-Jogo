import { Pressable, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radii, spacing, themedStyles, typography, useThemeColors } from '@/theme';
import { useThemeScene } from './scene-context';
import { useCosmicAmbiencePreference } from './cosmic-ambience-preference';

// Mirrors the web's ambience card (src/components/theme-selector.tsx:102-117): an on/off
// toggle independent of the communicator sound switch, plus an adjustable volume control.
const VOLUME_STEP = 0.1;

export function CosmicAmbienceSettings() {
  const colors = useThemeColors();
  const styles = useStyles();
  const { mode } = useThemeScene();
  const ambience = useCosmicAmbiencePreference();
  const label = mode === 'hearth' ? 'Fogueira ambiente' : 'Ambiente espacial';
  const hint = mode === 'hearth' ? 'Crepitar baixo e orgânico.' : 'Um vazio calmo e inquietante.';
  const percent = Math.round(ambience.volume * 100);

  function adjustVolume(delta: number) {
    ambience.setVolume(Math.min(1, Math.max(0, ambience.volume + delta)));
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.rowIcon}>
          <Ionicons name="bonfire-outline" size={16} color={colors.violet300} />
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>{label}</Text>
          <Text style={styles.rowHint}>{hint}</Text>
        </View>
        <Switch
          value={ambience.enabled}
          onValueChange={ambience.setEnabled}
          accessibilityLabel={label}
          accessibilityState={{ checked: ambience.enabled }}
          trackColor={{ false: colors.zinc700, true: colors.violet600 }}
          thumbColor={colors.white}
          testID="settings-ambience"
        />
      </View>

      <View style={styles.volumeRow}>
        <Pressable
          onPress={() => adjustVolume(-VOLUME_STEP)}
          disabled={percent <= 0}
          accessibilityRole="button"
          accessibilityLabel="Diminuir volume do som ambiente"
          hitSlop={8}
          style={[styles.volumeButton, percent <= 0 && styles.volumeButtonDisabled]}
          testID="settings-ambience-volume-down"
        >
          <Ionicons name="remove" size={16} color={colors.violet300} />
        </Pressable>
        <Text style={styles.volumeValue} accessibilityLabel={`Volume do som ambiente, ${percent} por cento`}>{percent}%</Text>
        <Pressable
          onPress={() => adjustVolume(VOLUME_STEP)}
          disabled={percent >= 100}
          accessibilityRole="button"
          accessibilityLabel="Aumentar volume do som ambiente"
          hitSlop={8}
          style={[styles.volumeButton, percent >= 100 && styles.volumeButtonDisabled]}
          testID="settings-ambience-volume-up"
        >
          <Ionicons name="add" size={16} color={colors.violet300} />
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = themedStyles(colors => ({
  card: {
    gap: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSoft,
    padding: spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSofter,
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { ...typography.small, fontWeight: '800', color: colors.foreground },
  rowHint: { fontSize: 11, fontWeight: '600', color: colors.zinc500, lineHeight: 15 },
  volumeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  volumeButton: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSofter,
  },
  volumeButtonDisabled: { opacity: 0.4 },
  volumeValue: { ...typography.small, fontWeight: '800', color: colors.zinc300, minWidth: 44, textAlign: 'center' },
}));
