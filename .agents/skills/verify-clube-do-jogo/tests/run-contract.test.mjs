import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, utimesSync, existsSync, readFileSync, symlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'clube-verification-'));
  const helper = join(root, '.agents/skills/verify-clube-do-jogo/scripts/verify-clube-do-jogo.mjs');
  mkdirSync(join(root, '.agents/skills/verify-clube-do-jogo/scripts'), { recursive: true });
  copyFileSync(new URL('../scripts/verify-clube-do-jogo.mjs', import.meta.url), helper);
  const paths = id => ({
    stateDir: join(root, 'state/verify-clube-do-jogo', id),
    evidenceDir: join(root, 'evidence/verify-clube-do-jogo', id),
  });
  const writeManifest = (id, data, evidence = true) => {
    const target = paths(id);
    mkdirSync(target.stateDir, { recursive: true });
    mkdirSync(target.evidenceDir, { recursive: true });
    const value = { runId: id, ...data };
    writeFileSync(join(target.stateDir, 'manifest.json'), `${JSON.stringify(value, null, 2)}\n`);
    if (evidence) writeFileSync(join(target.evidenceDir, 'manifest.json'), `${JSON.stringify(value, null, 2)}\n`);
    return value;
  };
  const initGit = () => {
    const setup = [
      ['git', ['init', '-q']],
      ['git', ['config', 'user.email', 'verification@example.test']],
      ['git', ['config', 'user.name', 'Verification Test']],
    ];
    for (const [command, args] of setup) {
      const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    }
    writeFileSync(join(root, '.gitignore'), '/state/\n/evidence/\n/bin/\n/node_modules/\n/env-capture.json\n/leader.js\n/orphan-pid\n');
    writeFileSync(join(root, 'fixture.txt'), 'fixture\n');
    for (const args of [['add', '.gitignore', 'fixture.txt', '.agents'], ['commit', '-qm', 'fixture']]) {
      const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    }
    const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const run = (...args) => spawnSync(process.execPath, [helper, ...args], { encoding: 'utf8', cwd: root });
  const runEnv = (env, ...args) => spawnSync(process.execPath, [helper, ...args], { encoding: 'utf8', cwd: root, env });
  return { root, helper, paths, writeManifest, initGit, run, runEnv, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function processSnapshot(pid) {
  const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
  const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
  const bootId = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
  return { pgid: Number(fields[2]), identity: `${bootId}:${fields[19]}` };
}

const validPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

function capturedFile(file, bytes, dimensions = {}) {
  return { file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), ...dimensions };
}

function cleanCheckout(sha) {
  return { before: { sha, clean: true, entries: [] }, after: { sha, clean: true, entries: [] } };
}

function writeFakePlaywright(f, { runtimeErrors = false, dirtyAfterCapture = false } = {}) {
  const packageDir = join(f.root, 'node_modules/playwright');
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(join(packageDir, 'package.json'), '{"name":"playwright","main":"index.js"}\n');
  const png = validPng.toString('base64');
  writeFileSync(join(packageDir, 'index.js'), `
const fs = require('node:fs');
const path = require('node:path');
const png = Buffer.from('${png}', 'base64');
function locator() {
  return new Proxy({}, { get(_target, property) {
    if (property === 'then') return undefined;
    if (property === 'first' || property === 'filter' || property === 'getByRole' || property === 'getByText' || property === 'locator') return () => locator();
    if (property === 'ariaSnapshot' || property === 'innerText' || property === 'wait' || property === 'waitFor' || property === 'click') return async () => 'fixture';
    return () => locator();
  }});
}
const listeners = new Map();
let screenshots = 0;
const page = {
  on(event, listener) {
    listeners.set(event, [...(listeners.get(event) || []), listener]);
    return page;
  },
  async goto() {
    ${runtimeErrors ? "for (const listener of listeners.get('console') || []) listener({ type: () => 'error', text: () => 'runtime console error' }); for (const listener of listeners.get('pageerror') || []) listener(new Error('uncaught runtime failure')); for (const listener of listeners.get('requestfailed') || []) listener({ url: () => 'http://127.0.0.1:3103/api/fail?token=secret', failure: () => ({ errorText: 'network failure' }) });" : ''}
  },
  getByRole: () => locator(),
  locator: () => locator(),
  waitForURL: async () => undefined,
  url: () => 'http://127.0.0.1:3103/ranking',
  async screenshot({ path: target }) {
    screenshots += 1;
    fs.writeFileSync(target, png);
    ${dirtyAfterCapture ? "if (screenshots === 2) fs.writeFileSync(path.join(process.cwd(), 'fixture.txt'), 'dirty during drive\\n');" : ''}
  },
};
exports.chromium = {
  launch: async () => ({
    newContext: async () => ({ newPage: async () => page, close: async () => undefined }),
    close: async () => undefined,
  }),
};
`);
}

function writeValidEvidence(f, id, overrides = {}) {
  const sha = f.initGit();
  const target = f.paths(id);
  const manifest = f.writeManifest(id, {
    version: 1,
    gitSha: sha,
    worktree: f.root,
    port: 3103,
    baseUrl: 'http://127.0.0.1:3103',
    pid: process.pid,
    pgid: process.pid,
    processIdentity: 'fixture-identity',
    processPids: [process.pid],
    command: 'npm run dev -- --hostname 127.0.0.1 --port 3103',
    mode: 'demo',
    launchEnv: { allowlist: ['PATH'], overrides: {} },
    startedAt: '2026-09-10T06:00:00.000Z',
    logPath: join(target.evidenceDir, 'launch.log'),
    stateDir: target.stateDir,
    evidenceDir: target.evidenceDir,
    ...overrides.manifest,
  });
  const checkout = { sha, clean: true, entries: [] };
  manifest.checkout = { before: checkout, after: checkout };
  f.writeManifest(id, manifest);
  writeFileSync(join(target.evidenceDir, 'launch.log'), 'request https://demo.test/?access_token=secret-token Authorization: Bearer secret-jwt\n');
  const beforeAria = Buffer.from('before aria');
  const afterAria = Buffer.from('after aria');
  writeFileSync(join(target.evidenceDir, 'before-action.png'), validPng);
  writeFileSync(join(target.evidenceDir, 'after-vote.png'), validPng);
  writeFileSync(join(target.evidenceDir, 'before-action.aria.txt'), beforeAria);
  writeFileSync(join(target.evidenceDir, 'after-vote.aria.txt'), afterAria);
  const identity = {
    runId: manifest.runId,
    gitSha: manifest.gitSha,
    worktree: manifest.worktree,
    port: manifest.port,
    baseUrl: manifest.baseUrl,
    mode: manifest.mode,
  };
  writeFileSync(join(target.evidenceDir, 'doctor.json'), `${JSON.stringify({ ...identity, checkedAt: '2026-09-10T06:01:00.000Z', ok: true }, null, 2)}\n`);
  writeFileSync(join(target.evidenceDir, 'drive-result.json'), `${JSON.stringify({
    ...identity,
    feature: 'ranking-vote-reason',
    status: 'passed',
    checkout: { before: checkout, after: checkout },
    captures: {
      beforeAction: { screenshot: capturedFile('before-action.png', validPng, { width: 1, height: 1 }), aria: capturedFile('before-action.aria.txt', beforeAria) },
      afterVote: { screenshot: capturedFile('after-vote.png', validPng, { width: 1, height: 1 }), aria: capturedFile('after-vote.aria.txt', afterAria) },
    },
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    sideEffect: { observed: 'Não consigo rodar' },
  }, null, 2)}\n`);
  return { manifest, target, sha };
}

async function waitForFile(path, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(path)) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`file not written: ${path}`);
}

