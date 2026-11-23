import assert from 'node:assert/strict';
import test from 'node:test';
import {
  availableUpdate,
  compareSemver,
  parseLatestRelease,
  parseSemver,
  resolveUpdateSource,
  type Release,
} from '../../apps/mobile/src/features/app-update/release';
import { downloadPercent, idleFlow, updateFlowReducer, type UpdateFlow } from '../../apps/mobile/src/features/app-update/update-flow';

const REPO = 'prisma-web/Clube-do-Jogo';
const apkUrl = 'https://github.com/prisma-web/Clube-do-Jogo/releases/download/v1.2.0/clube-do-jogo-v1.2.0.apk';

function githubRelease(overrides: Record<string, unknown> = {}) {
  return {
    tag_name: 'v1.2.0',
    draft: false,
    prerelease: false,
    body: 'Votação mais rápida.',
    assets: [
      { name: 'checksums.txt', browser_download_url: 'https://github.com/x/y/releases/download/v1.2.0/checksums.txt', size: 120 },
      { name: 'clube-do-jogo-v1.2.0.apk', browser_download_url: apkUrl, size: 61_000_000 },
    ],
    ...overrides,
  };
}

function release(tag = 'v1.2.0'): Release {
  const parsed = parseLatestRelease(githubRelease({ tag_name: tag }), REPO);
  assert.ok(parsed, `release fixture ${tag} should parse`);
  return parsed;
}

function semver(raw: string) {
  const parsed = parseSemver(raw);
  assert.ok(parsed, `${raw} should parse`);
  return parsed;
}

test('parses the latest GitHub release into its version, notes and APK asset', () => {
  assert.deepEqual(parseLatestRelease(githubRelease(), REPO), {
    tag: 'v1.2.0',
    version: { major: 1, minor: 2, patch: 0 },
    notes: 'Votação mais rápida.',
    apk: { name: 'clube-do-jogo-v1.2.0.apk', url: apkUrl, size: 61_000_000 },
  });
});

test('a release without notes parses with empty notes', () => {
  assert.equal(parseLatestRelease(githubRelease({ body: null }), REPO)?.notes, '');
});

test('offers the update when the release is newer than the installed version', () => {
  const update = availableUpdate(release('v1.2.0'), semver('1.1.9'));
  assert.equal(update?.release.tag, 'v1.2.0');
  assert.deepEqual(update?.installed, { major: 1, minor: 1, patch: 9 });
});

test('compares versions numerically, not as text', () => {
  assert.equal(compareSemver(semver('0.10.0'), semver('0.9.0')), 1);
  assert.equal(compareSemver(semver('1.0.0'), semver('1.0.0')), 0);
  assert.equal(compareSemver(semver('1.0.2'), semver('1.0.10')), -1);
  assert.ok(availableUpdate(release('v0.10.0'), semver('0.9.0')));
});

test('offers nothing when the installed version is the release or newer', () => {
  assert.equal(availableUpdate(release('v1.2.0'), semver('1.2.0')), null);
  assert.equal(availableUpdate(release('v1.2.0'), semver('1.3.0')), null);
  assert.equal(availableUpdate(release('v1.2.0'), semver('2.0.0')), null);
});

test('rejects tags that are not vX.Y.Z', () => {
  for (const tag of ['1.2.0', 'v1.2', 'v1.2.0-beta.1', 'v01.2.0', 'latest', 12]) {
    assert.equal(parseLatestRelease(githubRelease({ tag_name: tag }), REPO), null, String(tag));
  }
});

test('rejects a release that has no APK asset', () => {
  const assets = [{ name: 'checksums.txt', browser_download_url: 'https://github.com/x/y/checksums.txt', size: 1 }];
  assert.equal(parseLatestRelease(githubRelease({ assets }), REPO), null);
  assert.equal(parseLatestRelease(githubRelease({ assets: [] }), REPO), null);
  assert.equal(parseLatestRelease(githubRelease({ assets: undefined }), REPO), null);
});

test('rejects an APK asset that is not served over https', () => {
  const assets = [{ name: 'app.apk', browser_download_url: 'http://example.com/app.apk', size: 1 }];
  assert.equal(parseLatestRelease(githubRelease({ assets }), REPO), null);
});

test('ignores prereleases and drafts', () => {
  assert.equal(parseLatestRelease(githubRelease({ prerelease: true }), REPO), null);
  assert.equal(parseLatestRelease(githubRelease({ draft: true }), REPO), null);
});

test('rejects payloads that are not a release', () => {
  for (const payload of [null, undefined, 'v1.2.0', [], { message: 'Not Found' }]) {
    assert.equal(parseLatestRelease(payload, REPO), null, JSON.stringify(payload));
  }
});

test('update checks run only on Android builds that ship the production apkUpdates config', () => {
  const production = { repo: 'prisma-web/Clube-do-Jogo' };
  assert.deepEqual(resolveUpdateSource({ os: 'android', apkUpdates: production, installedVersion: '1.1.0' }), {
    repo: 'prisma-web/Clube-do-Jogo',
    installed: { major: 1, minor: 1, patch: 0 },
  });
  assert.equal(resolveUpdateSource({ os: 'ios', apkUpdates: production, installedVersion: '1.1.0' }), null);
  assert.equal(resolveUpdateSource({ os: 'android', apkUpdates: undefined, installedVersion: '1.1.0' }), null);
  assert.equal(resolveUpdateSource({ os: 'android', apkUpdates: { repo: 'not a repo' }, installedVersion: '1.1.0' }), null);
  assert.equal(resolveUpdateSource({ os: 'android', apkUpdates: production, installedVersion: null }), null);
  assert.equal(resolveUpdateSource({ os: 'android', apkUpdates: production, installedVersion: '1.1' }), null);
});

