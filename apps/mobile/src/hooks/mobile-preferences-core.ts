import type { RatingScale, ThemeId } from '@clube-do-jogo/domain';
import { DEFAULT_THEME, isThemeId } from '@clube-do-jogo/domain';

export interface MobilePreferences {
  themeId: ThemeId;
  reduceMotion: boolean;
  audioEnabled: boolean;
  ratingScale: RatingScale;
}

export const DEFAULT_MOBILE_PREFERENCES: MobilePreferences = {
  themeId: DEFAULT_THEME,
  reduceMotion: false,
  audioEnabled: false,
  ratingScale: 10,
};

const MOBILE_PREFERENCES_PREFIX = '@clube-do-jogo/mobile/preferences';

export function identityScope(userId: string | null, isDemo: boolean, sessionEpoch: number): string {
  const scope = userId ? encodeURIComponent(userId) : `anonymous-${sessionEpoch}`;
  return `${isDemo ? 'demo' : 'account'}/${scope}`;
}

export function mobilePreferencesStorageKey(userId: string | null, isDemo: boolean, sessionEpoch: number) {
  return `${MOBILE_PREFERENCES_PREFIX}/${identityScope(userId, isDemo, sessionEpoch)}`;
}

export function normalizeMobilePreferences(value: unknown): MobilePreferences {
  if (!value || typeof value !== 'object') return { ...DEFAULT_MOBILE_PREFERENCES };
  const row = value as Partial<MobilePreferences>;
  return {
    themeId: isThemeId(row.themeId) ? row.themeId : DEFAULT_THEME,
    reduceMotion: typeof row.reduceMotion === 'boolean' ? row.reduceMotion : DEFAULT_MOBILE_PREFERENCES.reduceMotion,
    audioEnabled: typeof row.audioEnabled === 'boolean' ? row.audioEnabled : DEFAULT_MOBILE_PREFERENCES.audioEnabled,
    ratingScale: row.ratingScale === 5 || row.ratingScale === 10 ? row.ratingScale : DEFAULT_MOBILE_PREFERENCES.ratingScale,
  };
}

export function parseMobilePreferences(value: string): MobilePreferences {
  return normalizeMobilePreferences(JSON.parse(value));
}
