import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canContinueUndoChain } from '../../apps/mobile/src/features/admin/club-undo-chain';
import type { RecentDecision } from '../../apps/mobile/src/features/admin/use-persisted-club-decision';

const appliedDecision: RecentDecision = {
  kind: 'applied',
  result: { month: '2026-09', gameId: 'game-1', status: 'active', undoEventId: 'event-1', outcome: 'applied' },
};

function undoneDecision(previousUndoEventId: string | undefined): RecentDecision {
  return {
    kind: 'undone',
    result: {
      month: '2026-08',
      status: 'active',
      redoEventId: 'event-2',
      previousUndoEventId,
      redoExpiresAt: '2026-09-10T00:05:00.000Z',
      outcome: 'applied',
    },
  };
}

test('offers to continue the undo chain only while an earlier event is still available', () => {
  assert.equal(canContinueUndoChain(undoneDecision('event-1')), true);
  assert.equal(canContinueUndoChain(undoneDecision(undefined)), false);
});

test('never offers to continue the chain for a freshly applied decision', () => {
  assert.equal(canContinueUndoChain(appliedDecision), false);
});
