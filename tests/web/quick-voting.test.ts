import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pendingGames } from '../../src/lib/quick-voting';
import type { RankingItem } from '../../src/lib/types';

function item(id: string, day: number, votedByMe = false) {
  return { game: { id }, addedAt: `2026-11-${String(day).padStart(2, '0')}`, votedByMe } as unknown as RankingItem;
}

const games = Array.from({ length: 10 }, (_, index) => item(`game-${index + 1}`, index + 1));
const ids = (items: readonly RankingItem[]) => items.map(entry => entry.game.id);

test('shows the newest eight unanswered games', () => {
  assert.deepEqual(ids(pendingGames(games, [])), ['game-10', 'game-9', 'game-8', 'game-7', 'game-6', 'game-5', 'game-4', 'game-3']);
});

test('games reviewed as neutral make room for older pending games', () => {
  const neutral = ['game-10', 'game-9', 'game-8', 'game-7', 'game-6', 'game-5', 'game-4', 'game-3'];
  assert.deepEqual(ids(pendingGames(games, neutral)), ['game-2', 'game-1']);
});

test('games with a vote are not pending', () => {
  assert.deepEqual(ids(pendingGames([item('voted', 5, true), item('open', 4)], [])), ['open']);
});
