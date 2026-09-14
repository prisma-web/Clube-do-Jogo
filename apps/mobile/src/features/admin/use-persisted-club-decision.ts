import { useCallback, useMemo } from 'react';
import { usePersistentState } from '@/hooks/use-persistent-state';
import { nativeStorage, type NativeStorage } from '@/platform/storage';
import { useAppInternal } from '@/state/app-provider';
import type { ClubGameChangeResult, ClubGameUndoResult } from '@clube-do-jogo/data';

export type RecentDecision =
  | { kind: 'applied'; result: ClubGameChangeResult }
  | { kind: 'undone'; result: ClubGameUndoResult };

type StoredDecision = RecentDecision & { savedAt: number };

const MAX_DECISION_AGE_MS = 24 * 60 * 60 * 1000;

function storageKey(userId: string): string {
  return `@clube-do-jogo/admin-club-decision:${userId}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isValidAppliedResult(value: unknown): value is ClubGameChangeResult {
  if (!isPlainObject(value)) return false;
  return typeof value.month === 'string'
    && /^\d{4}-\d{2}$/.test(value.month)
    && typeof value.gameId === 'string'
    && (value.undoEventId === undefined || typeof value.undoEventId === 'string')
    && value.status === 'active'
    && (value.outcome === 'applied' || value.outcome === 'reconciled');
}

function isValidUndoneResult(value: unknown): value is ClubGameUndoResult {
  if (!isPlainObject(value)) return false;
  return (value.status === 'active' || value.status === 'removed')
    && typeof value.redoEventId === 'string'
    && (value.month === undefined || (typeof value.month === 'string' && /^\d{4}-\d{2}$/.test(value.month)))
    && (value.previousUndoEventId === undefined || typeof value.previousUndoEventId === 'string')
    && typeof value.redoExpiresAt === 'string'
    && Number.isFinite(Date.parse(value.redoExpiresAt))
    && (value.outcome === 'applied' || value.outcome === 'reconciled');
}

function isValidStoredDecision(value: unknown): value is StoredDecision {
  if (!isPlainObject(value)) return false;
  if (typeof value.savedAt !== 'number' || !Number.isFinite(value.savedAt)) return false;
  if (value.kind === 'applied') return isValidAppliedResult(value.result);
  if (value.kind === 'undone') return isValidUndoneResult(value.result);
  return false;
}

const memoryStorage: NativeStorage = {
  getItem: async () => null,
  setItem: async () => undefined,
  removeItem: async () => undefined,
};

function parseDecision(raw: string): StoredDecision | null {
  const parsed: unknown = JSON.parse(raw);
  if (parsed === null) return null;
  if (!isValidStoredDecision(parsed)) throw new Error('A última decisão salva é inválida.');
  const age = Date.now() - parsed.savedAt;
  return age >= 0 && age <= MAX_DECISION_AGE_MS ? parsed : null;
}

export function usePersistedClubDecision(userId: string | null, persist: boolean) {
  const { sessionEpoch } = useAppInternal();
  const key = persist && userId ? storageKey(userId) : `admin-decision-memory:${sessionEpoch}`;
  const options = useMemo(() => ({
    parse: parseDecision,
    storage: persist ? nativeStorage : memoryStorage,
    scope: false,
  }), [persist]);
  const [decision, setStored, status] = usePersistentState<StoredDecision | null>(key, null, options);
  const setDecision = useCallback((next: RecentDecision | null) => {
    setStored(next ? { ...next, savedAt: Date.now() } : null);
  }, [setStored]);
  return { decision, setDecision, storageError: Boolean(status.error), retry: status.retry };
}
