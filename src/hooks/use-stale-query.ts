'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type CacheEntry = { data: unknown; updatedAt: number };
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

export async function prefetchStaleQuery<T>(key: string, fetcher: () => Promise<T>, staleTime = 60_000) {
  const current = cache.get(key);
  if (current && Date.now() - current.updatedAt < staleTime) return current.data as T;
  let request = inflight.get(key) as Promise<T> | undefined;
  if (!request) {
    request = fetcher();
    inflight.set(key, request);
  }
  try {
    const data = await request;
    cache.set(key, { data, updatedAt: Date.now() });
    return data;
  } finally {
    inflight.delete(key);
  }
}

export function useStaleQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  enabled = true,
  options: { staleTime?: number } = {},
) {
  const staleTime = options.staleTime ?? 30_000;
  const cached = cache.get(key);
  const [data, setData] = useState<T | undefined>(cached?.data as T | undefined);
  const [isInitialLoading, setIsInitialLoading] = useState(enabled && cached === undefined);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const fetcherRef = useRef(fetcher);

  useEffect(() => { fetcherRef.current = fetcher; });

  const load = useCallback(async (force: boolean) => {
    if (!enabled) return;
    const current = cache.get(key);
    if (!force && current && Date.now() - current.updatedAt < staleTime) {
      setData(current.data as T);
      setIsInitialLoading(false);
      setIsRefreshing(false);
      return;
    }
    setIsInitialLoading(!current);
    setIsRefreshing(Boolean(current));
    try {
      const next = await prefetchStaleQuery(key, fetcherRef.current, force ? 0 : staleTime);
      setData(next);
      setError(null);
    } catch (value) {
      setError(value instanceof Error ? value : new Error('Não foi possível atualizar os dados.'));
    } finally {
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  }, [enabled, key, staleTime]);

  const refresh = useCallback(() => load(true), [load]);

  const setQueryData = useCallback((next: T) => {
    cache.set(key, { data: next, updatedAt: Date.now() });
    setData(next);
  }, [key]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      const nextCached = cache.get(key);
      setData(nextCached?.data as T | undefined);
      setIsInitialLoading(enabled && !nextCached);
      void load(false);
    });
    return () => { cancelled = true; };
  }, [enabled, key, load]);

  return { data, isInitialLoading, isRefreshing, error, refresh, setData: setQueryData };
}
