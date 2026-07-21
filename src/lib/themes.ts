export const themes = [
  { id: 'original', name: 'Clube Neon', colors: ['#8b5cf6', '#d946ef', '#101014'] },
  { id: 'zelda', name: 'Zelda Deluxe', colors: ['#d3b563', '#5274a6', '#070807'] },
  { id: 'nier', name: 'NieR: Automata', colors: ['#4b413d', '#6f5148', '#c7c1aa'] },
  { id: 'crossing', name: 'Animal Crossing', colors: ['#58b6a6', '#77b96a', '#fff6d8'], archived: true },
] as const;

export type ThemeId = (typeof themes)[number]['id'];
export const DEFAULT_THEME: ThemeId = 'original';
export const THEME_STORAGE_KEY = 'clube-do-jogo:theme';
export const visibleThemes = themes.filter(theme => !('archived' in theme && theme.archived));

export function isThemeId(value: string | null): value is ThemeId {
  return themes.some(theme => theme.id === value);
}
