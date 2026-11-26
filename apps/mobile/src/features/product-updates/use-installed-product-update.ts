import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { updateSource } from '@/features/app-update/apk-update';
import { nativeStorage } from '@/platform/storage';
import {
  createInstalledProductUpdateStore,
  loadInstalledProductUpdates,
  resolveProductUpdateSource,
  type InstalledProductUpdates,
} from './release-product-update';

const source = resolveProductUpdateSource({
  updateSource,
  extra: Constants.expoConfig?.extra,
  installedVersion: Application.nativeApplicationVersion,
});
const store = source
  ? createInstalledProductUpdateStore(() => loadInstalledProductUpdates(source, { storage: nativeStorage, fetch }), AppState)
  : null;
const nothing = () => null;
const noSubscription = () => () => {};

export function useInstalledProductUpdates(): InstalledProductUpdates | null {
  return useSyncExternalStore(store?.subscribe ?? noSubscription, store?.get ?? nothing, store?.get ?? nothing);
}
