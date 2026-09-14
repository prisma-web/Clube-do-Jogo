'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { createClient } from '../lib/supabase/client';

const PREFIX = 'clube-do-jogo:view:';
const CHANGE_EVENT = 'clube-do-jogo:stored-view-change';
const SCOPE_EVENT = 'clube-do-jogo:view-scope-change';

export const ANONYMOUS_SCOPE = 'anonymous';

export function scopeFromUserId(userId: string | null | undefined): string {
  return userId || ANONYMOUS_SCOPE;
}

export function buildStorageKey(scope: string, key: string): string {
  return `${PREFIX}${scope}:${key}`;
}

export interface ViewStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readStoredValue<T>(storage: ViewStorage, scope: string, key: string, fallback: T): T {
  const raw = storage.getItem(buildStorageKey(scope, key));
  if (raw === null) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function writeStoredValue<T>(
  storage: ViewStorage,
  scope: string,
  key: string,
  fallback: T,
  next: T | ((current: T) => T),
): T {
  const current = readStoredValue(storage, scope, key, fallback);
  const resolved = typeof next === 'function' ? (next as (current: T) => T)(current) : next;
  storage.setItem(buildStorageKey(scope, key), JSON.stringify(resolved));
  return resolved;
}

let scope: string = ANONYMOUS_SCOPE;
let scopeTrackingStarted = false;

function startScopeTracking() {
  if (scopeTrackingStarted || typeof window === 'undefined') return;
  scopeTrackingStarted = true;
  const supabase = createClient();
  const applyScope = (userId: string | null | undefined) => {
    const next = scopeFromUserId(userId);
    if (next === scope) return;
    scope = next;
    window.dispatchEvent(new Event(SCOPE_EVENT));
  };
  void supabase.auth.getSession().then(({ data }) => applyScope(data.session?.user?.id));
  supabase.auth.onAuthStateChange((_event, session) => applyScope(session?.user?.id));
}

function subscribe(listener: () => void) {
  startScopeTracking();
  window.addEventListener('storage', listener);
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener(SCOPE_EVENT, listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener(SCOPE_EVENT, listener);
  };
}

export function usePersistentState<T>(key: string, fallback: T) {
  const raw = useSyncExternalStore(
    subscribe,
    () => window.localStorage.getItem(buildStorageKey(scope, key)),
    () => null,
  );
  let value = fallback;
  if (raw !== null) {
    try { value = JSON.parse(raw) as T; } catch { value = fallback; }
  }
  const setValue = useCallback((next: T | ((current: T) => T)) => {
    writeStoredValue(window.localStorage, scope, key, fallback, next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, [fallback, key]);
  return [value, setValue] as const;
}
