import { useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import {
  createThemeAudioController,
  type CosmicSceneMode,
  type ThemeAudioPlatform,
} from './audio-controller';
import { signalSources, themeAudio, type ThemeSignal } from './assets';

export type { CosmicSceneMode } from './audio-controller';

export interface ThemeAudioState {
  active: boolean;
  ready: boolean;
  error: string | null;
  retry(): void;
  playSignal(signal: ThemeSignal): void;
}

const playbackMode = {
  playsInSilentMode: false,
  interruptionMode: 'mixWithOthers' as const,
  allowsRecording: false,
  shouldPlayInBackground: false,
  shouldRouteThroughEarpiece: false,
};

const platform: ThemeAudioPlatform = {
  configureMode: () => setAudioModeAsync(playbackMode),
  createPlayer: source => createAudioPlayer(source),
};

export function useThemeAudioEngine({
  active,
  mode,
  ambienceEnabled,
  ambienceVolume,
  signalsEnabled,
}: {
  active: boolean;
  mode: CosmicSceneMode;
  ambienceEnabled: boolean;
  ambienceVolume: number;
  signalsEnabled: boolean;
}): ThemeAudioState {
  const [controller] = useState(() =>
    createThemeAudioController({
      platform,
      ambienceSources: {
        hearth: themeAudio.ambienceHearth,
        spaceflight: themeAudio.ambienceSpaceflight,
      },
      signalSources,
    }),
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useLayoutEffect(() => {
    controller.setAmbienceEnabled(ambienceEnabled);
    controller.setAmbienceVolume(ambienceVolume);
  }, [controller, ambienceEnabled, ambienceVolume]);

  useLayoutEffect(() => {
    if (active) {
      controller.activate(mode);
    } else {
      controller.deactivate();
    }
  }, [active, controller, mode]);

  useLayoutEffect(() => {
    return () => {
      controller.dispose();
    };
  }, [controller]);

  const current = active && controller.isModeActive(mode);
  return {
    active,
    ready: current && snapshot.ready,
    error: current ? snapshot.error : null,
    retry: controller.retry,
    playSignal: (signal: ThemeSignal) => {
      if (signalsEnabled) controller.playSignal(signal);
    },
  };
}
