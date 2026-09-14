export type ThemeAvailability = 'public' | 'reward';

interface ThemeDefinitionShape {
  readonly id: string;
  readonly name: string;
  readonly colors: readonly [string, string, string];
  readonly background: string;
  readonly availability: ThemeAvailability;
}

export const themes = [
  { id: 'original', name: 'Clube Neon', colors: ['#8b5cf6', '#d946ef', '#101014'], background: '#08080a', availability: 'public' },
  { id: 'zelda', name: 'Zelda Deluxe', colors: ['#d3b563', '#5274a6', '#070807'], background: '#070807', availability: 'public' },
  { id: 'nier', name: 'NieR: Automata', colors: ['#4b413d', '#6f5148', '#c7c1aa'], background: '#c7c1aa', availability: 'public' },
  { id: 'crossing', name: 'Animal Crossing', colors: ['#58b6a6', '#77b96a', '#fff6d8'], background: '#e7dcc0', availability: 'reward' },
  { id: 'ori', name: 'Floresta de Nibel', colors: ['#ddfbff', '#55ddf4', '#071a35'], background: '#030a16', availability: 'reward' },
  { id: 'cosmic-campfire', name: 'Fogueira Cósmica', colors: ['#f0a35a', '#77c9d4', '#071522'], background: '#050d16', availability: 'reward' },
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