async function waitForDead(pid, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
      if (fields[0] === 'Z') return;
    } catch {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`process still alive: ${pid}`);
}

function killIfAlive(pid) {
  if (!pid) return;
  try { process.kill(pid, 'SIGKILL'); } catch { return; }
}

test('an explicit run id selects that run even when a newer run exists', () => {
  const f = fixture();
  try {
    const older = f.writeManifest('older', { marker: 'requested' }, false);
    const newer = f.writeManifest('newer', { marker: 'latest' }, false);
    utimesSync(join(f.paths('older').stateDir, 'manifest.json'), 1000, 1000);
    utimesSync(join(f.paths('newer').stateDir, 'manifest.json'), 2000, 2000);
    const result = f.run('status', '--run-id', 'older');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).marker, older.marker);
    assert.equal(JSON.parse(f.run('status').stdout).marker, newer.marker);
    assert.notEqual(f.run('status', '--run-id', '../outside').status, 0);
  } finally { f.cleanup(); }
});

test('evidence rejects a manifest whose evidence path is outside its run', () => {
  const f = fixture();
  try {
    const { manifest } = writeValidEvidence(f, 'path-check');
    f.writeManifest('path-check', { ...manifest, evidenceDir: join(tmpdir(), 'escape') });
    const result = f.run('evidence', '--run-id', 'path-check');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /diretórios canônicos|evidenceDir divergente/);
  } finally { f.cleanup(); }
});

