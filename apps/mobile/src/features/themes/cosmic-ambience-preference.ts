import * as React from 'react';
import { usePersistentState, type PersistentStateStatus } from '@/hooks/use-persistent-state';

// Mirrors the web's device-only cosmic ambience preference (src/lib/cosmic-ambience.ts):
// on/off is independent of the "sons do comunicador" UI signal toggle, and volume defaults
// to 80%, matching the web's DEFAULT_AMBIENCE_VOLUME.
export interface CosmicAmbiencePreference {
  enabled: boolean;
  volume: number;
}

export const COSMIC_AMBIENCE_PREFERENCE_KEY = '@clube-do-jogo/mobile/cosmic-ambience';

export const DEFAULT_COSMIC_AMBIENCE_PREFERENCE: CosmicAmbiencePreference = {
  enabled: false,
  volume: 0.8,
};

export function normalizeCosmicAmbiencePreference(value: unknown): CosmicAmbiencePreference {
  if (!value || typeof value !== 'object') return { ...DEFAULT_COSMIC_AMBIENCE_PREFERENCE };
  const row = value as Partial<CosmicAmbiencePreference>;
  const volume = typeof row.volume === 'number' && Number.isFinite(row.volume)
    ? Math.min(1, Math.max(0, row.volume))
    : DEFAULT_COSMIC_AMBIENCE_PREFERENCE.volume;
  return {
    enabled: typeof row.enabled === 'boolean' ? row.enabled : DEFAULT_COSMIC_AMBIENCE_PREFERENCE.enabled,
    volume,
  };
}

function parseCosmicAmbiencePreference(value: string): CosmicAmbiencePreference {
  return normalizeCosmicAmbiencePreference(JSON.parse(value));
}

export interface CosmicAmbiencePreferenceState extends CosmicAmbiencePreference {
  loading: boolean;
  saving: boolean;
  error: Error | null;
  retry(): void;
  setEnabled(value: boolean): void;
  setVolume(value: number): void;
}

function statusValues(status: PersistentStateStatus) {
  return {
    loading: status.loading,
    saving: status.saving,
    error: status.error,
    retry: status.retry,
  };
}

export function useCosmicAmbiencePreference(): CosmicAmbiencePreferenceState {
  const options = React.useMemo(() => ({ parse: parseCosmicAmbiencePreference }), []);
  const [stored, setStored, status] = usePersistentState<CosmicAmbiencePreference>(
    COSMIC_AMBIENCE_PREFERENCE_KEY,
    DEFAULT_COSMIC_AMBIENCE_PREFERENCE,
    options,
  );
  const setEnabled = React.useCallback((enabled: boolean) => {
    if (typeof enabled !== 'boolean') return;
    setStored(current => ({ ...current, enabled }));
  }, [setStored]);
  const setVolume = React.useCallback((volume: number) => {
    if (typeof volume !== 'number' || !Number.isFinite(volume)) return;
    setStored(current => ({ ...current, volume: Math.min(1, Math.max(0, volume)) }));
  }, [setStored]);
  return {
    ...stored,
    ...statusValues(status),
    setEnabled,
    setVolume,
  };
}
