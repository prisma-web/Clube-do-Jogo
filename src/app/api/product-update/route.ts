import type { ApiResponse } from '@clube-do-jogo/data';
import {
  downloadProductUpdate,
  downloadProductUpdateHistory,
  githubReleasesUrl,
  PRODUCT_UPDATE_ASSET,
  PRODUCT_UPDATE_HISTORY_ASSET,
  releaseAssetUrl,
  RELEASES_REPO,
  type Download,
  type FetchProductUpdate,
  type ProductUpdateHistory,
} from '@clube-do-jogo/domain';

const SETTLED = 'public, s-maxage=3600, stale-while-revalidate=86400';
const FAILED = 'public, s-maxage=60';

const download: FetchProductUpdate = (url, init) => fetch(url, { ...init, cache: 'no-store' });

async function latestHistory(): Promise<Download<ProductUpdateHistory>> {
  const releases = githubReleasesUrl(RELEASES_REPO);
  const history = await downloadProductUpdateHistory(releaseAssetUrl(releases, 'latest', PRODUCT_UPDATE_HISTORY_ASSET), null, download);
  if (history.status !== 'missing') return history;
  const single = await downloadProductUpdate(releaseAssetUrl(releases, 'latest', PRODUCT_UPDATE_ASSET), null, download);
  return single.status === 'found' ? { status: 'found', update: { id: single.update.id, releases: [single.update] } } : single;
}

export async function GET() {
  const result = await latestHistory();
  const history = result.status === 'found' ? result.update : null;
  const update = history?.releases.find(release => release.id === history.id) ?? null;
  return Response.json(
    { history, update } satisfies ApiResponse<'productUpdate'>,
    { headers: { 'Cache-Control': result.status === 'failed' ? FAILED : SETTLED } },
  );
}
