'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

const URL_CHANGE_EVENT = 'clube-do-jogo:url-change';
const OVERLAY_KEYS = ['modal', 'item', 'action', 'modalTab', 'source', 'image'] as const;

type UrlPatch = Record<string, string | number | null | undefined>;
type OverlayHistoryState = {
  __clubeOverlayId?: string;
  __clubeOverlayDepth?: number;
};

function subscribe(listener: () => void) {
  window.addEventListener('popstate', listener);
  window.addEventListener(URL_CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener(URL_CHANGE_EVENT, listener);
  };
}

function getSnapshot() {
  return window.location.href;
}

function emitUrlChange() {
  window.dispatchEvent(new Event(URL_CHANGE_EVENT));
}

function patchUrl(patch: UrlPatch) {
  const url = new URL(window.location.href);
  Object.entries(patch).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') url.searchParams.delete(key);
    else url.searchParams.set(key, String(value));
  });
  return `${url.pathname}${url.search}${url.hash}`;
}

function pushUrl(patch: UrlPatch, state: Record<string, unknown> = {}) {
  const next = patchUrl(patch);
  if (next === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
  window.history.pushState({ ...window.history.state, ...state }, '', next);
  emitUrlChange();
}

function replaceUrl(patch: UrlPatch) {
  window.history.replaceState(window.history.state, '', patchUrl(patch));
  emitUrlChange();
}

export function useUrlParams() {
  const href = useSyncExternalStore(subscribe, getSnapshot, () => '');
  return useMemo(() => {
    if (!href) return new URLSearchParams();
    return new URL(href).searchParams;
  }, [href]);
}

export function useUrlTab<T extends string>(key: string, values: readonly T[], fallback: T) {
  const params = useUrlParams();
  const candidate = params.get(key);
  const value = values.includes(candidate as T) ? candidate as T : fallback;
  const setValue = useCallback((next: T) => {
    if (next === value) return;
    pushUrl({ [key]: next === fallback ? null : next }, { __clubeAppNavigation: true });
  }, [fallback, key, value]);
  return [value, setValue] as const;
}

export function useUrlDialog(id: string, match: Record<string, string> = {}) {
  const params = useUrlParams();
  const matches = params.get('modal') === id && Object.entries(match).every(([key, value]) => params.get(key) === value);

  const show = useCallback((extra: UrlPatch = {}) => {
    const clean = Object.fromEntries(OVERLAY_KEYS.map(key => [key, null]));
    const overlayId = crypto.randomUUID();
    pushUrl({ ...clean, modal: id, ...match, ...extra }, { __clubeOverlayId: overlayId, __clubeOverlayDepth: 1, __clubeAppNavigation: true });
  }, [id, match]);

  const close = useCallback(() => {
    const state = window.history.state as OverlayHistoryState | null;
    if (state?.__clubeOverlayId && state.__clubeOverlayDepth) {
      window.history.go(-state.__clubeOverlayDepth);
      return;
    }
    replaceUrl(Object.fromEntries(OVERLAY_KEYS.map(key => [key, null])));
  }, []);

  const setParam = useCallback((key: string, value: string | number | null) => {
    const state = window.history.state as OverlayHistoryState | null;
    pushUrl({ [key]: value }, state?.__clubeOverlayId ? {
      __clubeOverlayId: state.__clubeOverlayId,
      __clubeOverlayDepth: (state.__clubeOverlayDepth || 1) + 1,
      __clubeAppNavigation: true,
    } : { __clubeAppNavigation: true });
  }, []);

  return {
    open: matches,
    show,
    close,
    getParam: (key: string) => params.get(key),
    setParam,
  };
}
