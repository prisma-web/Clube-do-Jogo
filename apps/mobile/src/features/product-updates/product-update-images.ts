import type { ImageSourcePropType } from 'react-native';
import explore from '../../../../../public/updates/v1.1/explore.webp';
import favorites from '../../../../../public/updates/v1.1/favorites.webp';
import library from '../../../../../public/updates/v1.1/library.webp';
import progress from '../../../../../public/updates/v1.1/progress.webp';
import ranking from '../../../../../public/updates/v1.1/ranking.webp';
import reactions from '../../../../../public/updates/v1.1/reactions.webp';
import recent from '../../../../../public/updates/v1.1/recent.webp';
import settings from '../../../../../public/updates/v1.1/settings.webp';

// Step screenshots are shared with the web app: the domain references them by their
// public URL, and Metro needs a static require, so they are resolved here by that path.
const updateImages: Record<string, { source: ImageSourcePropType; aspectRatio: number }> = {
  '/updates/v1.1/explore.webp': { source: explore, aspectRatio: 860 / 500 },
  '/updates/v1.1/favorites.webp': { source: favorites, aspectRatio: 860 / 500 },
  '/updates/v1.1/library.webp': { source: library, aspectRatio: 860 / 500 },
  '/updates/v1.1/progress.webp': { source: progress, aspectRatio: 860 / 600 },
  '/updates/v1.1/ranking.webp': { source: ranking, aspectRatio: 860 / 500 },
  '/updates/v1.1/reactions.webp': { source: reactions, aspectRatio: 860 / 500 },
  '/updates/v1.1/recent.webp': { source: recent, aspectRatio: 860 / 500 },
  '/updates/v1.1/settings.webp': { source: settings, aspectRatio: 860 / 500 },
};

export function productUpdateImage(src: string) {
  return updateImages[src] ?? null;
}
