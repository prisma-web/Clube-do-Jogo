import type { CosmicSceneMode } from './audio-controller';

// Mirrors the web's src/lib/cosmic-backdrop.ts: the Fogueira Cósmica backdrop remembers whether
// the user last chose the hearth or the spaceflight scene. Unlike the web (one browser profile),
// the key is identity-scoped by usePersistentState (account vs demo + userId), the same scope
// mobile-preferences-core uses, so a demo session never inherits a signed-in account's choice.
export const COSMIC_BACKDROP_PREFERENCE_KEY = '@clube-do-jogo/mobile/cosmic-backdrop';
export const DEFAULT_COSMIC_BACKDROP_MODE: CosmicSceneMode = 'hearth';

export function normalizeCosmicBackdropMode(value: unknown): CosmicSceneMode {
  return value === 'spaceflight' ? 'spaceflight' : 'hearth';
}

export function parseCosmicBackdropMode(value: string): CosmicSceneMode {
  try {
    return normalizeCosmicBackdropMode(JSON.parse(value));
  } catch {
    // Accept a bare (non-JSON) value too, the way the web stores it in localStorage.
    return normalizeCosmicBackdropMode(value);
  }
}
