import AsyncStorage from '@react-native-async-storage/async-storage';

export interface NativeStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export function createNativeStorage(adapter: NativeStorage): NativeStorage {
  return {
    getItem: key => adapter.getItem(key),
    setItem: (key, value) => adapter.setItem(key, value),
    removeItem: key => adapter.removeItem(key),
  };
}

export const nativeStorage: NativeStorage = createNativeStorage({
  getItem: key => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: key => AsyncStorage.removeItem(key),
});
