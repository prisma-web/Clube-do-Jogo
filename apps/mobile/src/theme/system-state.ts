import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, AppState, type AppStateStatus } from 'react-native';

type Listener = () => void;

function createStore<T>(initial: T, bind: (set: (value: T) => void) => () => void) {
  let value = initial;
  let unbind: (() => void) | null = null;
  const listeners = new Set<Listener>();
  const set = (next: T) => {
    if (next === value) return;
    value = next;
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => value,
    subscribe(listener: Listener) {
      listeners.add(listener);
      if (!unbind) unbind = bind(set);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && unbind) {
          unbind();
          unbind = null;
        }
      };
    },
  };
}

const reduceMotionStore = createStore(false, set => {
  let active = true;
  AccessibilityInfo.isReduceMotionEnabled()
    .then(enabled => {
      if (active) set(enabled);
    })
    .catch(() => undefined);
  const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', set);
  return () => {
    active = false;
    subscription.remove();
  };
});

const appActiveStore = createStore(AppState.currentState === 'active', set => {
  set(AppState.currentState === 'active');
  const subscription = AppState.addEventListener('change', (status: AppStateStatus) => set(status === 'active'));
  return () => subscription.remove();
});

export function useSystemReduceMotion(): boolean {
  return useSyncExternalStore(reduceMotionStore.subscribe, reduceMotionStore.getSnapshot);
}

export function useAppActive(): boolean {
  return useSyncExternalStore(appActiveStore.subscribe, appActiveStore.getSnapshot);
}
