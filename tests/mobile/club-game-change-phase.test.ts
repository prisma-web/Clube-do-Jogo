import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Game } from '../../packages/domain/src/types';
import { initialPhaseFor } from '../../apps/mobile/src/features/admin/club-game-change-phase';

const game: Game = {
  id: 'game-1',
  title: 'Hades',
  duration_hours: 20,
  description: 'Roguelike',
  image_url: 'https://example.com/hades.jpg',
};

test('opens straight into choose-mode when a game is preselected', () => {
  assert.deepEqual(initialPhaseFor(game), { step: 'choose-mode', game });
});

test('falls back to the search step when no game is preselected', () => {
  assert.deepEqual(initialPhaseFor(undefined), { step: 'pick-game' });
});
