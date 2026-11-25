import assert from 'node:assert/strict';
import test from 'node:test';
import {
  demoGames,
  gameDescriptionPreview,
  gameDescriptionText,
  gameDescriptionFallback,
  type Game,
} from './index';

const gameWithoutDescription: Game = { ...demoGames[0], description: null };

test('a game without description shows the fallback and never offers "Ver mais"', () => {
  assert.deepEqual(gameDescriptionPreview(gameWithoutDescription.description, 150), {
    text: gameDescriptionFallback,
    hasMore: false,
  });
  assert.equal(gameDescriptionText(undefined), gameDescriptionFallback);
  assert.equal(gameDescriptionText('   '), gameDescriptionFallback);
});

test('a short description is shown as is', () => {
  assert.deepEqual(gameDescriptionPreview('Um roguelike.', 150), { text: 'Um roguelike.', hasMore: false });
});

test('"Ver mais" appears only past the threshold', () => {
  assert.equal(gameDescriptionPreview('a'.repeat(150), 150).hasMore, false);
  assert.equal(gameDescriptionPreview('a'.repeat(151), 150).hasMore, true);
});

test('every demo game has a description', () => {
  for (const game of demoGames) assert.ok(gameDescriptionText(game.description) !== gameDescriptionFallback, game.id);
});
