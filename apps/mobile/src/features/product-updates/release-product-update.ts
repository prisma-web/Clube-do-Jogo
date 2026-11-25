import {
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

/** The notes of the installed version's GitHub release. A cached copy of that same version skips the download. */
export async function loadInstalledProductUpdate(source: UpdateSource, { storage, fetch }: {
  storage: NativeStorage;
  fetch: FetchProductUpdate;
}): Promise<ProductUpdateDownload> {
  const tag = `v${formatSemver(source.installed)}`;
  const cached = await readCache(storage);
  if (cached?.id === tag) return { status: 'found', update: cached };
  const result = await downloadProductUpdate(productUpdateUrl(source.repo, tag), tag, fetch);
  if (result.status === 'found') await storage.setItem(PRODUCT_UPDATE_CACHE_KEY, JSON.stringify(result.update)).catch(() => {});
  return result;
}

export interface InstalledProductUpdateStore {
  get(): ProductUpdate | null;
  subscribe(listener: () => void): () => void;
}

/**
 * Loads the installed version's notes once its first subscriber arrives. A failed load runs again
 * on the next return to the foreground; found or missing notes settle it for the rest of the
 * process, which only ever runs one installed version.
 */
export function createInstalledProductUpdateStore(
  load: () => Promise<ProductUpdateDownload>,
  onForeground: (callback: () => void) => () => void,
): InstalledProductUpdateStore {
  let phase: 'idle' | 'loading' | 'settled' = 'idle';
  let update: ProductUpdate | null = null;
  let stopForeground: (() => void) | null = null;
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
      stopForeground ??= onForeground(refresh);
      refresh();
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        stopForeground?.();
        stopForeground = null;
      };
    },
  };
}
