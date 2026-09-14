import type { Theme } from 'rn-emoji-keyboard/lib/typescript/contexts/KeyboardContext';
import type { ThemeColors } from '@/theme';

/**
 * Only the slots the static keyboard actually paints. Naming them keeps a
 * misspelled slot a compile error instead of a silent fallback to the
 * library's own light-grey defaults.
 */
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

/**
 * Copied rather than spread over the library's `pt`, because importing it
 * through the package entry point drags React Native into the node tests, and
 * its own `food_drink` label is misspelled "Comida & Bebibda".
 */
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
