import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  moreProductUpdatesLabel,
  productUpdateSteps,
  productUpdateTitle,
  type ProductUpdateDigest,
} from '@clube-do-jogo/domain';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/Button';
import { ProductUpdateVisual } from './ProductUpdateVisual';
import { radii, spacing, themedStyles, typography, useThemeColors } from '@/theme';

export function ProductUpdateSheet({ digest, visible, onClose, onFinish }: {
  digest: ProductUpdateDigest;
  visible: boolean;
  onClose: () => void;
  onFinish: () => void;
}) {
  const colors = useThemeColors();
  const styles = useStyles();
  const [pageIndex, setPageIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setPageIndex(0);
      setStepIndex(0);
    }
  }

  const page = digest.pages[Math.min(pageIndex, digest.pages.length - 1)];
  const steps = productUpdateSteps(page);
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const finalStep = stepIndex >= steps.length - 1;
  const more = finalStep ? moreProductUpdatesLabel(digest.pages.slice(pageIndex + 1)) : null;
  const showMore = () => {
    setPageIndex(current => current + 1);
    setStepIndex(0);
  };

  return (
    <Sheet visible={visible} title={productUpdateTitle(page)} onClose={onClose}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.progress}>{step.version} · {stepIndex + 1} de {steps.length}</Text>
        <ProductUpdateVisual key={`${pageIndex}-${stepIndex}`} step={step} version={step.version} />
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
        <View style={styles.dots} accessibilityLabel={`Passo ${stepIndex + 1} de ${steps.length}`}>
          {steps.map((item, index) => (
            <Pressable
              key={`${pageIndex}-${index}`}
              onPress={() => setStepIndex(index)}
              accessibilityRole="button"
              accessibilityLabel={`Ir para o passo ${index + 1}: ${item.version}, ${item.eyebrow}`}
              accessibilityState={{ selected: index === stepIndex }}
              hitSlop={{ top: 12, bottom: 12 }}
              style={styles.dotHit}
            >
              <View style={[styles.dot, index <= stepIndex && styles.dotActive]} />
            </Pressable>
          ))}
        </View>
        {more ? (
          <Button
            label={more}
            variant="ghost"
            onPress={showMore}
            accessibilityLabel={`Ver ${more.toLocaleLowerCase('pt-BR')}`}
          />
        ) : null}
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
              label={`Explorar a ${digest.id}`}
              variant="primary"
              onPress={onFinish}
              style={styles.actionButton}
            />
          ) : (
            <Button
              label="Próximo"
              variant="primary"
              onPress={() => setStepIndex(current => Math.min(steps.length - 1, current + 1))}
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
  eyebrow: { ...typography.tiny, color: colors.violet300, marginTop: spacing.sm },
  title: { ...typography.h2, color: colors.foreground, marginTop: spacing.xs },
  description: { ...typography.body, color: colors.zinc400, lineHeight: 20, marginTop: spacing.sm },
  highlights: { gap: spacing.sm, marginTop: spacing.md },
  highlightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  highlightText: { ...typography.small, color: colors.zinc300, flex: 1, lineHeight: 17 },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
  dots: { flexDirection: 'row', gap: spacing.xs },
  dotHit: { flex: 1, justifyContent: 'center', height: 20 },
  dot: { height: 4, borderRadius: radii.full, backgroundColor: colors.hairline },
  dotActive: { backgroundColor: colors.violet400 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  actionButton: { flex: 1 },
}));
