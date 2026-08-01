'use client';

import { useCallback, useSyncExternalStore } from 'react';

const PREFIX = 'clube-do-jogo:view:';
const CHANGE_EVENT = 'clube-do-jogo:stored-view-change';

function subscribe(listener: () => void) {
  window.addEventListener('storage', listener);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}

export function usePersistentState<T>(key: string, fallback: T) {
  const storageKey = `${PREFIX}${key}`;
  const raw = useSyncExternalStore(
    subscribe,
    () => window.localStorage.getItem(storageKey),
    () => null,
  );
  let value = fallback;
  if (raw !== null) {
    try { value = JSON.parse(raw) as T; } catch { value = fallback; }
  }
  const setValue = useCallback((next: T | ((current: T) => T)) => {
    let current = fallback;
    const saved = window.localStorage.getItem(storageKey);
    if (saved !== null) {
      try { current = JSON.parse(saved) as T; } catch { current = fallback; }
    }
    const resolved = typeof next === 'function' ? (next as (current: T) => T)(current) : next;
    window.localStorage.setItem(storageKey, JSON.stringify(resolved));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, [fallback, storageKey]);
  return [value, setValue] as const;
}
