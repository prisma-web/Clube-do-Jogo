import { useEffect, useSyncExternalStore } from 'react';
import { androidProductUpdate, type ProductUpdate } from '@clube-do-jogo/domain';
import { updateSource } from '@/features/app-update/apk-update';
import { nativeStorage } from '@/platform/storage';
import { loadInstalledProductUpdate } from './release-product-update';

let installed: ProductUpdate | null = null;
let started = false;
const listeners = new Set<() => void>();

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

function load() {
  if (started || !updateSource) return;
  started = true;
  void loadInstalledProductUpdate(updateSource, { storage: nativeStorage, fetchJson }).then(update => {
    installed = update && androidProductUpdate(update);
    listeners.forEach(listener => listener());
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getInstalled = () => installed;

/** The installed version's notes, loaded once per launch. Null until loaded, and on development, preview and iOS builds. */
export function useInstalledProductUpdate(): ProductUpdate | null {
  useEffect(load, []);
  return useSyncExternalStore(subscribe, getInstalled, getInstalled);
}
