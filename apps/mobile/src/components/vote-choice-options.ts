import type { Ionicons } from '@expo/vector-icons';
import { voteChoiceLabels, voteChoices } from '@clube-do-jogo/domain';
import type { VoteChoice } from '@clube-do-jogo/domain';
import type { ThemeColors } from '@/theme';

type VoteChoiceLook = {
  /** O rótulo curto cabe no botão. Quem ouve o leitor de tela precisa da frase inteira. */
  accessibilityName: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Count icon and selected border. */
  accent: (colors: ThemeColors) => string;
  /** Selected label and icon. */
  selected: (colors: ThemeColors) => string;
};

const looks: Record<VoteChoice, VoteChoiceLook> = {
  would_not_play: { accessibilityName: 'Não jogaria', icon: 'thumbs-down', accent: colors => colors.red400, selected: colors => colors.red300 },
  neutral: { accessibilityName: 'Neutro', icon: 'remove', accent: colors => colors.zinc300, selected: colors => colors.foreground },
  would_play: { accessibilityName: 'Jogaria', icon: 'thumbs-up', accent: colors => colors.emerald400, selected: colors => colors.emerald300 },
};

/** The vote buttons, counts and participant tabs, in `voteChoices` order. */
export const voteChoiceOptions = voteChoices.map(value => ({ value, label: voteChoiceLabels[value], ...looks[value] }));
