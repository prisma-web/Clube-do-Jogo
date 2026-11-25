import * as React from 'react';
import { usePersistentState } from '@/hooks/use-persistent-state';
import type { CosmicSceneMode } from './audio-controller';
import {
  COSMIC_BACKDROP_PREFERENCE_KEY,
  DEFAULT_COSMIC_BACKDROP_MODE,
  normalizeCosmicBackdropMode,
  parseCosmicBackdropMode,
} from './cosmic-backdrop-core';

export { COSMIC_BACKDROP_PREFERENCE_KEY, DEFAULT_COSMIC_BACKDROP_MODE } from './cosmic-backdrop-core';

export function useCosmicBackdropMode(): [CosmicSceneMode, (mode: CosmicSceneMode) => void] {
  const options = React.useMemo(() => ({ parse: parseCosmicBackdropMode }), []);
  const [mode, setStored] = usePersistentState<CosmicSceneMode>(
    COSMIC_BACKDROP_PREFERENCE_KEY,
    DEFAULT_COSMIC_BACKDROP_MODE,
    options,
  );
  const setMode = React.useCallback((next: CosmicSceneMode) => {
    setStored(normalizeCosmicBackdropMode(next));
  }, [setStored]);
  return [mode, setMode];
}
