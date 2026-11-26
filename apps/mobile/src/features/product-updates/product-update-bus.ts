import { useSyncExternalStore } from 'react';
import type { ProductUpdateDigest } from '@clube-do-jogo/domain';

type Listener = () => void;

let openRequests = 0;
let digest: ProductUpdateDigest | null = null;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach(listener => listener());
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function requestProductUpdateReopen(): void {
  openRequests += 1;
  notify();
}

export function getProductUpdateReopenSignal(): number {
  return openRequests;
}

export const subscribeProductUpdateReopen = subscribe;

export function publishProductUpdateDigest(next: ProductUpdateDigest | null): void {
  if (digest === next) return;
  digest = next;
  notify();
}

const getDigest = () => digest;

export function useProductUpdateDigest(): ProductUpdateDigest | null {
  return useSyncExternalStore(subscribe, getDigest, getDigest);
}
