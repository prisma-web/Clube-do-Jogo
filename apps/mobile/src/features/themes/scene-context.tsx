import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useNativeTheme } from '@/theme';
import { useThemeAudioEngine, type CosmicSceneMode, type ThemeAudioState } from './audio';
import { useCosmicAmbiencePreference } from './cosmic-ambience-preference';

export interface ThemeSceneState {
  mode: CosmicSceneMode;
  setMode(mode: CosmicSceneMode): void;
  audio: ThemeAudioState;
}

const fallback: ThemeSceneState = {
  mode: 'hearth',
  setMode: () => undefined,
  audio: { active: false, ready: false, error: null, retry: () => undefined, playSignal: () => undefined },
};

const SceneContext = createContext<ThemeSceneState>(fallback);

export function ThemeSceneProvider({ children }: { children: ReactNode }) {
  const theme = useNativeTheme();
  const ambience = useCosmicAmbiencePreference();
  const [mode, setModeState] = useState<CosmicSceneMode>('hearth');
  // theme.audioActive already gates the "sons do comunicador" signal toggle on usesAudio + appActive.
  // The ambience loop is an independent preference (like the web's cosmic-ambience module), so it
  // gets its own on/appActive gate here rather than folding into theme.audioActive.
  const signalsActive = theme.audioActive;
  const ambienceActive = theme.usesAudio && theme.appActive && ambience.enabled;
  const audio = useThemeAudioEngine({
    active: signalsActive || ambienceActive,
    mode,
    ambienceEnabled: ambienceActive,
    ambienceVolume: ambience.volume,
    signalsEnabled: signalsActive,
  });

  const setMode = useCallback((next: CosmicSceneMode) => {
    setModeState(next);
  }, []);

  const value = useMemo<ThemeSceneState>(() => ({ mode, setMode, audio }), [audio, mode, setMode]);
  return <SceneContext.Provider value={value}>{children}</SceneContext.Provider>;
}

export function useThemeScene(): ThemeSceneState {
  return useContext(SceneContext);
}
