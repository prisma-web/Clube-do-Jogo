import type { CosmicSceneMode } from './audio-controller';

export const COSMIC_BACKDROP_PREFERENCE_KEY = '@clube-do-jogo/mobile/cosmic-backdrop';
export const DEFAULT_COSMIC_BACKDROP_MODE: CosmicSceneMode = 'hearth';

export function normalizeCosmicBackdropMode(value: unknown): CosmicSceneMode {
  return value === 'spaceflight' ? 'spaceflight' : 'hearth';
}

export function parseCosmicBackdropMode(value: string): CosmicSceneMode {
  try {
    return normalizeCosmicBackdropMode(JSON.parse(value));
  } catch {
    return normalizeCosmicBackdropMode(value);
  }
}
