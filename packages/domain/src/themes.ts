import { sharedThemeColor } from './theme-palettes';

export type ThemeAvailability = 'public' | 'reward';
export type ThemeScheme = 'dark' | 'light';

interface ThemeDefinitionShape {
  readonly id: string;
  readonly name: string;
  readonly colors: readonly [string, string, string];
  readonly background: string;
  readonly scheme: ThemeScheme;
  readonly availability: ThemeAvailability;
}

// As prévias apontam para a paleta compartilhada (theme-palettes.ts) só quando a cor é idêntica
// nas duas plataformas; os literais restantes são cores próprias da prévia ou do theme-color da web
// e hoje diferem da paleta (por exemplo crossing e cosmic-campfire), então ficam como estão.
export const themes = [
  { id: 'original', name: 'Clube Neon', colors: [sharedThemeColor('original', 'supportVote'), '#d946ef', sharedThemeColor('original', 'surface')], background: sharedThemeColor('original', 'background'), scheme: 'dark', availability: 'public' },
  { id: 'zelda', name: 'Zelda Deluxe', colors: ['#d3b563', sharedThemeColor('zelda', 'supportVote'), sharedThemeColor('zelda', 'background')], background: sharedThemeColor('zelda', 'background'), scheme: 'dark', availability: 'public' },
  { id: 'nier', name: 'NieR: Automata', colors: [sharedThemeColor('nier', 'violet400'), sharedThemeColor('nier', 'supportVote'), sharedThemeColor('nier', 'background')], background: sharedThemeColor('nier', 'background'), scheme: 'light', availability: 'public' },
  { id: 'crossing', name: 'Animal Crossing', colors: ['#58b6a6', '#77b96a', '#fff6d8'], background: '#e7dcc0', scheme: 'light', availability: 'reward' },
  { id: 'ori', name: 'Floresta de Nibel', colors: ['#ddfbff', '#55ddf4', '#071a35'], background: sharedThemeColor('ori', 'background'), scheme: 'dark', availability: 'reward' },
  { id: 'cosmic-campfire', name: 'Fogueira Cósmica', colors: ['#f0a35a', '#77c9d4', '#071522'], background: '#050d16', scheme: 'dark', availability: 'reward' },
] as const satisfies readonly ThemeDefinitionShape[];

export type ThemeDefinition = (typeof themes)[number];
export type ThemeId = ThemeDefinition['id'];

export const DEFAULT_THEME: ThemeId = 'original';
export const THEME_STORAGE_KEY = 'clube-do-jogo:theme';

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && themes.some(theme => theme.id === value);
}

export function getSelectableThemes(unlockedThemeIds: readonly string[]): readonly ThemeDefinition[] {
  const unlocked = new Set(unlockedThemeIds);
  return themes.filter(theme => theme.availability === 'public' || unlocked.has(theme.id));
}
