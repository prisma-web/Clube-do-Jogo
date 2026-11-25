import { apiRoutes, type ApiResponse, type Unvalidated } from '@clube-do-jogo/data';
import { parseProductUpdate, type ProductUpdate } from '@clube-do-jogo/domain';

/** The latest release's notes from /api/product-update, or null when it has none or the request fails. */
export async function fetchLatestProductUpdate(): Promise<ProductUpdate | null> {
  try {
    const response = await fetch(apiRoutes.productUpdate.path);
    if (!response.ok) return null;
    const parsed = parseProductUpdate(((await response.json()) as Unvalidated<ApiResponse<'productUpdate'>>).update);
    return parsed.ok ? parsed.value : null;
  } catch {
    return null;
  }
}
