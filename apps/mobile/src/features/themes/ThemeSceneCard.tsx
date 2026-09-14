import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from 'expo-router';
import { radii, spacing, themedStyles, typography, useNativeTheme, useThemeColors } from '@/theme';
import { CosmicScene } from './scenes/CosmicScene';
import { CrossingScene } from './scenes/CrossingScene';
import { OriScene } from './scenes/OriScene';
import { useThemeScene } from './scene-context';
import type { CosmicSceneMode } from './audio';

const copy = {
  crossing: {
    title: 'A vila',
    description: 'Colinas, maré e uma árvore que responde ao toque.',
  },
  ori: {
    title: 'A floresta',
    description: 'Toque ou arraste para guiar a luz espiritual entre as raízes.',
  },
  cosmic: {
    title: 'O sistema solar',
    description: 'Alterne entre acampamento e travessia e consulte cada corpo celeste.',
  },
};

const modes: { id: CosmicSceneMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'hearth', label: 'Recanto', icon: 'flame-outline' },
  { id: 'spaceflight', label: 'Travessia', icon: 'planet-outline' },
];

export function ThemeSceneCard() {
  const theme = useNativeTheme();
  const colors = useThemeColors();
  const styles = useStyles();
  const { mode, setMode, audio } = useThemeScene();
  const focused = useIsFocused();

  if (theme.scene === 'none') return null;
  const text = copy[theme.scene];

  return (
    <View style={styles.card} testID="theme-scene-card">
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{text.title}</Text>
          <Text style={styles.description}>{text.description}</Text>
        </View>
        {theme.reduceMotion ? (
          <View style={styles.badge}>
            <Ionicons name="pause-outline" size={11} color={colors.zinc400} />
            <Text style={styles.badgeText}>Sem animação</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.stage}>
        {theme.scene === 'crossing' ? <CrossingScene interactive focused={focused} /> : null}
        {theme.scene === 'ori' ? <OriScene interactive focused={focused} /> : null}
        {theme.scene === 'cosmic' ? <CosmicScene interactive focused={focused} /> : null}
      </View>

      {theme.scene === 'cosmic' ? (
        <View style={styles.modeRow} accessibilityRole="radiogroup" accessibilityLabel="Plano de fundo da Fogueira Cósmica">
          {modes.map(option => {
            const active = option.id === mode;
            return (
              <Pressable
                key={option.id}
                onPress={() => setMode(option.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active, checked: active }}
                accessibilityLabel={option.label}
                style={[styles.modeButton, active && styles.modeButtonActive]}
                testID={`theme-scene-mode-${option.id}`}
              >
                <Ionicons name={option.icon} size={14} color={active ? colors.violet300 : colors.zinc400} />
                <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {audio.error ? (
        <View style={styles.audioError} accessibilityRole="alert">
          <Ionicons name="volume-mute-outline" size={14} color={colors.red400} />
          <Text style={styles.audioErrorText}>{audio.error}</Text>
          <Pressable
            onPress={audio.retry}
            accessibilityRole="button"
            accessibilityLabel="Tentar carregar o áudio novamente"
            hitSlop={8}
            testID="theme-audio-retry"
          >
            <Text style={styles.audioRetry}>Tentar de novo</Text>
          </Pressable>
        </View>
      ) : null}
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
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  headerText: { flex: 1, gap: 2 },
  title: { ...typography.h3, color: colors.foreground },
  description: { ...typography.small, color: colors.zinc500 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceSoft,
  },
  badgeText: { fontSize: 10, fontWeight: '800', color: colors.zinc400 },
  stage: {
    height: 220,
    borderRadius: radii.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.hairlineSoft,
  },
  modeRow: { flexDirection: 'row', gap: spacing.sm },
  modeButton: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSoft,
  },
  modeButtonActive: { borderColor: colors.violet400, backgroundColor: colors.surface },
  modeLabel: { ...typography.small, color: colors.zinc400 },
  modeLabelActive: { color: colors.violet300, fontWeight: '800' },
  audioError: {
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
  audioErrorText: { flex: 1, ...typography.tiny, color: colors.red300, lineHeight: 15, textTransform: 'none' as const },
  audioRetry: { ...typography.small, fontWeight: '800', color: colors.violet300 },
}));
