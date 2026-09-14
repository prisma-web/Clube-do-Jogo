import type { RecentDecision } from './use-persisted-club-decision';

export function canContinueUndoChain(decision: RecentDecision): boolean {
  return decision.kind === 'undone' && Boolean(decision.result.previousUndoEventId);
}
