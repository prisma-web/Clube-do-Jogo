import test from 'node:test';
import assert from 'node:assert/strict';
import { GOTY_2026_CURATED_CATALOG, evaluate2026ReleaseEligibility } from '@clube-do-jogo/domain';

test('curated 2026 catalog only contains verified 2026 commercial releases', () => {
  assert.ok(GOTY_2026_CURATED_CATALOG.length >= 20);
  for (const game of GOTY_2026_CURATED_CATALOG) {
    assert.equal(game.is_eligible_2026, true, `${game.title} should be eligible for 2026`);
    assert.equal(game.effective_release_year, 2026, `${game.title} should have effective year 2026`);
    assert.notEqual(game.release_eligibility, 'ineligible');
  }
});

test('evaluate2026ReleaseEligibility rejects non-standalone DLC, ports, and alternative editions', () => {
  const now = Date.UTC(2026, 10, 23);
  const ts2026 = Math.floor(Date.UTC(2026, 4, 10) / 1000);

  // Port (game_type = 11)
  const port = evaluate2026ReleaseEligibility({ gameType: 11, firstReleaseDate: ts2026 }, 2026, now);
  assert.equal(port.eligible, false);

  // Version / Special Edition (version_parent != null)
  const edition = evaluate2026ReleaseEligibility({ gameType: 0, versionParent: 1234, firstReleaseDate: ts2026 }, 2026, now);
  assert.equal(edition.eligible, false);

  // Standalone expansion (game_type = 4)
  const standalone = evaluate2026ReleaseEligibility({ gameType: 4, versionParent: null, firstReleaseDate: ts2026 }, 2026, now);
  assert.equal(standalone.eligible, true);
  assert.equal(standalone.eligibility, 'standalone_expansion_2026');
});
