import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radii, spacing, themedStyles, typography, useThemeColors } from '@/theme';
import { Sheet } from './Sheet';
import { Button } from './Button';
import type { VoteReason } from '@clube-do-jogo/domain';

export const voteReasons: Array<{ value: VoteReason; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: 'played_before', label: 'Já joguei e não quero de novo', icon: 'refresh-outline' },
  { value: 'cannot_run', label: 'Não consigo rodar', icon: 'desktop-outline' },
  { value: 'too_expensive', label: 'Muito caro', icon: 'pricetag-outline' },
  { value: 'other', label: 'Outro', icon: 'create-outline' },
];

export function voteReasonLabel(reason?: VoteReason | null) {
  return voteReasons.find(option => option.value === reason)?.label || 'Sem motivo informado';
}

export function VoteReasonSheet({ visible, initialReason, initialText, onClose, onConfirm }: {
  visible: boolean;
  initialReason?: VoteReason | null;
  initialText?: string | null;
  onClose: () => void;
  onConfirm: (reason: VoteReason, text: string | null) => void;
}) {
  const [reason, setReason] = useState<VoteReason | null>(initialReason || null);
  const [text, setText] = useState(initialText || '');
  const colors = useThemeColors();
  const styles = useStyles();
  const valid = Boolean(reason) && (reason !== 'other' || Boolean(text.trim()));

  return (
    <Sheet visible={visible} title="Por que você não jogaria?" onClose={onClose}>
      <View style={styles.body}>
        {voteReasons.map(option => {
          const selected = reason === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => setReason(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              style={[styles.option, selected && styles.optionSelected]}
            >
              <Ionicons name={option.icon} size={18} color={selected ? colors.red300 : colors.zinc400} />
              <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{option.label}</Text>
              {selected ? <Ionicons name="checkmark" size={18} color={colors.red300} /> : null}
            </Pressable>
          );
        })}
        {reason === 'other' ? (
          <TextInput
            value={text}
            onChangeText={value => setText(value.slice(0, 150))}
            placeholder="Conte o motivo"
            placeholderTextColor={colors.zinc600}
            multiline
            numberOfLines={3}
            style={styles.textInput}
            accessibilityLabel="Motivo detalhado"
          />
        ) : null}
        <View style={styles.actions}>
          <Button label="Cancelar" variant="secondary" onPress={onClose} style={styles.actionButton} />
          <Button
            label="Confirmar Não"
            variant="danger"
            disabled={!valid}
            onPress={() => reason && onConfirm(reason, reason === 'other' ? text.trim() : null)}
            style={styles.actionButton}
          />
        </View>
      </View>
    </Sheet>
  );
}

const useStyles = themedStyles(colors => ({
  body: { padding: spacing.lg, gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSofter,
  },
  optionSelected: { borderColor: colors.red400, backgroundColor: colors.surfaceSoft },
  optionLabel: { ...typography.small, color: colors.zinc300, flex: 1 },
  optionLabelSelected: { color: colors.red300 },
  textInput: {
    minHeight: 80,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceDeep,
    color: colors.foreground,
    padding: spacing.md,
    textAlignVertical: 'top',
    ...typography.body,
  },
  actions: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.sm },
  actionButton: { flex: 1 },
}));
