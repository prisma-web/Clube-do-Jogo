import type { ApiResponse } from '@clube-do-jogo/data';
import { downloadProductUpdate, productUpdateUrl, RELEASES_REPO } from '@clube-do-jogo/domain';

const SETTLED = 'public, s-maxage=3600, stale-while-revalidate=86400';
const FAILED = 'public, s-maxage=60';

export async function GET() {
  const result = await downloadProductUpdate(productUpdateUrl(RELEASES_REPO, 'latest'), null, (url, init) =>
    fetch(url, { ...init, cache: 'no-store' }));
  return Response.json(
    { update: result.status === 'found' ? result.update : null } satisfies ApiResponse<'productUpdate'>,
    { headers: { 'Cache-Control': result.status === 'failed' ? FAILED : SETTLED } },
  );
}
