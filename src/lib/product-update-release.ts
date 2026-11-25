import { fetchReleaseProductUpdate, RELEASES_REPO, type ProductUpdate } from '@clube-do-jogo/domain';

// GitHub allows 60 unauthenticated API requests an hour per IP; an hour of Next data cache keeps the site far below it.
const REVALIDATE_SECONDS = 3600;

/** The notes of the latest GitHub release, or null on any failure. Server only. */
export function loadLatestProductUpdate(fetchImpl: typeof fetch = fetch): Promise<ProductUpdate | null> {
  return fetchReleaseProductUpdate(RELEASES_REPO, 'latest', async url => {
    const response = await fetchImpl(url, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    return response.json();
  });
}