test('evidence binds artifacts and current checkout to the launch SHA and run id', () => {
  const f = fixture();
  try {
    const { manifest, target } = writeValidEvidence(f, 'artifact-check');
    const valid = f.run('evidence', '--run-id', 'artifact-check');
    assert.equal(valid.status, 0, valid.stderr);
    writeFileSync(join(target.evidenceDir, 'cleanup.json'), JSON.stringify({
      runId: manifest.runId,
      gitSha: manifest.gitSha,
      worktree: manifest.worktree,
      port: manifest.port,
      baseUrl: manifest.baseUrl,
      mode: manifest.mode,
      cleanedAt: '2026-09-10T06:02:00.000Z',
      stopped: false,
      portFree: false,
    }));
    const incompleteCleanup = f.run('evidence', '--run-id', 'artifact-check');
    assert.notEqual(incompleteCleanup.status, 0);
    assert.match(incompleteCleanup.stderr, /cleanup\.json não confirma/);
    const drivePath = join(target.evidenceDir, 'drive-result.json');
    const drive = JSON.parse(readFileSync(drivePath, 'utf8'));
    writeFileSync(drivePath, JSON.stringify({ ...drive, runId: 'other-run' }));
    const mismatched = f.run('evidence', '--run-id', 'artifact-check');
    assert.notEqual(mismatched.status, 0);
    assert.match(mismatched.stderr, /drive-result\.json divergente no campo runId/);
    f.writeManifest('artifact-check', { ...manifest, gitSha: '0'.repeat(40) });
    const stale = f.run('evidence', '--run-id', 'artifact-check');
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /SHA atual não corresponde|Snapshot de checkout inválido/);
  } finally { f.cleanup(); }
});

test('launch accepts only the dedicated demo ports', () => {
  const f = fixture();
  try {
    for (const port of ['3101', '8081', '3104']) {
      const result = f.run('launch', '--run-id', `port-${port}`, '--port', port);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /somente as portas dedicadas/);
    }
  } finally { f.cleanup(); }
});

test('launch refuses a dirty checkout before creating a process or manifest', () => {
  const f = fixture();
  try {
    f.initGit();
    writeFileSync(join(f.root, 'fixture.txt'), 'changed\n');
    writeFileSync(join(f.root, 'new-source.txt'), 'untracked source\n');
    const result = f.run('launch', '--run-id', 'dirty-launch', '--port', '3103');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Checkout sujo durante launch antes/);
    assert.equal(existsSync(join(f.paths('dirty-launch').stateDir, 'manifest.json')), false);
  } finally { f.cleanup(); }
});

test('launch stops an unpublished process when the checkout dirties after spawn', () => {
  const f = fixture();
  try {
    f.initGit();
    const bin = join(f.root, 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'npm'), `#!/bin/sh
printf '%s\\n' 'changed after spawn' > fixture.txt
exec ${process.execPath} -e 'const http = require("node:http"); const args = process.argv.slice(1); const port = Number(args[args.indexOf("--port") + 1]); http.createServer((request, response) => { response.end("Clube do Jogo"); }).listen(port, "127.0.0.1"); setInterval(() => {}, 1000);' "$@"
`);
    spawnSync('chmod', ['+x', join(bin, 'npm')]);
    const result = f.runEnv({ ...process.env, PATH: `${bin}:${process.env.PATH || ''}` }, 'launch', '--run-id', 'dirty-launch-after', '--port', '3103');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Checkout sujo durante launch depois/);
    assert.equal(existsSync(join(f.paths('dirty-launch-after').stateDir, 'manifest.json')), false);
  } finally { f.cleanup(); }
});

