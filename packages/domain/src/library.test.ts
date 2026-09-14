import assert from 'node:assert/strict';
import test from 'node:test';
import { selectLibraryGames, type LibrarySelection } from './library';
import type { Game, LibraryGame, ProgressStatus } from './types';

function item(
  id: string,
  title: string,
  options: {
    duration?: number;
    rating?: number | null;
    platforms?: number[] | null;
    status?: ProgressStatus;
    favorite?: boolean;
    updatedAt?: string | null;
  } = {},
): LibraryGame {
  const game: Game = {
    id,
    title,
    duration_hours: options.duration ?? 10,
    average_rating: options.rating === undefined ? 80 : options.rating,
    image_url: '',
    description: '',
    platform_ids: options.platforms,
  };
  return {
    game,
    inBacklog: true,
    favorite: options.favorite ?? false,
    progress: options.status
      ? { status: options.status, rating: null, rating_mode: 'simple', rating_details: null, started_at: null, finished_at: null }
      : null,
    addedAt: options.updatedAt ?? null,
    updatedAt: options.updatedAt ?? null,
  };
}

function selection(overrides: Partial<LibrarySelection> = {}): LibrarySelection {
  return {
    quickFilter: 'all',
    text: '',
    sortMode: 'updated_desc',
    playableOnly: false,
    shortOnly: false,
    ratedOnly: false,
    ...overrides,
  };
}

test('applies status, text, platform, duration, and rating filters with legacy metadata', () => {
  const library = [
    item('switch-started', 'Aventura Switch', { duration: 10, rating: 90, platforms: [130], status: 'started', favorite: true }),
    item('pc-finished', 'Aventura PC', { duration: 10, rating: 90, platforms: [6], status: 'finished' }),
    item('unknown', 'Aventura antiga', { duration: 10, rating: null, platforms: null, status: 'started' }),
    item('empty-platforms', 'Aventura sem plataforma', { duration: 10, rating: 90, platforms: [], status: 'started' }),
    item('long', 'Aventura longa', { duration: 13, rating: 90, platforms: [130], status: 'started' }),
  ];
  const result = selectLibraryGames(library, selection({
    quickFilter: 'started',
    text: 'aventura',
    sortMode: 'title_asc',
    playableOnly: true,
    shortOnly: true,
    ratedOnly: true,
  }), new Set([130]));

  assert.deepEqual(result.map(item => item.game.id), ['empty-platforms', 'switch-started']);
  const legacyResult = selectLibraryGames(library, selection({
    quickFilter: 'started',
    text: 'aventura',
    sortMode: 'title_asc',
    playableOnly: true,
  }), new Set([130]));
  assert.deepEqual(legacyResult.map(item => item.game.id), ['unknown', 'long', 'empty-platforms', 'switch-started']);
  assert.deepEqual(library.map(item => item.game.id), ['switch-started', 'pc-finished', 'unknown', 'empty-platforms', 'long']);
});

test('preserves current ordering modes and stable input order for ties', () => {
  const library = [
    item('older-z', 'Zeta', { duration: 20, rating: 70, updatedAt: '2025-01-01' }),
    item('newer-a', 'Alpha', { duration: 5, rating: 95, updatedAt: '2025-02-01' }),
    item('same-title-first', 'Mesmo', { duration: 10, rating: 80, updatedAt: '2025-03-01' }),
    item('same-title-second', 'Mesmo', { duration: 10, rating: 80, updatedAt: '2025-03-01' }),
  ];

  assert.deepEqual(selectLibraryGames(library, selection({ sortMode: 'updated_desc' }), new Set()).map(item => item.game.id), ['same-title-first', 'same-title-second', 'newer-a', 'older-z']);
  assert.deepEqual(selectLibraryGames(library, selection({ sortMode: 'updated_asc' }), new Set()).map(item => item.game.id), ['older-z', 'newer-a', 'same-title-first', 'same-title-second']);
  assert.deepEqual(selectLibraryGames(library, selection({ sortMode: 'title_asc' }), new Set()).map(item => item.game.id), ['newer-a', 'same-title-first', 'same-title-second', 'older-z']);
  assert.deepEqual(selectLibraryGames(library, selection({ sortMode: 'title_desc' }), new Set()).map(item => item.game.id), ['older-z', 'same-title-first', 'same-title-second', 'newer-a']);
  assert.deepEqual(selectLibraryGames(library, selection({ sortMode: 'duration_asc' }), new Set()).map(item => item.game.id), ['newer-a', 'same-title-first', 'same-title-second', 'older-z']);
  assert.deepEqual(selectLibraryGames(library, selection({ sortMode: 'duration_desc' }), new Set()).map(item => item.game.id), ['older-z', 'same-title-first', 'same-title-second', 'newer-a']);
  assert.deepEqual(selectLibraryGames(library, selection({ sortMode: 'rating_desc' }), new Set()).map(item => item.game.id), ['newer-a', 'same-title-first', 'same-title-second', 'older-z']);
  assert.deepEqual(selectLibraryGames(library, selection({ sortMode: 'rating_asc' }), new Set()).map(item => item.game.id), ['older-z', 'same-title-first', 'same-title-second', 'newer-a']);
});

test('keeps unrated games at the legacy edge of rating order', () => {
  const library = [
    item('rated-low', 'Nota baixa', { rating: 60 }),
    item('unrated-first', 'Sem nota A', { rating: null }),
    item('unrated-second', 'Sem nota B', { rating: null }),
    item('rated-high', 'Nota alta', { rating: 95 }),
  ];

  assert.deepEqual(selectLibraryGames(library, selection({ sortMode: 'rating_desc' }), new Set()).map(item => item.game.id), ['rated-high', 'rated-low', 'unrated-first', 'unrated-second']);
  assert.deepEqual(selectLibraryGames(library, selection({ sortMode: 'rating_asc' }), new Set()).map(item => item.game.id), ['rated-low', 'rated-high', 'unrated-first', 'unrated-second']);
});
