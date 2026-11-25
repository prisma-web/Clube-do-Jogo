import { downloadProductUpdate, productUpdateUrl, RELEASES_REPO } from '@clube-do-jogo/domain';

// The CDN answers for an hour, "no notes" included, and for a day more while it refreshes in the background.
// A failed download is retried after a minute. The download skips Next's data cache, whose stale entries
// lose the timeout when they refresh during a build.
const SETTLED = 'public, s-maxage=3600, stale-while-revalidate=86400';
const FAILED = 'public, s-maxage=60';

/** `{ update }`: the notes of the latest GitHub release, or null when it has none or GitHub fails. */
export async function GET() {
  const result = await downloadProductUpdate(productUpdateUrl(RELEASES_REPO, 'latest'), null, (url, init) =>
    fetch(url, { ...init, cache: 'no-store' }));
  return Response.json(
    { update: result.status === 'found' ? result.update : null },
    { headers: { 'Cache-Control': result.status === 'failed' ? FAILED : SETTLED } },
  );
}
