import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import type { ProductUpdate } from '@clube-do-jogo/domain';
import { updateSource } from '@/features/app-update/apk-update';
import { nativeStorage } from '@/platform/storage';
import { createInstalledProductUpdateStore, loadInstalledProductUpdate } from './release-product-update';

const source = updateSource;
const store = source
  ? createInstalledProductUpdateStore(() => loadInstalledProductUpdate(source, { storage: nativeStorage, fetch }), AppState)
  : null;
const noUpdate = () => null;
const noSubscription = () => () => {};

/** The installed version's notes. Null until loaded, and on development, preview and iOS builds. */
export function useInstalledProductUpdate(): ProductUpdate | null {
  return useSyncExternalStore(store?.subscribe ?? noSubscription, store?.get ?? noUpdate, store?.get ?? noUpdate);
}
