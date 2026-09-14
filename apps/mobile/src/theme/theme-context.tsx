import * as React from 'react';
import type { ThemeId } from '@clube-do-jogo/domain';
import { DEFAULT_THEME } from '@clube-do-jogo/domain';
import { useMobilePreferences } from '@/hooks/use-mobile-preferences';
import { lightThemeIds, themePalettes, type ThemeColors } from './palette';
import { useAppActive, useSystemReduceMotion } from './system-state';

export type ThemeSceneId = 'none' | 'crossing' | 'ori' | 'cosmic';

export interface NativeTheme {
  id: ThemeId;
  colors: ThemeColors;
  isLight: boolean;
  scene: ThemeSceneId;
  usesAudio: boolean;
  appActive: boolean;
  systemReduceMotion: boolean;
  reduceMotion: boolean;
  animated: boolean;
  audioActive: boolean;
}

const scenes: Partial<Record<ThemeId, ThemeSceneId>> = {
  crossing: 'crossing',
  ori: 'ori',
  'cosmic-campfire': 'cosmic',
};

function buildTheme(
  id: ThemeId,
  options: { userReduceMotion: boolean; systemReduceMotion: boolean; audioEnabled: boolean; appActive: boolean },
): NativeTheme {
  const reduceMotion = options.userReduceMotion || options.systemReduceMotion;
  const usesAudio = id === 'cosmic-campfire';
  return {
    id,
    colors: themePalettes[id],
    isLight: lightThemeIds.includes(id),
    scene: scenes[id] || 'none',
    usesAudio,
    appActive: options.appActive,
    systemReduceMotion: options.systemReduceMotion,
    reduceMotion,
    animated: !reduceMotion && options.appActive,
    audioActive: usesAudio && options.audioEnabled && options.appActive,
  };
}

const fallbackTheme = buildTheme(DEFAULT_THEME, {
  userReduceMotion: false,
  systemReduceMotion: false,
  audioEnabled: false,
  appActive: true,
});

const ThemeContext = React.createContext<NativeTheme>(fallbackTheme);

export function ThemeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const preferences = useMobilePreferences();
  const systemReduceMotion = useSystemReduceMotion();
  const appActive = useAppActive();
  const theme = React.useMemo(
    () => buildTheme(preferences.themeId, {
      userReduceMotion: preferences.reduceMotion,
      systemReduceMotion,
      audioEnabled: preferences.audioEnabled,
      appActive,
    }),
    [appActive, preferences.audioEnabled, preferences.reduceMotion, preferences.themeId, systemReduceMotion],
  );
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useNativeTheme(): NativeTheme {
  return React.useContext(ThemeContext);
}

export function useThemeColors(): ThemeColors {
  return React.useContext(ThemeContext).colors;
}

export function useThemeId(): ThemeId {
  return React.useContext(ThemeContext).id;
}
