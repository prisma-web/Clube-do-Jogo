import { fetchReleaseProductUpdate, parseProductUpdate, type FetchJson, type ProductUpdate } from '@clube-do-jogo/domain';
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

/**
 * The notes of the installed version's GitHub release. A cached copy of that same version skips
 * GitHub; any failure resolves null, so the app shows nothing.
 */
export async function loadInstalledProductUpdate(source: UpdateSource, { storage, fetchJson }: {
  storage: NativeStorage;
  fetchJson: FetchJson;
}): Promise<ProductUpdate | null> {
  const tag = `v${formatSemver(source.installed)}`;
  const cached = await readCache(storage);
  if (cached?.id === tag) return cached;
  const update = await fetchReleaseProductUpdate(source.repo, tag, fetchJson);
  if (update) await storage.setItem(PRODUCT_UPDATE_CACHE_KEY, JSON.stringify(update)).catch(() => {});
  return update;
}
