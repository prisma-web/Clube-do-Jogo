import assert from 'node:assert/strict';
import test from 'node:test';
import { ratingForScale, ratingFromScale } from './ratings';

test('converts stored ten-point ratings for display and back', () => {
  assert.equal(ratingForScale(8, 5), 4);
  assert.equal(ratingForScale(8, 10), 8);
  assert.equal(ratingFromScale(4, 5), 8);
  assert.equal(ratingFromScale(8, 10), 8);
});
