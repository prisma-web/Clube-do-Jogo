import { parseProductUpdate, type ProductUpdate } from '@clube-do-jogo/domain';

/** The latest release's notes from /api/product-update, or null when it has none or the request fails. */
export async function fetchLatestProductUpdate(): Promise<ProductUpdate | null> {
  try {
    const response = await fetch('/api/product-update');
    if (!response.ok) return null;
    const parsed = parseProductUpdate(((await response.json()) as { update?: unknown }).update);
    return parsed.ok ? parsed.value : null;
  } catch {
    return null;
  }
}
