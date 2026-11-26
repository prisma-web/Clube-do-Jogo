import { apiRoutes, type ApiResponse, type Unvalidated } from '@clube-do-jogo/data';
import {
  parseProductUpdate,
  parseProductUpdateHistory,
  productUpdateDigest,
  productUpdateSeenTag,
  productUpdateStorageKey,
  type ProductUpdateDigest,
  type ProductUpdateHistory,
} from '@clube-do-jogo/domain';

export async function fetchProductUpdateHistory(): Promise<ProductUpdateHistory | null> {
  try {
    const response = await fetch(apiRoutes.productUpdate.path);
    if (!response.ok) return null;
    const body = (await response.json()) as Unvalidated<ApiResponse<'productUpdate'>>;
    const history = parseProductUpdateHistory(body.history);
    if (history.ok) return history.value;
    const update = parseProductUpdate(body.update);
    return update.ok ? { id: update.value.id, releases: [update.value] } : null;
  } catch {
    return null;
  }
}

function seenTags(): string[] {
  try {
    return Object.keys(window.localStorage).flatMap(key => {
      const tag = productUpdateSeenTag(key);
      return tag && window.localStorage.getItem(key) === 'true' ? [tag] : [];
    });
  } catch {
    return [];
  }
}

export function readProductUpdateDigest(history: ProductUpdateHistory): ProductUpdateDigest {
  return productUpdateDigest(history, { seen: seenTags() });
}

export function markProductUpdateSeen(digest: ProductUpdateDigest) {
  try {
    window.localStorage.setItem(productUpdateStorageKey(digest.id), 'true');
  } catch {
  }
}
