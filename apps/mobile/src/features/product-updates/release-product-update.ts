import {
  androidProductUpdate,
  downloadProductUpdateHistory,
  githubReleasesUrl,
  parseProductUpdate,
  parseProductUpdateHistory,
  productUpdateDigest,
  productUpdateHistoryTags,
  productUpdateStorageKey,
  PRODUCT_UPDATE_HISTORY_ASSET,
  releaseAssetUrl,
  type Download,
  type FetchProductUpdate,
  type Parsed,
  type ProductUpdateDigest,
  type ProductUpdateHistory,
} from '@clube-do-jogo/domain';
import { formatSemver, parseSemver, type UpdateSource } from '../app-update/release';
import type { NativeStorage } from '../../platform/storage';

export const PRODUCT_UPDATE_CACHE_KEY = 'clube-do-jogo:product-update:release';
export const PRODUCT_UPDATE_HISTORY_CACHE_KEY = 'clube-do-jogo:product-update:history';
export const PRODUCT_UPDATE_LAST_SEEN_KEY = 'clube-do-jogo:product-update:last-seen';
export const PRODUCT_UPDATE_FROM_KEY = 'clube-do-jogo:product-update:from';

export interface ProductUpdateSource {
  releases: string;
  installed: string;
}

export interface InstalledProductUpdates {
  history: ProductUpdateHistory;
  installedBefore: string | null;
}

export function resolveProductUpdateSource({ updateSource, extra, installedVersion }: {
  updateSource: UpdateSource | null;
  extra: unknown;
  installedVersion: string | null;
}): ProductUpdateSource | null {
  if (updateSource) return { releases: githubReleasesUrl(updateSource.repo), installed: `v${formatSemver(updateSource.installed)}` };
  const releases = (extra as { productUpdates?: { releases?: unknown } } | null | undefined)?.productUpdates?.releases;
  const installed = parseSemver(installedVersion);
  if (typeof releases !== 'string' || !/^https?:\/\//.test(releases) || !installed) return null;
  return { releases: releases.replace(/\/+$/, ''), installed: `v${formatSemver(installed)}` };
}

async function readCache<T>(storage: NativeStorage, key: string, parse: (json: unknown) => Parsed<T>): Promise<T | null> {
  try {
    const raw = await storage.getItem(key);
    const parsed = raw === null ? null : parse(JSON.parse(raw));
    return parsed?.ok ? parsed.value : null;
  } catch {
    return null;
  }
}

function androidHistory(history: ProductUpdateHistory): ProductUpdateHistory {
  return { ...history, releases: history.releases.map(androidProductUpdate) };
}

export async function loadInstalledProductUpdates(source: ProductUpdateSource, { storage, fetch }: {
  storage: NativeStorage;
  fetch: FetchProductUpdate;
}): Promise<Download<InstalledProductUpdates>> {
  const legacy = (await readCache(storage, PRODUCT_UPDATE_CACHE_KEY, parseProductUpdate))?.id ?? null;
  const cached = await readCache(storage, PRODUCT_UPDATE_HISTORY_CACHE_KEY, parseProductUpdateHistory);
  const from = await storage.getItem(PRODUCT_UPDATE_FROM_KEY).catch(() => null);
  const previous = cached && cached.id !== source.installed ? cached.id : null;
  const installedBefore = from ?? legacy ?? previous;
  if (!from && installedBefore) await storage.setItem(PRODUCT_UPDATE_FROM_KEY, installedBefore).catch(() => {});
  if (cached?.id === source.installed) return { status: 'found', update: { history: androidHistory(cached), installedBefore } };
  const url = releaseAssetUrl(source.releases, source.installed, PRODUCT_UPDATE_HISTORY_ASSET);
  const result = await downloadProductUpdateHistory(url, source.installed, fetch);
  if (result.status !== 'found') return result;
  await storage.setItem(PRODUCT_UPDATE_HISTORY_CACHE_KEY, JSON.stringify(result.update)).catch(() => {});
  return { status: 'found', update: { history: androidHistory(result.update), installedBefore } };
}

export type SeenKey = (storageKey: string) => string;

export async function readProductUpdateDigest(
  { history, installedBefore }: InstalledProductUpdates,
  storage: NativeStorage,
  seenKey: SeenKey,
): Promise<ProductUpdateDigest> {
  const tags = productUpdateHistoryTags(history);
  const read = (key: string) => storage.getItem(seenKey(key)).catch(() => null);
  const [lastSeen, ...flags] = await Promise.all([read(PRODUCT_UPDATE_LAST_SEEN_KEY), ...tags.map(tag => read(productUpdateStorageKey(tag)))]);
  const seen = tags.filter((_, index) => flags[index] === 'true');
  return productUpdateDigest(history, { seen: lastSeen ? [...seen, lastSeen] : seen, installedBefore });
}

export async function markProductUpdateSeen(digest: ProductUpdateDigest, storage: NativeStorage, seenKey: SeenKey): Promise<void> {
  await storage.setItem(seenKey(productUpdateStorageKey(digest.id)), 'true');
  await storage.setItem(seenKey(PRODUCT_UPDATE_LAST_SEEN_KEY), digest.id);
  await storage.removeItem(PRODUCT_UPDATE_CACHE_KEY);
  await storage.removeItem(PRODUCT_UPDATE_FROM_KEY);
}

export interface AppStateEvents {
  addEventListener(type: 'change', listener: (state: string) => void): { remove(): void };
}

export interface InstalledProductUpdateStore<T> {
  get(): T | null;
  subscribe(listener: () => void): () => void;
}

export function createInstalledProductUpdateStore<T>(
  load: () => Promise<Download<T>>,
  appState: AppStateEvents,
): InstalledProductUpdateStore<T> {
  let phase: 'idle' | 'loading' | 'settled' = 'idle';
  let update: T | null = null;
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
