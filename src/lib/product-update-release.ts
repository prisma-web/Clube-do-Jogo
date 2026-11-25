import { downloadProductUpdate, productUpdateUrl, RELEASES_REPO, type ProductUpdate } from '@clube-do-jogo/domain';

// New notes reach the site within an hour. Next only caches successful responses, so a failure is retried on the next render.
// Next drops the timeout signal when it refreshes a stale entry in the background, which never holds up a page.
const REVALIDATE_SECONDS = 3600;

/** The notes of the latest GitHub release, or null on any failure. Server only. */
export async function loadLatestProductUpdate(fetchImpl: typeof fetch = fetch): Promise<ProductUpdate | null> {
  const result = await downloadProductUpdate(productUpdateUrl(RELEASES_REPO, 'latest'), null, (url, init) =>
    fetchImpl(url, { ...init, next: { revalidate: REVALIDATE_SECONDS } }));
  return result.status === 'found' ? result.update : null;
}
