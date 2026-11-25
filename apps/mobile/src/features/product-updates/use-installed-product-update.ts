import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { androidProductUpdate, type ProductUpdate, type ProductUpdateDownload } from '@clube-do-jogo/domain';
import { updateSource } from '@/features/app-update/apk-update';
import type { UpdateSource } from '@/features/app-update/release';
import { nativeStorage } from '@/platform/storage';
import { createInstalledProductUpdateStore, loadInstalledProductUpdate } from './release-product-update';

function onForeground(callback: () => void) {
  const subscription = AppState.addEventListener('change', state => {
    if (state === 'active') callback();
  });
  return () => subscription.remove();
}

function storeFor(source: UpdateSource) {
  return createInstalledProductUpdateStore(async (): Promise<ProductUpdateDownload> => {
    const result = await loadInstalledProductUpdate(source, { storage: nativeStorage, fetch });
    return result.status === 'found' ? { status: 'found', update: androidProductUpdate(result.update) } : result;
  }, onForeground);
}

const store = updateSource ? storeFor(updateSource) : null;
const noUpdate = () => null;
const noSubscription = () => () => {};

/** The installed version's notes. Null until loaded, and on development, preview and iOS builds. */
export function useInstalledProductUpdate(): ProductUpdate | null {
  return useSyncExternalStore(store?.subscribe ?? noSubscription, store?.get ?? noUpdate, store?.get ?? noUpdate);
}