test('evidence refuses a source edit after the captured run', () => {
  const f = fixture();
  try {
    writeValidEvidence(f, 'dirty-evidence');
    writeFileSync(join(f.root, 'fixture.txt'), 'changed after drive\n');
    const result = f.run('evidence', '--run-id', 'dirty-evidence');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Checkout sujo durante evidence antes/);
  } finally { f.cleanup(); }
});

test('run directories reject a symlinked canonical parent', () => {
  const f = fixture();
  const outside = mkdtempSync(join(tmpdir(), 'clube-evidence-outside-'));
  try {
    f.initGit();
    mkdirSync(join(f.root, 'state/verify-clube-do-jogo/symlinked'), { recursive: true });
    writeFileSync(join(f.root, 'state/verify-clube-do-jogo/symlinked/manifest.json'), JSON.stringify({ runId: 'symlinked' }));
    mkdirSync(join(f.root, 'evidence'));
    symlinkSync(outside, join(f.root, 'evidence/verify-clube-do-jogo'));
    const result = f.run('status', '--run-id', 'symlinked');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Diretório simbólico recusado/);
  } finally {
    rmSync(outside, { recursive: true, force: true });
    f.cleanup();
  }
});

test('evidence validates PNG signatures and capture hashes', () => {
  const f = fixture();
  try {
    const { target } = writeValidEvidence(f, 'capture-check');
    writeFileSync(join(target.evidenceDir, 'before-action.png'), 'not a png');
    const invalid = f.run('evidence', '--run-id', 'capture-check');
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /PNG inválido/);
    writeFileSync(join(target.evidenceDir, 'before-action.png'), validPng);
    const replacement = Buffer.from(validPng);
    replacement[40] ^= 1;
    writeFileSync(join(target.evidenceDir, 'before-action.png'), replacement);
    const mismatched = f.run('evidence', '--run-id', 'capture-check');
    assert.notEqual(mismatched.status, 0);
    assert.match(mismatched.stderr, /beforeAction\.screenshot divergente no campo sha256/);
    writeFileSync(join(target.evidenceDir, 'before-action.png'), validPng);
    const drivePath = join(target.evidenceDir, 'drive-result.json');
    const drive = JSON.parse(readFileSync(drivePath, 'utf8'));
    drive.captures.beforeAction.screenshot.width = 2;
    writeFileSync(drivePath, `${JSON.stringify(drive, null, 2)}\n`);
    const dimensionMismatch = f.run('evidence', '--run-id', 'capture-check');
    assert.notEqual(dimensionMismatch.status, 0);
    assert.match(dimensionMismatch.stderr, /beforeAction\.screenshot divergente no campo width/);
    drive.captures.beforeAction.screenshot.width = 1;
    writeFileSync(drivePath, `${JSON.stringify(drive, null, 2)}\n`);
    writeFileSync(join(target.evidenceDir, 'before-action.aria.txt'), 'before arib');
    const ariaMismatch = f.run('evidence', '--run-id', 'capture-check');
    assert.notEqual(ariaMismatch.status, 0);
    assert.match(ariaMismatch.stderr, /beforeAction\.aria divergente no campo sha256/);
  } finally { f.cleanup(); }
});

test('drive fails and records runtime errors instead of passing', () => {
  const f = fixture();
  try {
    writeValidEvidence(f, 'runtime-drive');
    writeFakePlaywright(f, { runtimeErrors: true });
    const result = f.run('drive', 'ranking', '--run-id', 'runtime-drive');
    assert.notEqual(result.status, 0);
    const drive = JSON.parse(readFileSync(join(f.paths('runtime-drive').evidenceDir, 'drive-result.json'), 'utf8'));
    assert.equal(drive.status, 'failed');
    assert.equal(drive.consoleErrors.length, 1);
    assert.equal(drive.pageErrors.length, 1);
    assert.equal(drive.failedRequests.length, 1);
    assert.match(result.stderr, /Runtime errors no drive/);
  } finally { f.cleanup(); }
});

