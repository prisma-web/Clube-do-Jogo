import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import { themeShapes, type ThemeId, type ThemeShape } from '@clube-do-jogo/domain';
import { themePalettes, type ThemeColors } from './palette';
import { applyThemeShape } from './shape';
import { useThemeId } from './theme-context';

type Sheet = Record<string, ViewStyle | TextStyle | ImageStyle>;

export function themedStyles<T extends Sheet>(factory: (colors: ThemeColors, shape: ThemeShape) => T): () => T {
  const compiled = new Map<ThemeId, T>();
  return function useStyles(): T {
    const themeId = useThemeId();
    let sheet = compiled.get(themeId);
    if (!sheet) {
      const shape = themeShapes[themeId];
      const colors = themePalettes[themeId];
      sheet = StyleSheet.create(applyThemeShape(factory(colors, shape), shape, colors));
      compiled.set(themeId, sheet);
    }
    return sheet;
  };
}
