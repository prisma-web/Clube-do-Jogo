import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldShowDateSeparator } from '../../apps/mobile/src/features/notes/date-grouping';

test('shows a separator for the first note regardless of timestamp', () => {
  assert.equal(shouldShowDateSeparator(undefined, '2026-09-10T12:00:00.000Z'), true);
});

test('does not show a separator when two notes fall on the same Fortaleza day', () => {
  assert.equal(shouldShowDateSeparator('2026-09-09T22:00:00.000Z', '2026-09-09T23:30:00.000Z'), false);
});

test('shows a separator when the Fortaleza calendar day changes', () => {
  assert.equal(shouldShowDateSeparator('2026-09-10T02:30:00.000Z', '2026-09-10T13:00:00.000Z'), true);
});

test('does not show a separator when UTC dates differ but the Fortaleza day is the same', () => {
  assert.equal(shouldShowDateSeparator('2026-09-09T23:59:00.000Z', '2026-09-10T01:00:00.000Z'), false);
});
