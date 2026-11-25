import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RewardGrant } from '@clube-do-jogo/domain';
import { DEMO_REVIEW_THEME_IDS, resolveUnlockedThemeIds } from '../../apps/mobile/src/state/demo-themes';

const oriGrant = {
  id: 'grant-ori',
  reward: { kind: 'theme', theme_id: 'ori' },
} as unknown as RewardGrant;

test('demo libera crossing e cosmic-campfire além do Ori, como a web', () => {
  const ids = resolveUnlockedThemeIds([oriGrant], true);
  assert.ok(ids.includes('ori'));
  for (const id of DEMO_REVIEW_THEME_IDS) assert.ok(ids.includes(id));
  assert.equal(new Set(ids).size, ids.length);
});

test('conta real só libera temas recebidos como recompensa', () => {
  assert.deepEqual(resolveUnlockedThemeIds([oriGrant], false), ['ori']);
  assert.deepEqual(resolveUnlockedThemeIds([], false), []);
});
