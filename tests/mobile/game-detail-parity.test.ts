import assert from 'node:assert/strict';
import { test } from 'node:test';
import { igdbRatingToTen, needsGameMediaRefresh } from '../../apps/mobile/src/features/media/game-media';
import { clampPan, clampZoom, containedSize, MAX_ZOOM, MIN_ZOOM } from '../../apps/mobile/src/features/media/gallery-zoom';
import { summarizeClubProgress } from '../../apps/mobile/src/features/progress/club-progress';

test('IGDB average rating (0–100) is normalized to the app 0–10 scale', () => {
  assert.equal(igdbRatingToTen(87), 8.7);
  assert.equal(igdbRatingToTen(0), 0);
  assert.equal(igdbRatingToTen(140), 10);
  assert.equal(igdbRatingToTen(-5), 0);
  assert.equal(igdbRatingToTen(null), null);
  assert.equal(igdbRatingToTen(undefined), null);
  assert.equal(igdbRatingToTen(Number.NaN), null);
});

test('media refresh only runs when screenshots, genres or platforms are missing', () => {
  const complete = { screenshot_urls: ['a', 'b', 'c'], genres: ['RPG'], platforms: ['PC'], platform_ids: [6] };
  assert.equal(needsGameMediaRefresh(complete), false);
  assert.equal(needsGameMediaRefresh({ ...complete, screenshot_urls: ['a', 'b'] }), true);
  assert.equal(needsGameMediaRefresh({ ...complete, screenshot_urls: undefined }), true);
  assert.equal(needsGameMediaRefresh({ ...complete, genres: [] }), true);
  assert.equal(needsGameMediaRefresh({ ...complete, platforms: undefined }), true);
  assert.equal(needsGameMediaRefresh({ ...complete, platform_ids: [] }), true);
  assert.equal(needsGameMediaRefresh(null), false);
});

test('gallery zoom stays within bounds', () => {
  assert.equal(clampZoom(0.2), MIN_ZOOM);
  assert.equal(clampZoom(9), MAX_ZOOM);
  assert.equal(clampZoom(1.554), 1.55);
  assert.equal(clampZoom(Number.NaN), MIN_ZOOM);
});

test('gallery pan is clamped to the zoomed image edges and resets at 1x', () => {
  const viewport = { width: 400, height: 600 };
  const landscape = { width: 1600, height: 900 }; // contained: 400 x 225
  assert.deepEqual(containedSize(viewport, landscape), { width: 400, height: 225 });
  assert.deepEqual(clampPan({ x: 300, y: 300 }, 1, viewport, landscape), { x: 0, y: 0 });
  // 2x: image is 800 x 450, overflows 200px per side horizontally, never vertically.
  assert.deepEqual(clampPan({ x: 500, y: 120 }, 2, viewport, landscape), { x: 200, y: 0 });
  assert.deepEqual(clampPan({ x: -500, y: -120 }, 2, viewport, landscape), { x: -200, y: 0 });
  // 3x: 1200 x 675 overflows 37.5px vertically.
  assert.deepEqual(clampPan({ x: 10, y: -100 }, 3, viewport, landscape), { x: 10, y: -37.5 });
  // Unknown image size falls back to the viewport.
  assert.deepEqual(clampPan({ x: 999, y: 999 }, 2, viewport, null), { x: 200, y: 300 });
});

test('club progress summary counts finishers and ratings behind the average', () => {
  const summary = summarizeClubProgress([
    { status: 'finished', rating: 8 },
    { status: 'finished', rating: null },
    { status: 'started', rating: 6 },
    { status: 'not_started', rating: null },
  ]);
  assert.deepEqual(summary, { finishedCount: 2, ratingCount: 2, clubAverage: 7 });
  assert.deepEqual(summarizeClubProgress([]), { finishedCount: 0, ratingCount: 0, clubAverage: null });
});
