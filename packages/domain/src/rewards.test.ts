import assert from 'node:assert/strict';
import test from 'node:test';
import { isRewardEligibility, themeIdFromReward, unlockedThemeIds, type RewardGrant } from './rewards';

function grant(themeId: string | null, kind: 'theme' = 'theme'): RewardGrant {
  return {
    id: `grant-${themeId || kind}`,
    reward_id: 'reward-1',
    granted_at: '2026-09-10T10:00:00.000Z',
    seen_at: null,
    reward: {
      id: 'reward-1', club_month: '2026-09', code: 'test', kind, name: 'Teste', description: null, theme_id: themeId, image_url: null,
    },
  };
}

test('recognizes server eligibility values without deciding eligibility locally', () => {
  assert.equal(isRewardEligibility('finished'), true);
  assert.equal(isRewardEligibility('all_members'), true);
  assert.equal(isRewardEligibility('started'), false);
  assert.equal(isRewardEligibility(null), false);
});

test('derives only known theme unlocks and deduplicates grants', () => {
  assert.equal(themeIdFromReward({ kind: 'theme', theme_id: 'ori' }), 'ori');
  assert.equal(themeIdFromReward({ kind: 'theme', theme_id: 'not-a-theme' }), null);
  assert.equal(themeIdFromReward({ kind: 'other', theme_id: 'ori' } as Pick<RewardGrant['reward'], 'kind' | 'theme_id'>), null);
  assert.deepEqual(unlockedThemeIds([
    grant('ori'), grant('ori'), grant('cosmic-campfire'), grant(null), grant('crossing', 'theme'),
  ]), ['ori', 'cosmic-campfire', 'crossing']);
});
