import type { Game } from './types';
import { isThemeId, type ThemeId } from './themes';

export type RewardKind = 'theme';
export type RewardEligibility = 'finished' | 'all_members';

export interface ClubReward {
  id: string;
  club_month: string;
  code: string;
  kind: RewardKind;
  name: string;
  description: string | null;
  theme_id: string | null;
  image_url: string | null;
  eligibility?: RewardEligibility;
}

export interface RewardGrant {
  id: string;
  reward_id: string;
  granted_at: string;
  seen_at: string | null;
  reward: ClubReward & {
    cycle?: {
      month: string;
      game?: Pick<Game, 'title' | 'image_url'> | null;
    } | null;
  };
}

export function isRewardEligibility(value: unknown): value is RewardEligibility {
  return value === 'finished' || value === 'all_members';
}

export function themeIdFromReward(
  reward: Pick<ClubReward, 'kind' | 'theme_id'> | null | undefined,
): ThemeId | null {
  return reward?.kind === 'theme' && isThemeId(reward.theme_id) ? reward.theme_id : null;
}

export function unlockedThemeIds(grants: readonly RewardGrant[]): ThemeId[] {
  const unlocked = new Set<ThemeId>();
  for (const grant of grants) {
    const themeId = themeIdFromReward(grant.reward);
    if (themeId) unlocked.add(themeId);
  }
  return [...unlocked];
}
