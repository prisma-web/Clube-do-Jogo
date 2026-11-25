import {
  androidProductUpdate,
  downloadProductUpdate,
  parseProductUpdate,
  productUpdateUrl,
  type FetchProductUpdate,
  type ProductUpdate,
  type ProductUpdateDownload,
} from '@clube-do-jogo/domain';
import { formatSemver, type UpdateSource } from '../app-update/release';
import type { NativeStorage } from '../../platform/storage';

export const PRODUCT_UPDATE_CACHE_KEY = 'clube-do-jogo:product-update:release';

async function readCache(storage: NativeStorage): Promise<ProductUpdate | null> {
  try {
    const raw = await storage.getItem(PRODUCT_UPDATE_CACHE_KEY);
    const parsed = raw === null ? null : parseProductUpdate(JSON.parse(raw));
    return parsed?.ok ? parsed.value : null;
  } catch {
    return null;
  }
}

export async function loadInstalledProductUpdate(source: UpdateSource, { storage, fetch }: {
  storage: NativeStorage;
  fetch: FetchProductUpdate;
}): Promise<ProductUpdateDownload> {
  const tag = `v${formatSemver(source.installed)}`;
  const cached = await readCache(storage);
  if (cached?.id === tag) return { status: 'found', update: androidProductUpdate(cached) };
  const result = await downloadProductUpdate(productUpdateUrl(source.repo, tag), tag, fetch);
  if (result.status !== 'found') return result;
  await storage.setItem(PRODUCT_UPDATE_CACHE_KEY, JSON.stringify(result.update)).catch(() => {});
  return { status: 'found', update: androidProductUpdate(result.update) };
}

export interface AppStateEvents {
  addEventListener(type: 'change', listener: (state: string) => void): { remove(): void };
}

export interface InstalledProductUpdateStore {
  get(): ProductUpdate | null;
  subscribe(listener: () => void): () => void;
}

export function createInstalledProductUpdateStore(
  load: () => Promise<ProductUpdateDownload>,
  appState: AppStateEvents,
): InstalledProductUpdateStore {
  let phase: 'idle' | 'loading' | 'settled' = 'idle';
  let update: ProductUpdate | null = null;
  let foreground: { remove(): void } | null = null;
  const listeners = new Set<() => void>();

  const refresh = () => {
    if (phase !== 'idle') return;
    phase = 'loading';
    load().then(result => {
      if (result.status === 'failed') {
        phase = 'idle';
        return;
      }
      phase = 'settled';
      update = result.status === 'found' ? result.update : null;
      listeners.forEach(listener => listener());
    }, () => {
      phase = 'idle';
    });
  };

  return {
    get: () => update,
    subscribe(listener) {
      listeners.add(listener);
      foreground ??= appState.addEventListener('change', state => {
        if (state === 'active') refresh();
      });
      refresh();
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        foreground?.remove();
        foreground = null;
      };
    },
  };
}
