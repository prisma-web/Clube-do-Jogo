import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldShowDateSeparator } from '../../apps/mobile/src/features/notes/date-grouping';

test('shows a separator for the first note regardless of timestamp', () => {
  assert.equal(shouldShowDateSeparator(undefined, '2026-09-10T12:00:00.000Z'), true);
});

test('does not show a separator when two notes fall on the same Fortaleza day', () => {
  // 23:30 UTC on the 9th is still 20:30 in America/Fortaleza (UTC-3) on the same day.
  assert.equal(shouldShowDateSeparator('2026-09-09T22:00:00.000Z', '2026-09-09T23:30:00.000Z'), false);
});

test('shows a separator when the Fortaleza calendar day changes', () => {
  // 02:30 UTC on the 10th is 23:30 in America/Fortaleza on the 9th, one Fortaleza day
  // before 13:00 UTC on the 10th (10:00 in America/Fortaleza on the 10th).
  assert.equal(shouldShowDateSeparator('2026-09-10T02:30:00.000Z', '2026-09-10T13:00:00.000Z'), true);
});

test('does not show a separator when UTC dates differ but the Fortaleza day is the same', () => {
  // 01:00 UTC on the 10th is 22:00 in America/Fortaleza on the 9th, same Fortaleza day as
  // 23:59 UTC on the 9th (20:59 in America/Fortaleza on the 9th).
  assert.equal(shouldShowDateSeparator('2026-09-09T23:59:00.000Z', '2026-09-10T01:00:00.000Z'), false);
});
