import type { ReactNode } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { requestProductUpdateReopen } from '@/features/product-updates';
import { radii, spacing, themedStyles, typography, useNativeTheme, useThemeColors } from '@/theme';

const scales: (5 | 10)[] = [5, 10];

export function PreferencesPanel({
  reduceMotion,
  audioEnabled,
  ratingScale,
  saving,
  onReduceMotion,
  onAudioEnabled,
  onRatingScale,
}: {
  reduceMotion: boolean;
  audioEnabled: boolean;
  ratingScale: 5 | 10;
  saving: boolean;
  onReduceMotion(value: boolean): void;
  onAudioEnabled(value: boolean): void;
  onRatingScale(value: 5 | 10): void;
}) {
  const theme = useNativeTheme();
  const colors = useThemeColors();
  const styles = useStyles();

  const motionHint = theme.systemReduceMotion
    ? 'O sistema já pede menos movimento, então as animações seguem pausadas.'
    : 'Pausa as animações de fundo e as cenas dos temas.';
  const audioHint = theme.usesAudio
    ? 'Sinais em todos os controles interativos. O som para quando o app vai para segundo plano.'
    : 'O tema atual não usa som. A preferência fica guardada para os temas com trilha.';

  return (
    <View style={styles.panel}>
      <Row
        icon="pause-circle-outline"
        title="Reduzir movimento"
        hint={motionHint}
        control={
          <Switch
            value={reduceMotion}
            onValueChange={onReduceMotion}
            disabled={saving}
            accessibilityLabel="Reduzir movimento"
            accessibilityState={{ checked: reduceMotion, disabled: saving }}
            trackColor={{ false: colors.zinc700, true: colors.violet600 }}
            thumbColor={colors.white}
            testID="settings-reduce-motion"
          />
        }
        colors={colors}
        styles={styles}
      />

      <Row
        icon="radio-outline"
        title="Sons do comunicador"
        hint={audioHint}
        control={
          <Switch
            value={audioEnabled}
            onValueChange={onAudioEnabled}
            disabled={saving}
            accessibilityLabel="Som dos temas"
            accessibilityState={{ checked: audioEnabled, disabled: saving }}
            trackColor={{ false: colors.zinc700, true: colors.violet600 }}
            thumbColor={colors.white}
            testID="settings-audio"
          />
        }
        colors={colors}
        styles={styles}
      />

      <View style={styles.row}>
        <View style={styles.rowIcon}>
          <Ionicons name="star-outline" size={16} color={colors.violet300} />
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>Escala de avaliação</Text>
          <Text style={styles.rowHint}>Define como suas notas aparecem e são digitadas.</Text>
          <View style={styles.scaleRow} accessibilityRole="radiogroup" accessibilityLabel="Escala de avaliação">
            {scales.map(scale => {
              const active = scale === ratingScale;
              return (
                <Pressable
                  key={scale}
                  onPress={() => onRatingScale(scale)}
                  disabled={saving}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active, checked: active, disabled: saving }}
                  accessibilityLabel={`Notas de 0 a ${scale}`}
                  style={[styles.scaleButton, active && styles.scaleButtonActive]}
                  testID={`settings-rating-${scale}`}
                >
                  <Text style={[styles.scaleLabel, active && styles.scaleLabelActive]}>0–{scale}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <Pressable
        onPress={requestProductUpdateReopen}
        accessibilityRole="button"
        accessibilityLabel="Ver novamente as novidades da V1.1"
        style={styles.row}
        testID="settings-product-update-reopen"
      >
        <View style={styles.rowIcon}>
          <Ionicons name="megaphone-outline" size={16} color={colors.violet300} />
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>Novidades da V1.1</Text>
          <Text style={styles.rowHint}>Reveja as novidades desta versão.</Text>
        </View>
        <Text style={styles.reopenLabel}>Ver novamente</Text>
      </Pressable>
    </View>
  );
}

function Row({ icon, title, hint, control, colors, styles }: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  hint: string;
  control: ReactNode;
  colors: ReturnType<typeof useThemeColors>;
  styles: ReturnType<typeof useStyles>;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={16} color={colors.violet300} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowHint}>{hint}</Text>
      </View>
      {control}
    </View>
  );
}

const useStyles = themedStyles(colors => ({
  panel: { gap: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { ...typography.small, fontWeight: '800', color: colors.foreground },
  rowHint: { fontSize: 11, fontWeight: '600', color: colors.zinc500, lineHeight: 15 },
  scaleRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  scaleButton: {
    minHeight: 44,
    minWidth: 76,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSoft,
  },
  scaleButtonActive: { borderColor: colors.violet400, backgroundColor: colors.surface },
  scaleLabel: { ...typography.small, color: colors.zinc400 },
  scaleLabelActive: { color: colors.violet300, fontWeight: '800' },
  reopenLabel: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, color: colors.zinc600 },
}));