function availableFlow(): UpdateFlow {
  const update = availableUpdate(release('v1.2.0'), semver('1.1.0'));
  return updateFlowReducer(idleFlow, { type: 'checked', update });
}

test('a check that finds a newer release shows it; one that finds none hides the modal', () => {
  const shown = availableFlow();
  assert.equal(shown.phase, 'available');
  assert.equal(updateFlowReducer(shown, { type: 'checked', update: null }).phase, 'idle');
});

test('"Depois" hides the modal and the next open shows it again', () => {
  const shown = availableFlow();
  const later = updateFlowReducer(shown, { type: 'dismissed' });
  assert.equal(later.phase, 'idle');
  assert.ok(shown.phase === 'available');
  assert.equal(updateFlowReducer(later, { type: 'checked', update: shown.update }).phase, 'available');
});

test('"Atualizar" downloads with progress and then hands off to the installer', () => {
  let flow = updateFlowReducer(availableFlow(), { type: 'accepted' });
  assert.deepEqual(flow.phase === 'downloading' && flow.percent, 0);
  flow = updateFlowReducer(flow, { type: 'progressed', percent: 42 });
  assert.deepEqual(flow.phase === 'downloading' && flow.percent, 42);
  flow = updateFlowReducer(flow, { type: 'installerOpened' });
  assert.equal(flow.phase, 'installing');
});

test('a foreground check never interrupts a download in progress', () => {
  const downloading = updateFlowReducer(availableFlow(), { type: 'accepted' });
  assert.equal(updateFlowReducer(downloading, { type: 'checked', update: null }), downloading);
});

test('a foreground check keeps the installer step, and closing the installer offers the update again', () => {
  const shown = availableFlow();
  assert.ok(shown.phase === 'available');
  const installing = updateFlowReducer(updateFlowReducer(shown, { type: 'accepted' }), { type: 'installerOpened' });
  assert.equal(updateFlowReducer(installing, { type: 'checked', update: shown.update }), installing);
  assert.equal(updateFlowReducer(installing, { type: 'installerClosed' }).phase, 'available');
});

test('a failed download shows the error, and retrying downloads again', () => {
  const failed = updateFlowReducer(updateFlowReducer(availableFlow(), { type: 'accepted' }), { type: 'failed' });
  assert.equal(failed.phase, 'error');
  assert.equal(updateFlowReducer(failed, { type: 'accepted' }).phase, 'downloading');
  assert.equal(updateFlowReducer(failed, { type: 'dismissed' }).phase, 'idle');
});

test('late events from a cancelled download leave the modal closed', () => {
  const cancelled = updateFlowReducer(updateFlowReducer(availableFlow(), { type: 'accepted' }), { type: 'dismissed' });
  for (const event of [{ type: 'progressed', percent: 80 }, { type: 'installerOpened' }, { type: 'installerClosed' }, { type: 'failed' }] as const) {
    assert.equal(updateFlowReducer(cancelled, event), cancelled);
  }
});

test('repeated progress at the same percent keeps the same state, so the modal does not re-render', () => {
  const downloading = updateFlowReducer(updateFlowReducer(availableFlow(), { type: 'accepted' }), { type: 'progressed', percent: 10 });
  assert.equal(updateFlowReducer(downloading, { type: 'progressed', percent: 10 }), downloading);
});

test('download percent falls back to the release asset size when the server omits Content-Length', () => {
  assert.equal(downloadPercent({ bytesWritten: 50, totalBytes: 200 }, 1000), 25);
  assert.equal(downloadPercent({ bytesWritten: 500, totalBytes: -1 }, 1000), 50);
  assert.equal(downloadPercent({ bytesWritten: 999, totalBytes: 1000 }, 1000), 99);
  assert.equal(downloadPercent({ bytesWritten: 2000, totalBytes: -1 }, 1000), 100);
  assert.equal(downloadPercent({ bytesWritten: 10, totalBytes: -1 }, 0), 0);
});

test('ignores APK assets that are not downloads from the configured repo releases', () => {
  for (const url of [
    'https://evil.example.com/clube-do-jogo.apk',
    'https://github.com/someone-else/fork/releases/download/v1.2.0/clube-do-jogo-v1.2.0.apk',
    'http://github.com/prisma-web/Clube-do-Jogo/releases/download/v1.2.0/clube-do-jogo-v1.2.0.apk',
  ]) {
    const assets = [{ name: 'clube-do-jogo-v1.2.0.apk', browser_download_url: url, size: 1 }];
    assert.equal(parseLatestRelease(githubRelease({ assets }), REPO), null, url);
  }
});

test('a foreground check leaves a download error on screen', () => {
  const failed = updateFlowReducer(updateFlowReducer(availableFlow(), { type: 'accepted' }), { type: 'failed' });
  assert.equal(failed.phase, 'error');
  assert.equal(updateFlowReducer(failed, { type: 'checked', update: null }), failed);
});
