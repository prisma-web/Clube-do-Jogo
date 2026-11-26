import { useEffect, useSyncExternalStore } from 'react';

const priority = ['reward', 'product-update', 'voting-deck'] as const;
export type AutoModal = (typeof priority)[number];

export function nextAutoModalHolder(holder: AutoModal | null, wanting: ReadonlySet<AutoModal>): AutoModal | null {
  if (holder && wanting.has(holder)) return holder;
  return priority.find(modal => wanting.has(modal)) ?? null;
}

const wanting = new Set<AutoModal>();
const listeners = new Set<() => void>();
let holder: AutoModal | null = null;

function settle() {
  holder = nextAutoModalHolder(holder, wanting);
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getHolder = () => holder;

export function useAutoModalTurn(modal: AutoModal, wants: boolean): boolean {
  useEffect(() => {
    if (!wants) return;
    wanting.add(modal);
    settle();
    return () => {
      wanting.delete(modal);
      settle();
    };
  }, [modal, wants]);
  return useSyncExternalStore(subscribe, getHolder, getHolder) === modal && wants;
}
