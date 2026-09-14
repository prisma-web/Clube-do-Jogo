import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { EmojiKeyboard } from 'rn-emoji-keyboard';
import { Sheet } from '@/components/Sheet';
import { Avatar } from '@/components/Avatar';
import { themedStyles, useThemeColors, radii, spacing, typography } from '@/theme';
import type { ClubComment } from '@clube-do-jogo/domain';
import { emojiKeyboardTheme, emojiKeyboardTranslation } from './emoji-keyboard-theme';

export function ReactionPickerSheet({ visible, notice, onSelect, onClose }: {
  visible: boolean;
  notice: string;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const styles = useStyles();
  const { height } = useWindowDimensions();

  return (
    <Sheet visible={visible} title="Adicionar reação" onClose={onClose} avoidKeyboard>
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {/* flexShrink: RN defaults it to 0, so with the keyboard up a 667pt screen clipped the search field off the sheet instead of shrinking the picker. No minHeight: a floor in points ignores the font scale, and at accessibility sizes it pushed the search field under the keyboard again. */}
      <View style={{ height: Math.min(420, height * 0.6), flexShrink: 1 }}>
        <EmojiKeyboard
          onEmojiSelected={emoji => onSelect(emoji.emoji)}
          theme={emojiKeyboardTheme(colors)}
          translation={emojiKeyboardTranslation}
          enableSearchBar
          categoryPosition="top"
          disableSafeArea
          emojiSize={28}
        />
      </View>
    </Sheet>
  );
}

export function ReactionsListSheet({ visible, comment, onClose }: {
  visible: boolean;
  comment: ClubComment | null;
  onClose: () => void;
}) {
  const styles = useStyles();
  const people = comment?.reactions.flatMap(reaction => reaction.users.map(user => ({ user, emoji: reaction.emoji }))) ?? [];
  return (
    <Sheet visible={visible} title="Reações" onClose={onClose}>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {people.length === 0 ? (
          <Text style={styles.empty}>Ninguém reagiu ainda.</Text>
        ) : people.map(({ user, emoji }, index) => (
          <View key={`${emoji}-${user.id}-${index}`} style={styles.person}>
            <Avatar uri={user.avatar_url} crop={user.avatar_crop} name={user.name} size={36} />
            <Text style={styles.personName} numberOfLines={1}>{user.name || 'Membro'}</Text>
            <Text style={styles.personEmoji}>{emoji}</Text>
          </View>
        ))}
      </ScrollView>
    </Sheet>
  );
}

const useStyles = themedStyles(colors => ({
  notice: {
    ...typography.small,
    color: colors.amber300,
    backgroundColor: 'rgba(251,191,36,0.1)',
    borderRadius: radii.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  list: { maxHeight: 360 },
  listContent: { padding: spacing.md, gap: spacing.xs },
  empty: { ...typography.small, color: colors.zinc600, textAlign: 'center', paddingVertical: spacing.xl },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  personName: { ...typography.body, color: colors.foreground, flex: 1 },
  personEmoji: { fontSize: 20 },
}));
