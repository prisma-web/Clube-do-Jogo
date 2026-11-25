import type { Theme } from 'rn-emoji-keyboard/lib/typescript/contexts/KeyboardContext';
import type { ThemeColors } from '@/theme';

type EmojiKeyboardTheme = Pick<Theme, 'container' | 'header' | 'skinTonesContainer' | 'category' | 'search'>;

export function emojiKeyboardTheme(colors: ThemeColors): EmojiKeyboardTheme {
  return {
    container: colors.surface,
    header: colors.zinc400,
    skinTonesContainer: colors.surfaceSoft,
    category: {
      icon: colors.zinc500,
      iconActive: colors.primaryOn,
      container: colors.surfaceSofter,
      containerActive: colors.violet500,
    },
    search: {
      background: colors.surfaceSofter,
      text: colors.foreground,
      placeholder: colors.zinc500,
      icon: colors.zinc400,
    },
  };
}

export const emojiKeyboardTranslation = {
  recently_used: 'Usado recentemente',
  smileys_emotion: 'Sorrisos & Emoções',
  people_body: 'Pessoas & Corpo',
  animals_nature: 'Animais & Natureza',
  food_drink: 'Comida & Bebida',
  travel_places: 'Viagens & Lugares',
  activities: 'Atividades',
  objects: 'Objetos',
  symbols: 'Símbolos',
  flags: 'Bandeiras',
  search: 'Buscar emoji',
};
