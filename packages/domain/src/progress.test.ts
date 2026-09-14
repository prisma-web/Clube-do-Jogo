import assert from 'node:assert/strict';
import test from 'node:test';
import { transitionProgress } from './progress';
import type { StoredProgress } from './progress';

const existing: StoredProgress = {
  status: 'started',
  rating: 8,
  rating_mode: 'detailed',
  rating_details: { graphics: 9, story: 8 },
  started_at: '2025-01-04T10:00:00.000Z',
  finished_at: null,
};

test('finishing preserves start data and records finish time', () => {
  assert.deepEqual(
    transitionProgress(existing, 'finished', '2025-01-10T10:00:00.000Z'),
    {
      ...existing,
      status: 'finished',
      finished_at: '2025-01-10T10:00:00.000Z',
    },
  );
});

test('reopening clears the previous finish date', () => {
  assert.deepEqual(
    transitionProgress({ ...existing, status: 'finished', finished_at: '2025-01-10T10:00:00.000Z' }, 'started', '2025-01-11T10:00:00.000Z'),
    {
      ...existing,
      status: 'started',
      finished_at: null,
    },
  );
});

test('resetting progress clears dates, rating, and details', () => {
  assert.deepEqual(transitionProgress(existing, 'not_started', '2025-01-11T10:00:00.000Z'), {
    status: 'not_started',
    rating: null,
    rating_mode: 'simple',
    rating_details: null,
    started_at: null,
    finished_at: null,
  });
});
