import * as React from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { LocalNote } from '@clube-do-jogo/domain';
import { nativeStorage } from '@/platform';
import { useAppInternal } from './app-provider';
import { notesCacheKey, parseNotesCache, serializeNotesCache, type NotesOfflineCache } from './notes-offline-cache';

// Writes for one cache key land in the order they were issued, so an older list can never
// overwrite a newer one. Separate from draftWrites: this key holds server data, not user input.
const cacheWrites = new Map<string, Promise<void>>();

function enqueueCacheWrite(key: string, write: () => Promise<void>) {
  const previous = cacheWrites.get(key) || Promise.resolve();
  const next = previous.catch(() => undefined).then(write);
  cacheWrites.set(key, next);
  void next.finally(() => {
    if (cacheWrites.get(key) === next) cacheWrites.delete(key);
  }).catch(() => undefined);
  return next;
}

export interface NotesOfflineCacheState {
  /** Last server-confirmed list for this account/game, or null when none was saved. */
  cache: NotesOfflineCache | null;
  loading: boolean;
}

/**
 * Persists every successful notes read and exposes the last one, so PrivateNotes can show the
 * synced notes when the server does not answer (offline, paused query, or error).
 */
export function useNotesOfflineCache(
  gameId: string,
  snapshotMonth: string | null,
  query: UseQueryResult<LocalNote[], Error>,
): NotesOfflineCacheState {
  const { userId, isDemo, sessionEpoch } = useAppInternal();
  const key = userId && gameId ? notesCacheKey(userId, isDemo, sessionEpoch, gameId, snapshotMonth) : null;
  const [state, setState] = React.useState<{ key: string; cache: NotesOfflineCache | null } | null>(null);

  React.useEffect(() => {
    if (!key || !userId) return undefined;
    let cancelled = false;
    void (cacheWrites.get(key) || Promise.resolve()).catch(() => undefined).then(() => nativeStorage.getItem(key)).then(
      value => {
        if (cancelled) return;
        setState({ key, cache: parseNotesCache(value, { gameId, userId }) });
      },
      () => {
        if (!cancelled) setState({ key, cache: null });
      },
    );
    return () => { cancelled = true; };
  }, [gameId, key, userId]);

  const { data, dataUpdatedAt, isSuccess } = query;
  React.useEffect(() => {
    if (!key || !isSuccess || !data) return;
    // Only persisted here: PrivateNotes reads the cache only while the query has no data, and React
    // Query keeps the last data across later errors, so the in-memory copy never needs updating.
    const serialized = serializeNotesCache(data, new Date(dataUpdatedAt || Date.now()).toISOString());
    void enqueueCacheWrite(key, () => nativeStorage.setItem(key, serialized)).catch(() => undefined);
  }, [data, dataUpdatedAt, isSuccess, key]);

  return {
    cache: state && state.key === key ? state.cache : null,
    loading: Boolean(key) && state?.key !== key,
  };
}
