import { resolveThemePalette, themes, type ThemeId } from '@clube-do-jogo/domain';

export interface ThemeColors {
  background: string;
  foreground: string;
  surface: string;
  surfaceSoft: string;
  surfaceSofter: string;
  surfaceDeep: string;
  card: string;
  hairline: string;
  hairlineSoft: string;

  violet300: string;
  violet400: string;
  violet500: string;
  violet600: string;
  fuchsia600: string;

  zinc300: string;
  zinc400: string;
  zinc500: string;
  zinc600: string;
  zinc700: string;
  zinc800: string;
  zinc900: string;
  zinc950: string;

  amber200: string;
  amber300: string;
  amber400: string;
  amber950: string;

  emerald300: string;
  emerald400: string;
  emerald500: string;

  sky400: string;

  red300: string;
  red400: string;
  red500: string;
  red600: string;

  pink400: string;

  supportVote: string;
  supportCompleted: string;
  supportBacklog: string;
  supportDanger: string;

  primaryOn: string;
  white: string;
  black: string;
}

// As cores vêm de packages/domain/src/theme-palettes.ts (fonte única com a web). Esta lista existe
// só para o TypeScript garantir que cada chave de ThemeColors é um token da paleta compartilhada.
const themeColorKeys = Object.keys({
  background: true, foreground: true, surface: true, surfaceSoft: true, surfaceSofter: true, surfaceDeep: true,
  card: true, hairline: true, hairlineSoft: true,
  violet300: true, violet400: true, violet500: true, violet600: true, fuchsia600: true,
  zinc300: true, zinc400: true, zinc500: true, zinc600: true, zinc700: true, zinc800: true, zinc900: true, zinc950: true,
  amber200: true, amber300: true, amber400: true, amber950: true,
  emerald300: true, emerald400: true, emerald500: true,
  sky400: true,
  red300: true, red400: true, red500: true, red600: true,
  pink400: true,
  supportVote: true, supportCompleted: true, supportBacklog: true, supportDanger: true,
  primaryOn: true, white: true, black: true,
} satisfies Record<keyof ThemeColors, true>) as (keyof ThemeColors)[];

function deriveThemeColors(themeId: ThemeId): ThemeColors {
  const resolved = resolveThemePalette(themeId, 'app');
  const colors = {} as ThemeColors;
  for (const key of themeColorKeys) {
    const value = resolved[key];
    if (value === undefined) throw new Error(`Tema ${themeId} sem a cor ${key} para o app.`);
    colors[key] = value;
  }
  return colors;
}

export const themePalettes = Object.fromEntries(themes.map(theme => [theme.id, deriveThemeColors(theme.id)])) as Record<ThemeId, ThemeColors>;

export const lightThemeIds: readonly ThemeId[] = themes.filter(theme => theme.scheme === 'light').map(theme => theme.id);

export const colors = themePalettes.original;
