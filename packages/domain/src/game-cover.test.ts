import assert from 'node:assert/strict';
import test from 'node:test';
import { gameCoverUrl } from './game-cover';

test('a stored cover is displayed exactly as stored', () => {
  assert.equal(
    gameCoverUrl('https://images.igdb.com/igdb/image/upload/t_cover_big/co65ac.jpg'),
    'https://images.igdb.com/igdb/image/upload/t_cover_big/co65ac.jpg',
  );
});

test('a game without art falls back to the placeholder cover', () => {
  assert.equal(gameCoverUrl(null), 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&q=80');
  assert.equal(gameCoverUrl(undefined), 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&q=80');
  assert.equal(gameCoverUrl(''), 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&q=80');
  assert.equal(gameCoverUrl('   '), 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&q=80');
});
