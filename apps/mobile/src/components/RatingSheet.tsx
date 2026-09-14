import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ratingForScale, ratingFromScale, type RatingScale } from '@clube-do-jogo/domain';
import type { RatingCriterion, RatingDetails, RatingMode } from '@clube-do-jogo/domain';
import { radii, spacing, themedStyles, typography, useThemeColors } from '@/theme';
import { useRatingScale } from '@/hooks/use-rating-scale';
import { formatRatingValue } from './RatingValue';
import { Sheet } from './Sheet';
import { Chip } from './Chip';
import { Button } from './Button';

const detailCriteria: Array<{ key: RatingCriterion; label: string }> = [
  { key: 'graphics', label: 'Gráficos' },
  { key: 'gameplay', label: 'Gameplay' },
  { key: 'story', label: 'História' },
  { key: 'music', label: 'Música' },
  { key: 'fun', label: 'Diversão' },
];

function detailsFrom(details: RatingDetails | null | undefined, fallback: number): RatingDetails {
  return Object.fromEntries(detailCriteria.map(({ key }) => {
    const stored = details?.[key];
    if (stored === null) return [key, null];
    return [key, typeof stored === 'number' && Number.isFinite(stored) ? stored : fallback];
  })) as RatingDetails;
}

export function RatingSheet({
  visible,
  onClose,
  initialRating,
  initialMode,
  initialDetails,
  disabled = false,
  loading = false,
  error,
  onSave,
  onRemove,
}: {
  visible: boolean;
  onClose: () => void;
  initialRating: number | null;
  initialMode: RatingMode;
  initialDetails?: RatingDetails | null;
  disabled?: boolean;
  loading?: boolean;
  error?: string | null;
  onSave: (input: { rating: number; ratingMode: RatingMode; ratingDetails: RatingDetails | null }) => void;
  onRemove: () => void;
}) {
  const [scale, setScale] = useRatingScale();
  const colors = useThemeColors();
  const styles = useStyles();
  const fallback = initialRating ?? 5;
  const filledDetails = useMemo(() => detailsFrom(initialDetails, fallback), [initialDetails, fallback]);

  const [mode, setMode] = useState<RatingMode>(initialMode);
  const [simpleValue, setSimpleValue] = useState<number>(fallback);
  const [enabled, setEnabled] = useState<Record<RatingCriterion, boolean>>(() => (
    Object.fromEntries(detailCriteria.map(({ key }) => [key, filledDetails[key] !== null])) as Record<RatingCriterion, boolean>
  ));
  const [values, setValues] = useState<Record<RatingCriterion, number>>(() => (
    Object.fromEntries(detailCriteria.map(({ key }) => [key, filledDetails[key] ?? fallback])) as Record<RatingCriterion, number>
  ));

  const enabledCount = detailCriteria.filter(({ key }) => enabled[key]).length;
  const average = useMemo(() => {
    const included = detailCriteria.filter(({ key }) => enabled[key]).map(({ key }) => values[key]);
    if (!included.length) return 0;
    return included.reduce((total, value) => total + value, 0) / included.length;
  }, [enabled, values]);

  function toggleCriterion(key: RatingCriterion) {
    if (disabled || loading) return;
    if (enabled[key] && enabledCount <= 1) return;
    setEnabled(current => ({ ...current, [key]: !current[key] }));
  }

  function setCriterionValue(key: RatingCriterion, value: number) {
    setValues(current => ({ ...current, [key]: value }));
  }

  function handleSave() {
    if (disabled || loading) return;
    if (mode === 'simple') {
      onSave({ rating: simpleValue, ratingMode: 'simple', ratingDetails: null });
      return;
    }
    const ratingDetails = Object.fromEntries(
      detailCriteria.map(({ key }) => [key, enabled[key] ? values[key] : null]),
    ) as RatingDetails;
    onSave({ rating: average, ratingMode: 'detailed', ratingDetails });
  }

  function handleRemove() {
    if (disabled || loading) return;
    onRemove();
  }

  return (
    <Sheet visible={visible} title="Sua avaliação" onClose={onClose} avoidKeyboard>
      <ScrollView
        style={styles.bodyScroll}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {disabled ? <Text style={styles.readonlyNote}>O histórico é somente leitura.</Text> : null}

        <View style={styles.modeRow}>
          <Chip label="Escala 5" selected={scale === 5} onPress={() => !loading && setScale(5)} />
          <Chip label="Escala 10" selected={scale === 10} onPress={() => !loading && setScale(10)} />
        </View>

        <View style={styles.modeRow}>
          <Chip label="Simples" selected={mode === 'simple'} onPress={() => !disabled && !loading && setMode('simple')} />
          <Chip label="Detalhada" selected={mode === 'detailed'} onPress={() => !disabled && !loading && setMode('detailed')} />
        </View>

        {mode === 'simple' ? (
          <View style={styles.block}>
            <Text style={styles.fieldLabel}>Nota geral</Text>
            <RatingStepper
              key={scale}
              value={simpleValue}
              scale={scale}
              disabled={disabled || loading}
              onChange={setSimpleValue}
              testID="rating-overall"
              accessibilityLabel="Nota geral"
            />
          </View>
        ) : (
          <View style={styles.block}>
            <View style={styles.averageRow}>
              <Text style={styles.fieldLabel}>Média</Text>
              <Text style={styles.averageValue}>{formatRatingValue(ratingForScale(average, scale))} / {scale}</Text>
            </View>
            {detailCriteria.map(({ key, label }) => {
              const isEnabled = enabled[key];
              const toggleDisabled = disabled || loading || (isEnabled && enabledCount <= 1);
              return (
                <View key={key} style={styles.criterionRow}>
                  <View style={styles.criterionHeader}>
                    <Text style={[styles.criterionLabel, !isEnabled && styles.criterionLabelDisabled]}>{label}</Text>
                    <Pressable
                      onPress={() => toggleCriterion(key)}
                      disabled={toggleDisabled}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isEnabled, disabled: toggleDisabled }}
                      accessibilityLabel={`Incluir ${label} na média`}
                      hitSlop={8}
                    >
                      <Ionicons name={isEnabled ? 'checkbox' : 'square-outline'} size={20} color={isEnabled ? colors.violet300 : colors.zinc600} />
                    </Pressable>
                  </View>
                  <RatingStepper
                    key={scale}
                    value={values[key]}
                    scale={scale}
                    disabled={disabled || loading || !isEnabled}
                    onChange={value => setCriterionValue(key, value)}
                    testID={`rating-${key}`}
                    accessibilityLabel={`Nota de ${label}`}
                  />
                </View>
              );
            })}
          </View>
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

      </ScrollView>
      {!disabled ? (
        <View style={styles.footer}>
          <View style={styles.actions}>
            <Button label="Cancelar" variant="secondary" onPress={onClose} disabled={loading} style={styles.actionButton} />
            <Button label="Salvar" variant="primary" onPress={handleSave} loading={loading} style={styles.actionButton} />
          </View>
          {initialRating !== null ? (
            <Button label="Remover nota" variant="ghost" onPress={handleRemove} disabled={loading} />
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}

function RatingStepper({ value, scale, disabled, onChange, accessibilityLabel, testID }: {
  value: number;
  scale: RatingScale;
  disabled?: boolean;
  onChange: (value: number) => void;
  accessibilityLabel: string;
  testID: string;
}) {
  const colors = useThemeColors();
  const styles = useStyles();
  const max = scale;
  const step = 0.5;
  const shown = ratingForScale(value, scale);
  const [draft, setDraft] = useState<string | null>(null);

  function commitShown(nextShown: number) {
    const clamped = Math.min(max, Math.max(0, nextShown));
    onChange(ratingFromScale(clamped, scale));
  }

  function submitDraft() {
    const parsed = Number((draft ?? String(shown)).replace(',', '.'));
    if (Number.isFinite(parsed)) commitShown(parsed);
    setDraft(null);
  }

  function handleChangeText(text: string) {
    setDraft(text);
    const trimmed = text.trim();
    if (!trimmed) return;
    const parsed = Number(trimmed.replace(',', '.'));
    if (Number.isFinite(parsed)) commitShown(parsed);
  }

  return (
    <View style={styles.stepperRow}>
      <Pressable
        disabled={disabled}
        onPress={() => { setDraft(null); commitShown(shown - step); }}
        accessibilityRole="button"
        accessibilityLabel={`Diminuir ${accessibilityLabel}`}
        style={({ pressed }) => [styles.stepButton, disabled && styles.stepButtonDisabled, pressed && !disabled && styles.stepButtonPressed]}
      >
        <Ionicons name="remove" size={16} color={disabled ? colors.zinc700 : colors.violet300} />
      </Pressable>
      <TextInput
        testID={testID}
        value={draft ?? formatRatingValue(shown)}
        editable={!disabled}
        onChangeText={handleChangeText}
        onBlur={submitDraft}
        onSubmitEditing={submitDraft}
        keyboardType="decimal-pad"
        selectTextOnFocus
        accessibilityLabel={accessibilityLabel}
        style={[styles.stepperInput, disabled && styles.stepperInputDisabled]}
      />
      <Text style={styles.stepperMax}>/ {max}</Text>
      <Pressable
        disabled={disabled}
        onPress={() => { setDraft(null); commitShown(shown + step); }}
        accessibilityRole="button"
        accessibilityLabel={`Aumentar ${accessibilityLabel}`}
        style={({ pressed }) => [styles.stepButton, disabled && styles.stepButtonDisabled, pressed && !disabled && styles.stepButtonPressed]}
      >
        <Ionicons name="add" size={16} color={disabled ? colors.zinc700 : colors.violet300} />
      </Pressable>
    </View>
  );
}

const useStyles = themedStyles(colors => ({
  bodyScroll: { flexShrink: 1 },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
  body: { padding: spacing.lg, gap: spacing.lg },
  readonlyNote: { ...typography.small, color: colors.zinc500 },
  modeRow: { flexDirection: 'row', gap: spacing.sm },
  block: { gap: spacing.md },
  fieldLabel: { ...typography.small, color: colors.zinc400, fontWeight: '800' },
  averageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  averageValue: { fontSize: 16, fontWeight: '900', color: colors.amber300 },
  criterionRow: {
    gap: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceDeep,
    padding: spacing.md,
  },
  criterionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  criterionLabel: { ...typography.small, color: colors.zinc300, fontWeight: '700' },
  criterionLabelDisabled: { color: colors.zinc600 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSofter,
  },
  stepButtonDisabled: { opacity: 0.4 },
  stepButtonPressed: { opacity: 0.8 },
  stepperInput: {
    flex: 1,
    height: 40,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceDeep,
    color: colors.foreground,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '800',
  },
  stepperInputDisabled: { opacity: 0.5 },
  stepperMax: { ...typography.tiny, color: colors.zinc600 },
  errorText: { ...typography.small, color: colors.red300, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  actionButton: { flex: 1 },
}));
