import type { RewardGrant, ThemeId } from '@clube-do-jogo/domain';
import { unlockedThemeIds } from '@clube-do-jogo/domain';

export const DEMO_REVIEW_THEME_IDS: readonly ThemeId[] = ['crossing', 'cosmic-campfire'];

export function resolveUnlockedThemeIds(grants: readonly RewardGrant[], isDemo: boolean): ThemeId[] {
  const ids = unlockedThemeIds(grants);
  if (isDemo) for (const id of DEMO_REVIEW_THEME_IDS) if (!ids.includes(id)) ids.push(id);
  return ids;
}
