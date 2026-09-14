import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { nativeStorage, type NativeStorage } from '../platform/storage';
import { identityScope } from './mobile-preferences-core';
import { getIdentitySnapshot, subscribeIdentity } from '../state/identity-scope';

type Listener = () => void;

export interface PersistentStateStatus {
  loading: boolean;
  saving: boolean;
  error: Error | null;
  retry(): void;
}

export type PersistentStateSetter<T> = (value: T | ((current: T) => T)) => void;

export interface PersistentStateStore<T> {
  get(): T;
  getStatus(): PersistentStateStatus;
  subscribe(listener: Listener): () => void;
  hydrate(): void;
  set(value: T | ((current: T) => T)): void;
  retry(): void;
}

export interface PersistentStateOptions<T> {
  storage?: NativeStorage;
  parse?(value: string): T;
  serialize?(value: T): string;
  /**
   * Whether the hook composes the key with the current identity (userId/isDemo/sessionEpoch
   * from AppProvider). Defaults to true. Set to false only when the caller already builds its
   * own identity-scoped key (e.g. an explicit target user id that differs from the signed-in
   * account), reusing `identityScope` from `mobile-preferences-core`.
   */
  scope?: boolean;
}

export function resolvePersistentStateKey(
  key: string,
  scoped: boolean,
  userId: string | null,
  isDemo: boolean,
  sessionEpoch: number,
): string {
  return scoped ? `${key}/${identityScope(userId, isDemo, sessionEpoch)}` : key;
}

function asError(value: unknown, fallback: string) {
  return value instanceof Error ? value : new Error(fallback);
}

export function createPersistentStateStore<T>(
  key: string,
  initial: T,
  options: PersistentStateOptions<T> = {},
): PersistentStateStore<T> {
  const storage = options.storage || nativeStorage;
  const parse = options.parse || ((value: string) => JSON.parse(value) as T);
  const serialize = options.serialize || ((value: T) => {
    const encoded = JSON.stringify(value);
    if (typeof encoded !== 'string') throw new Error('O estado não pôde ser serializado.');
    return encoded;
  });
  let value = initial;
  let hydrationStarted = false;
  let hydrationGeneration = 0;
  let writeVersion = 0;
  let latestValue = initial;
  let writeChain: Promise<void> = Promise.resolve();
  const listeners = new Set<Listener>();
  let status: PersistentStateStatus;
  const retryCallback = () => store.retry();
  const emit = () => listeners.forEach(listener => listener());
  const updateStatus = (patch: Partial<Omit<PersistentStateStatus, 'retry'>>) => {
    status = { ...status, ...patch, retry: retryCallback };
    emit();
  };
  const enqueueWrite = (next: T, version: number) => {
    let serialized: string;
    try {
      serialized = serialize(next);
    } catch (reason) {
      if (version === writeVersion) updateStatus({ saving: false, error: asError(reason, 'Não foi possível salvar a preferência.') });
      return;
    }
    updateStatus({ saving: true, error: null });
    const operation = writeChain.catch(() => undefined).then(() => storage.setItem(key, serialized));
    writeChain = operation;
    void operation.then(
      () => {
        if (version === writeVersion) updateStatus({ saving: false, error: null });
      },
      reason => {
        if (version === writeVersion) updateStatus({ saving: false, error: asError(reason, 'Não foi possível salvar a preferência.') });
      },
    );
  };
  const store: PersistentStateStore<T> = {
    get: () => value,
    getStatus: () => status,
    subscribe: listener => {
      const subscription = () => listener();
      listeners.add(subscription);
      return () => listeners.delete(subscription);
    },
    hydrate: () => {
      if (hydrationStarted) return;
      hydrationStarted = true;
      const generation = ++hydrationGeneration;
      updateStatus({ loading: true, error: null });
      void storage.getItem(key).then(
        stored => {
          if (generation !== hydrationGeneration) return;
          if (writeVersion > 0) {
            updateStatus({ loading: false });
            return;
          }
          if (stored !== null) {
            try {
              value = parse(stored);
              latestValue = value;
              emit();
              updateStatus({ loading: false, error: null });
              return;
            } catch (reason) {
              updateStatus({ loading: false, error: asError(reason, 'A preferência salva é inválida.') });
              return;
            }
          }
          updateStatus({ loading: false, error: null });
        },
        reason => {
          if (generation !== hydrationGeneration) return;
          hydrationStarted = false;
          updateStatus({ loading: false, error: asError(reason, 'Não foi possível carregar a preferência.') });
        },
      );
    },
    set: nextValue => {
      const next = typeof nextValue === 'function'
        ? (nextValue as (current: T) => T)(value)
        : nextValue;
      value = next;
      latestValue = next;
      const version = ++writeVersion;
      emit();
      enqueueWrite(next, version);
    },
    retry: () => {
      if (writeVersion > 0) {
        const version = ++writeVersion;
        enqueueWrite(latestValue, version);
        return;
      }
      hydrationStarted = false;
      store.hydrate();
    },
  };
  status = { loading: false, saving: false, error: null, retry: retryCallback };
  return store;
}

const cache = new Map<string, PersistentStateStore<unknown>>();

function cachedStore<T>(key: string, initial: T, options: PersistentStateOptions<T>) {
  const current = cache.get(key);
  if (current) return current as PersistentStateStore<T>;
  const created = createPersistentStateStore(key, initial, options);
  cache.set(key, created as PersistentStateStore<unknown>);
  return created;
}

export function usePersistentState<T>(
  key: string,
  initial: T,
  options: PersistentStateOptions<T> = {},
): [T, PersistentStateSetter<T>, PersistentStateStatus] {
  const identity = useSyncExternalStore(subscribeIdentity, getIdentitySnapshot, getIdentitySnapshot);
  const resolvedKey = resolvePersistentStateKey(key, options.scope !== false, identity.userId, identity.isDemo, identity.sessionEpoch);
  const store = useMemo(() => cachedStore(resolvedKey, initial, options), [initial, resolvedKey, options]);
  const subscribe = useCallback((listener: Listener) => store.subscribe(listener), [store]);
  const getValue = useCallback(() => store.get(), [store]);
  const getStatus = useCallback(() => store.getStatus(), [store]);
  const value = useSyncExternalStore(subscribe, getValue, getValue);
  const status = useSyncExternalStore(subscribe, getStatus, getStatus);
  useEffect(() => store.hydrate(), [store]);
  const update = useCallback<PersistentStateSetter<T>>(next => store.set(next), [store]);
  return [value, update, status];
}
