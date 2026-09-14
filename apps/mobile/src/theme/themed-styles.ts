import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import type { ThemeId } from '@clube-do-jogo/domain';
import { themePalettes, type ThemeColors } from './palette';
import { useThemeId } from './theme-context';

type Sheet = Record<string, ViewStyle | TextStyle | ImageStyle>;

export function themedStyles<T extends Sheet>(factory: (colors: ThemeColors) => T): () => T {
  const compiled = new Map<ThemeId, T>();
  return function useStyles(): T {
    const themeId = useThemeId();
    let sheet = compiled.get(themeId);
    if (!sheet) {
      sheet = StyleSheet.create(factory(themePalettes[themeId]));
      compiled.set(themeId, sheet);
    }
    return sheet;
  };
}
