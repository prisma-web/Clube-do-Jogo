import assert from 'node:assert/strict';
import test from 'node:test';
import { monthKey, shiftMonth } from './dates';

test('shifts December into January', () => {
  assert.equal(shiftMonth('2024-12', 1), '2025-01');
  assert.equal(shiftMonth('2025-01', -1), '2024-12');
});

test('uses the club timezone when deriving a month', () => {
  assert.equal(monthKey(new Date('2025-01-01T02:59:59.000Z')), '2024-12');
  assert.equal(monthKey(new Date('2025-01-01T03:00:00.000Z')), '2025-01');
});
