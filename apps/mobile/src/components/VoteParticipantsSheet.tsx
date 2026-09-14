import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Avatar } from './Avatar';
import { Sheet } from './Sheet';
import { voteReasonLabel } from './VoteReasonSheet';
import { radii, spacing, themedStyles, typography, useThemeColors } from '@/theme';
import type { VoteChoice, VoteParticipant } from '@clube-do-jogo/domain';

const choices: Array<{ value: VoteChoice; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: 'would_not_play', label: 'Não', icon: 'thumbs-down' },
  { value: 'would_play', label: 'Jogaria', icon: 'thumbs-up' },
];

export function VoteParticipantsSheet({ visible, onClose, profiles, initialChoice }: {
  visible: boolean;
  onClose: () => void;
  profiles: Record<VoteChoice, VoteParticipant[]>;
  initialChoice: VoteChoice;
}) {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useStyles();
  const [active, setActive] = useState<VoteChoice>(initialChoice);
  const people = profiles[active];

  function openProfile(personId: string) {
    onClose();
    router.push({ pathname: '/(app)/perfil/[id]', params: { id: personId } });
  }

  return (
    <Sheet visible={visible} title="Escolhas do clube" onClose={onClose}>
      <View style={styles.body}>
        <View style={styles.tabs}>
          {choices.map(option => {
            const selected = active === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => setActive(option.value)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={option.label}
                style={[styles.tab, selected && styles.tabSelected]}
              >
                <Ionicons name={option.icon} size={14} color={selected ? colors.violet300 : colors.zinc500} />
                <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>
                  {option.label} · {profiles[option.value].length}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {people.length === 0 ? (
            <Text style={styles.emptyText}>Ninguém escolheu esta opção.</Text>
          ) : (
            people.map(person => (
              <Pressable
                key={person.id}
                onPress={() => openProfile(person.id)}
                accessibilityRole="button"
                accessibilityLabel={`Ver perfil de ${person.name || 'Membro'}`}
                style={styles.personRow}
              >
                <Avatar uri={person.avatar_url} crop={person.avatar_crop} name={person.name} size={44} />
                <View style={styles.personInfo}>
                  <Text style={styles.personName} numberOfLines={1}>{person.name || 'Membro'}</Text>
                  {active === 'would_not_play' ? (
                    <>
                      <Text style={styles.personReason}>{voteReasonLabel(person.reason)}</Text>
                      {person.reason === 'other' && person.reasonText ? (
                        <Text style={styles.personReasonText}>{person.reasonText}</Text>
                      ) : null}
                    </>
                  ) : null}
                </View>
                <Ionicons name="arrow-up-outline" size={16} color={colors.zinc500} style={styles.personArrow} />
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>
    </Sheet>
  );
}

const useStyles = themedStyles(colors => ({
  body: { padding: spacing.lg, gap: spacing.md },
  tabs: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.surfaceDeep, borderRadius: radii.lg, padding: 4 },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: radii.md,
  },
  tabSelected: { backgroundColor: colors.surfaceSoft },
  tabLabel: { fontSize: 11, fontWeight: '700', color: colors.zinc500 },
  tabLabelSelected: { color: colors.violet300 },
  list: { maxHeight: 420 },
  listContent: { gap: spacing.sm },
  emptyText: { ...typography.small, color: colors.zinc500, textAlign: 'center', paddingVertical: spacing.xxl },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    padding: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairlineSoft,
    backgroundColor: colors.surfaceSofter,
  },
  personInfo: { flex: 1, minWidth: 0, gap: 2 },
  personName: { ...typography.h3, fontSize: 13, color: colors.foreground },
  personReason: { fontSize: 10, fontWeight: '700', color: colors.red300 },
  personReasonText: { fontSize: 11, color: colors.zinc500, lineHeight: 15 },
  personArrow: { transform: [{ rotate: '45deg' }] },
}));