test('drive fails when the source checkout becomes dirty during capture', () => {
  const f = fixture();
  try {
    writeValidEvidence(f, 'dirty-drive');
    writeFakePlaywright(f, { dirtyAfterCapture: true });
    const result = f.run('drive', 'ranking', '--run-id', 'dirty-drive');
    assert.notEqual(result.status, 0);
    const drive = JSON.parse(readFileSync(join(f.paths('dirty-drive').evidenceDir, 'drive-result.json'), 'utf8'));
    assert.equal(drive.status, 'failed');
    assert.equal(drive.checkout.after.clean, false);
    assert.match(drive.error, /Checkout sujo durante drive depois/);
  } finally { f.cleanup(); }
});

test('evidence rejects every nonempty runtime error collection', () => {
  const f = fixture();
  try {
    const { target } = writeValidEvidence(f, 'runtime-evidence');
    const drivePath = join(target.evidenceDir, 'drive-result.json');
    const drive = JSON.parse(readFileSync(drivePath, 'utf8'));
    drive.consoleErrors = ['console error'];
    drive.pageErrors = ['page error'];
    drive.failedRequests = [{ url: 'http://127.0.0.1:3103/api/fail', error: 'network error' }];
    writeFileSync(drivePath, `${JSON.stringify(drive, null, 2)}\n`);
    const result = f.run('evidence', '--run-id', 'runtime-evidence');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Runtime errors no drive/);
  } finally { f.cleanup(); }
});

