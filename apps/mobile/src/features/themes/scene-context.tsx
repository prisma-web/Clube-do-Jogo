import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useNativeTheme } from '@/theme';
import { useThemeAudioEngine, type CosmicSceneMode, type ThemeAudioState } from './audio';
import { useCosmicAmbiencePreference } from './cosmic-ambience-preference';
import { useCosmicBackdropMode } from './cosmic-backdrop-preference';

export interface ThemeSceneState {
  mode: CosmicSceneMode;
  setMode(mode: CosmicSceneMode): void;
  audio: ThemeAudioState;
}

const fallback: ThemeSceneState = {
  mode: 'hearth',
  setMode: () => undefined,
  audio: { active: false, ready: false, error: null, retry: () => undefined, playSignal: () => undefined, queueSignal: () => undefined },
};

const SceneContext = createContext<ThemeSceneState>(fallback);

export function ThemeSceneProvider({ children }: { children: ReactNode }) {
  const theme = useNativeTheme();
  const ambience = useCosmicAmbiencePreference();
  const [mode, setMode] = useCosmicBackdropMode();
  const signalsActive = theme.audioActive;
  const ambienceActive = theme.usesAudio && theme.appActive && ambience.enabled;
  const audio = useThemeAudioEngine({
    active: signalsActive || ambienceActive,
    mode,
    ambienceEnabled: ambienceActive,
    ambienceVolume: ambience.volume,
    signalsEnabled: signalsActive,
  });

  const value = useMemo<ThemeSceneState>(() => ({ mode, setMode, audio }), [audio, mode, setMode]);
  return <SceneContext.Provider value={value}>{children}</SceneContext.Provider>;
}

export function useThemeScene(): ThemeSceneState {
  return useContext(SceneContext);
}

export function useUiSignal(): ThemeAudioState['playSignal'] {
  return useContext(SceneContext).audio.playSignal;
}
