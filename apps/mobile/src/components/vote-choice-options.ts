import type { Ionicons } from '@expo/vector-icons';
import type { VoteChoice } from '@clube-do-jogo/domain';
import type { ThemeColors } from '@/theme';

type VoteChoiceOption = {
  value: VoteChoice;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Count icon and selected border. */
  accent: (colors: ThemeColors) => string;
  /** Selected label and icon. */
  selected: (colors: ThemeColors) => string;
};

/** Display order of the vote buttons, counts and participant tabs. */
export const voteChoiceOptions: readonly VoteChoiceOption[] = [
  { value: 'would_not_play', label: 'Não', icon: 'thumbs-down', accent: colors => colors.red400, selected: colors => colors.red300 },
  { value: 'neutral', label: 'Neutro', icon: 'remove', accent: colors => colors.zinc300, selected: colors => colors.foreground },
  { value: 'would_play', label: 'Jogaria', icon: 'thumbs-up', accent: colors => colors.emerald400, selected: colors => colors.emerald300 },
];