test('launch passes only the demo environment allowlist to its child', async () => {
  const f = fixture();
  let runId;
  try {
    f.initGit();
    const bin = join(f.root, 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'lsof'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    writeFileSync(join(bin, 'npm'), `#!/usr/bin/env node
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1]);
fs.writeFileSync(path.join(process.cwd(), 'env-capture.json'), JSON.stringify({ privateToken: process.env.PRIVATE_TOKEN, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, nodeOptions: process.env.NODE_OPTIONS }));
http.createServer((request, response) => { response.end('Clube do Jogo'); }).listen(port, '127.0.0.1');
setInterval(() => {}, 1000);
`);
    spawnSync('chmod', ['+x', join(bin, 'npm')]);
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH || ''}`, PRIVATE_TOKEN: 'private-secret', NEXT_PUBLIC_SUPABASE_URL: 'https://prod.example' };
    runId = 'allowlist';
    const launch = f.runEnv(env, 'launch', '--run-id', runId, '--port', '3103');
    assert.equal(launch.status, 0, launch.stderr);
    const captured = JSON.parse(readFileSync(join(f.root, 'env-capture.json'), 'utf8'));
    assert.equal(captured.privateToken, undefined);
    assert.equal(captured.supabaseUrl, '');
    assert.equal(captured.supabaseKey, '');
    assert.equal(captured.nodeOptions, undefined);
    const doctor = f.runEnv(env, 'doctor', '--run-id', runId);
    assert.equal(doctor.status, 0, doctor.stderr);
    const cleanup = f.run('cleanup', '--run-id', runId);
    assert.equal(cleanup.status, 0, cleanup.stderr);
  } finally {
    if (runId) {
      const cleanup = f.run('cleanup', '--run-id', runId);
      if (cleanup.status !== 0) process.stderr.write(cleanup.stderr);
    }
    f.cleanup();
  }
});

test('evidence redacts credentials from retained text logs', () => {
  const f = fixture();
  try {
    const { target } = writeValidEvidence(f, 'redaction-check');
    const result = f.run('evidence', '--run-id', 'redaction-check');
    assert.equal(result.status, 0, result.stderr);
    const log = readFileSync(join(target.evidenceDir, 'launch.log'), 'utf8');
    assert.doesNotMatch(log, /secret-token|secret-jwt/);
    assert.match(log, /REDACTED/);
  } finally { f.cleanup(); }
});

test('cleanup refuses a live process with the wrong recorded identity', async () => {
  const f = fixture();
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { cwd: f.root, stdio: 'ignore' });
  await new Promise(resolve => child.once('spawn', resolve));
  try {
    const sha = f.initGit();
    const target = f.paths('reused');
    const snapshot = processSnapshot(child.pid);
    f.writeManifest('reused', {
      version: 1,
      gitSha: sha,
      worktree: f.root,
      port: 3103,
      baseUrl: 'http://127.0.0.1:3103',
      pid: child.pid,
      pgid: snapshot.pgid,
      processIdentity: 'another-process',
      processPids: [child.pid],
      command: 'node fixture',
      mode: 'demo',
      launchEnv: { allowlist: [], overrides: {} },
      checkout: cleanCheckout(sha),
      startedAt: '2026-09-10T06:00:00.000Z',
      logPath: join(target.evidenceDir, 'launch.log'),
      stateDir: target.stateDir,
      evidenceDir: target.evidenceDir,
    });
    const result = f.run('cleanup', '--run-id', 'reused');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /cleanup abortado/);
    assert.doesNotThrow(() => process.kill(child.pid, 0));
  } finally {
    killIfAlive(child.pid);
    await new Promise(resolve => child.once('exit', resolve));
    f.cleanup();
  }
});

test('cleanup terminates an orphan descendant and reports the final group and port state', async () => {
  const f = fixture();
  let leader;
  let orphanPid;
  try {
    const sha = f.initGit();
    const leaderScript = join(f.root, 'leader.js');
    writeFileSync(leaderScript, `const fs = require('node:fs');
const { spawn } = require('node:child_process');
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { cwd: process.cwd(), stdio: 'ignore' });
fs.writeFileSync('orphan-pid', String(child.pid));
setTimeout(() => process.exit(0), 500);
`);
    leader = spawn(process.execPath, [leaderScript], { cwd: f.root, detached: true, stdio: 'ignore' });
    const leaderExit = new Promise(resolve => leader.once('exit', resolve));
    await new Promise(resolve => leader.once('spawn', resolve));
    await waitForFile(join(f.root, 'orphan-pid'));
    orphanPid = Number(readFileSync(join(f.root, 'orphan-pid'), 'utf8'));
    const snapshot = processSnapshot(leader.pid);
    const target = f.paths('orphan');
    f.writeManifest('orphan', {
      version: 1,
      gitSha: sha,
      worktree: f.root,
      port: 3103,
      baseUrl: 'http://127.0.0.1:3103',
      pid: leader.pid,
      pgid: snapshot.pgid,
      processIdentity: snapshot.identity,
      processPids: [leader.pid, orphanPid],
      command: `node ${leaderScript}`,
      mode: 'demo',
      launchEnv: { allowlist: [], overrides: {} },
      checkout: cleanCheckout(sha),
      startedAt: '2026-09-10T06:00:00.000Z',
      logPath: join(target.evidenceDir, 'launch.log'),
      stateDir: target.stateDir,
      evidenceDir: target.evidenceDir,
    });
    await leaderExit;
    const cleanup = f.run('cleanup', '--run-id', 'orphan');
    assert.equal(cleanup.status, 0, cleanup.stderr);
    const report = JSON.parse(cleanup.stdout);
    assert.equal(report.stopped, true);
    assert.equal(report.portFree, true);
    assert.deepEqual(report.remainingPids, []);
    await waitForDead(orphanPid);
  } finally {
    killIfAlive(orphanPid);
    killIfAlive(leader?.pid);
    f.cleanup();
  }
});


test('launch refuses a listening port whose owner cannot be inspected', () => {
  const f = fixture();
  try {
    const bin = join(f.root, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'ss'), '#!/bin/sh\nprintf "LISTEN 0 511 127.0.0.1:3103 0.0.0.0:*\\n"\n', { mode: 0o755 });
    const result = f.runEnv({ ...process.env, PATH: `${bin}:${process.env.PATH}` }, 'launch', '--port', '3103');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Não foi possível inspecionar a porta/);
  } finally { f.cleanup(); }
});
