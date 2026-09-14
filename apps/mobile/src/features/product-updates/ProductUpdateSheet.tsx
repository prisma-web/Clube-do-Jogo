import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ProductUpdate } from '@clube-do-jogo/domain';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/Button';
import { radii, spacing, themedStyles, typography, useThemeColors } from '@/theme';

export function ProductUpdateSheet({ update, visible, onClose, onFinish }: {
  update: ProductUpdate;
  visible: boolean;
  onClose: () => void;
  onFinish: () => void;
}) {
  const colors = useThemeColors();
  const styles = useStyles();
  const [stepIndex, setStepIndex] = useState(0);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setStepIndex(0);
  }

  const step = update.steps[stepIndex];
  const finalStep = stepIndex === update.steps.length - 1;

  return (
    <Sheet visible={visible} title={update.title} onClose={onClose}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.progress}>{stepIndex + 1} de {update.steps.length}</Text>
        <Text style={styles.eyebrow}>{step.eyebrow}</Text>
        <Text style={styles.title} accessibilityRole="header">{step.title}</Text>
        <Text style={styles.description}>{step.body}</Text>
        {step.highlights ? (
          <View style={styles.highlights}>
            {step.highlights.map(highlight => (
              <View key={highlight} style={styles.highlightRow}>
                <Ionicons name="checkmark-circle" size={16} color={colors.violet300} />
                <Text style={styles.highlightText}>{highlight}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots} accessibilityLabel={`Passo ${stepIndex + 1} de ${update.steps.length}`}>
          {update.steps.map((item, index) => (
            <View key={`${item.eyebrow}-${index}`} style={[styles.dot, index <= stepIndex && styles.dotActive]} />
          ))}
        </View>
        <View style={styles.actions}>
          <Button
            label="Anterior"
            variant="ghost"
            onPress={() => setStepIndex(current => Math.max(0, current - 1))}
            disabled={stepIndex === 0}
            accessibilityLabel="Passo anterior"
            style={styles.actionButton}
          />
          {finalStep ? (
            <Button
              label={`Explorar a ${update.version}`}
              variant="primary"
              onPress={onFinish}
              style={styles.actionButton}
            />
          ) : (
            <Button
              label="Próximo"
              variant="primary"
              onPress={() => setStepIndex(current => Math.min(update.steps.length - 1, current + 1))}
              accessibilityLabel="Próximo passo"
              style={styles.actionButton}
            />
          )}
        </View>
      </View>
    </Sheet>
  );
}

const useStyles = themedStyles(colors => ({
  scroll: { flexShrink: 1 },
  body: { padding: spacing.lg, gap: spacing.sm },
  progress: { ...typography.tiny, color: colors.zinc600 },
  eyebrow: { ...typography.tiny, color: colors.violet300, marginTop: spacing.xs },
  title: { ...typography.h2, color: colors.foreground, marginTop: spacing.xs },
  description: { ...typography.body, color: colors.zinc400, lineHeight: 20, marginTop: spacing.sm },
  highlights: { gap: spacing.sm, marginTop: spacing.md },
  highlightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  highlightText: { ...typography.small, color: colors.zinc300, flex: 1, lineHeight: 17 },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
  dots: { flexDirection: 'row', gap: spacing.xs },
  dot: { flex: 1, height: 3, borderRadius: radii.full, backgroundColor: colors.hairline },
  dotActive: { backgroundColor: colors.violet400 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  actionButton: { flex: 1 },
}));
