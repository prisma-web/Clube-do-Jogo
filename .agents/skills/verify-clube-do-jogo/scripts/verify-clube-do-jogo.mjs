#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto';
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(scriptDir, '..');
const rootDir = resolve(scriptDir, '../../../..');
const stateRoot = join(rootDir, 'state', 'verify-clube-do-jogo');
const evidenceRoot = join(rootDir, 'evidence', 'verify-clube-do-jogo');
const allowedPorts = new Set([3102, 3103]);
const demoEnvironmentNames = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TZ',
  'TERM',
  'TMPDIR',
  'TMP',
  'TEMP',
  'CI',
  'NODE_ENV',
  'NEXT_TELEMETRY_DISABLED',
  'NO_COLOR',
  'FORCE_COLOR',
];

function fail(message) {
  throw new Error(redact(message));
}

function usage() {
  process.stdout.write(`Usage: verify-clube-do-jogo <launch|doctor|drive|evidence|cleanup|status|check> [feature] [--run-id id] [--port port]\n`);
}

function parseArgs(values) {
  const positional = [];
  const options = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--run-id' || value === '--port') {
      const next = values[index + 1];
      if (!next || next.startsWith('--')) fail(`${value} precisa de um valor`);
      options[value === '--run-id' ? 'runId' : 'port'] = next;
      index += 1;
    } else if (value.startsWith('--')) {
      fail(`Opção desconhecida: ${value}`);
    } else {
      positional.push(value);
    }
  }
  return { positional, options };
}

function ensurePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || !allowedPorts.has(port)) {
    fail(`Use somente as portas dedicadas ${[...allowedPorts].join(' ou ')}; recebida: ${value}`);
  }
  return port;
}

function nowIso() {
  return new Date().toISOString();
}

function runText(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: rootDir, encoding: 'utf8', ...options });
  if (result.error) return '';
  return `${result.stdout || ''}${result.stderr || ''}`.trim();
}

function gitSha() {
  const value = runText('git', ['rev-parse', 'HEAD']).split('\n')[0] || '';
  return /^[0-9a-f]{40}$/.test(value) ? value : null;
}

function gitCheckoutState() {
  const sha = gitSha();
  const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: rootDir, encoding: 'utf8' });
  if (result.error || result.status !== 0) return { sha, clean: false, entries: ['git status indisponível'] };
  const output = (result.stdout || '').trim();
  const entries = output ? output.split('\n').filter(Boolean) : [];
  return { sha, clean: entries.length === 0, entries };
}

function requireCleanCheckout(stage, expectedSha = null) {
  const snapshot = gitCheckoutState();
  if (!snapshot.sha) fail(`SHA indisponível no checkout durante ${stage}`);
  if (!snapshot.clean) fail(`Checkout sujo durante ${stage}: ${snapshot.entries.join(' | ')}`);
  if (expectedSha && snapshot.sha !== expectedSha) fail(`SHA divergente durante ${stage}`);
  return snapshot;
}

function assertCleanSnapshot(name, snapshot, expectedSha) {
  if (!snapshot || snapshot.clean !== true || snapshot.sha !== expectedSha || !Array.isArray(snapshot.entries) || snapshot.entries.length) {
    fail(`Snapshot de checkout inválido: ${name}`);
  }
}

function redact(value) {
  return String(value)
    .replace(/([?&](?:access[_-]?token|refresh[_-]?token|token|api[_-]?key|apikey|secret|password|code|auth)=)[^&#\s]*/gi, '$1[REDACTED]')
    .replace(/(\b(?:authorization|cookie|token|secret|password|api[_-]?key|apikey|service[_-]?role|anon[_-]?key)\s*[:=]\s*)(?:bearer\s+)?[^\s,;}]+/gi, '$1[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]');
}

function demoEnvironment() {
  const environment = {};
  for (const name of demoEnvironmentNames) {
    if (process.env[name] !== undefined) environment[name] = process.env[name];
  }
  return {
    ...environment,
    NEXT_PUBLIC_SUPABASE_URL: '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
    NEXT_PUBLIC_AUTO_OPEN_PRODUCT_UPDATE: 'false',
  };
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  ensureWriteTarget(path);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function createRunId() {
  const stamp = nowIso().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `${stamp}-${randomBytes(3).toString('hex')}`;
}

function pathsFor(runId) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runId)) fail(`RUN_ID inválido: ${runId}`);
  const stateDir = join(stateRoot, runId);
  const evidenceDir = join(evidenceRoot, runId);
  ensureCanonicalDirectory(stateDir, `state do run ${runId}`);
  ensureCanonicalDirectory(evidenceDir, `evidence do run ${runId}`);
  return {
    stateDir,
    evidenceDir,
    stateManifest: join(stateDir, 'manifest.json'),
    evidenceManifest: join(evidenceDir, 'manifest.json'),
  };
}

function ensureCanonicalDirectory(path, label) {
  const target = resolve(path);
  const relativePath = relative(rootDir, target);
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`)) fail(`Diretório fora do checkout: ${label}`);
  let current = rootDir;
  for (const component of relativePath.split(sep).filter(Boolean)) {
    current = join(current, component);
    try {
      const stats = lstatSync(current);
      if (stats.isSymbolicLink()) fail(`Diretório simbólico recusado: ${label}`);
      if (!stats.isDirectory()) fail(`Componente de diretório inválido: ${label}`);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      break;
    }
  }
}

function ensureWriteTarget(path) {
  try {
    if (lstatSync(path).isSymbolicLink()) fail(`Destino simbólico recusado: ${path}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function ensureRegularFile(path, label) {
  let stats;
  try { stats = lstatSync(path); } catch { fail(`Arquivo ausente: ${label}`); }
  if (stats.isSymbolicLink() || !stats.isFile()) fail(`Arquivo inválido: ${label}`);
}

function listRunIds() {
  if (!existsSync(stateRoot)) return [];
  return readdirSync(stateRoot)
    .filter(name => existsSync(join(stateRoot, name, 'manifest.json')))
    .sort((left, right) => statSync(join(stateRoot, right, 'manifest.json')).mtimeMs - statSync(join(stateRoot, left, 'manifest.json')).mtimeMs);
}

function readManifest(runId) {
  const selected = runId || listRunIds()[0];
  if (!selected) fail('Nenhum run encontrado; execute launch primeiro');
  const paths = pathsFor(selected);
  if (!existsSync(paths.stateManifest)) fail(`Manifesto ausente para run ${selected}`);
  ensureRegularFile(paths.stateManifest, paths.stateManifest);
  const manifest = readJson(paths.stateManifest);
  if (manifest.runId !== selected) fail(`Manifesto inconsistente para run ${selected}`);
  return manifest;
}

function canonicalManifestPaths(manifest, strict = false) {
  const paths = pathsFor(manifest.runId);
  if (strict && (manifest.stateDir !== paths.stateDir || manifest.evidenceDir !== paths.evidenceDir)) {
    fail(`Manifesto do run ${manifest.runId} não aponta para seus diretórios canônicos`);
  }
  if (manifest.stateDir !== undefined && manifest.stateDir !== paths.stateDir) fail(`stateDir divergente para run ${manifest.runId}`);
  if (manifest.evidenceDir !== undefined && manifest.evidenceDir !== paths.evidenceDir) fail(`evidenceDir divergente para run ${manifest.runId}`);
  return paths;
}

function validateManifestEnvelope(manifest) {
  const paths = canonicalManifestPaths(manifest, true);
  if (manifest.version !== 1) fail(`Versão de manifesto não suportada para run ${manifest.runId}`);
  if (manifest.worktree !== rootDir) fail(`Worktree divergente para run ${manifest.runId}`);
  if (!allowedPorts.has(manifest.port)) fail(`Porta não permitida no manifesto: ${manifest.port}`);
  if (manifest.baseUrl !== `http://127.0.0.1:${manifest.port}`) fail(`baseUrl divergente para run ${manifest.runId}`);
  if (manifest.mode !== 'demo') fail(`Modo não permitido no manifesto: ${manifest.mode}`);
  if (!/^[0-9a-f]{40}$/.test(manifest.gitSha || '')) fail(`SHA inválido no manifesto do run ${manifest.runId}`);
  if (!Number.isInteger(manifest.pid) || manifest.pid < 2) fail(`PID inválido no manifesto do run ${manifest.runId}`);
  if (!Number.isInteger(manifest.pgid) || manifest.pgid < 2) fail(`PGID inválido no manifesto do run ${manifest.runId}`);
  if (!manifest.processIdentity) fail(`Identidade ausente no manifesto do run ${manifest.runId}`);
  if (!Array.isArray(manifest.processPids) || !manifest.processPids.includes(manifest.pid)) fail(`Grupo inicial ausente no manifesto do run ${manifest.runId}`);
  if (manifest.logPath !== join(paths.evidenceDir, 'launch.log')) fail(`logPath divergente para run ${manifest.runId}`);
  assertCleanSnapshot('launch antes', manifest.checkout?.before, manifest.gitSha);
  assertCleanSnapshot('launch depois', manifest.checkout?.after, manifest.gitSha);
  return paths;
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableJson(value[key])]));
  return value;
}

function sameJson(left, right) {
  return JSON.stringify(stableJson(left)) === JSON.stringify(stableJson(right));
}

function assertArtifactIdentity(name, artifact, manifest) {
  for (const field of ['runId', 'gitSha', 'worktree', 'port', 'baseUrl', 'mode']) {
    if (artifact?.[field] !== manifest[field]) fail(`${name} divergente no campo ${field}`);
  }
}

function assertNoRuntimeErrors(result) {
  const fields = ['consoleErrors', 'pageErrors', 'failedRequests'];
  for (const field of fields) {
    if (!Array.isArray(result?.[field])) fail(`${field} ausente no resultado do drive`);
    if (result[field].length) fail(`Runtime errors no drive: ${field}`);
  }
}

function fileDigest(path, file) {
  ensureRegularFile(path, file);
  const bytes = readFileSync(path);
  if (!bytes.length) fail(`Arquivo vazio: ${file}`);
  return {
    file,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function pngMetadata(path, file) {
  const metadata = fileDigest(path, file);
  const bytes = readFileSync(path);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(signature) || bytes.toString('ascii', 12, 16) !== 'IHDR' || bytes.subarray(-8, -4).toString('ascii') !== 'IEND') {
    fail(`PNG inválido: ${file}`);
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!width || !height) fail(`Dimensão PNG inválida: ${file}`);
  return { ...metadata, width, height };
}

function assertCapturedFile(name, expected, actual) {
  for (const field of ['file', 'bytes', 'sha256']) {
    if (expected?.[field] !== actual[field]) fail(`${name} divergente no campo ${field}`);
  }
  for (const field of ['width', 'height']) {
    if (expected?.[field] !== undefined && expected[field] !== actual[field]) fail(`${name} divergente no campo ${field}`);
  }
}

function captureMetadata(evidenceDir, captures) {
  const actual = {
    beforeAction: {
      screenshot: pngMetadata(join(evidenceDir, 'before-action.png'), 'before-action.png'),
      aria: fileDigest(join(evidenceDir, 'before-action.aria.txt'), 'before-action.aria.txt'),
    },
    afterVote: {
      screenshot: pngMetadata(join(evidenceDir, 'after-vote.png'), 'after-vote.png'),
      aria: fileDigest(join(evidenceDir, 'after-vote.aria.txt'), 'after-vote.aria.txt'),
    },
  };
  for (const stage of ['beforeAction', 'afterVote']) {
    assertCapturedFile(`${stage}.screenshot`, captures?.[stage]?.screenshot, actual[stage].screenshot);
    assertCapturedFile(`${stage}.aria`, captures?.[stage]?.aria, actual[stage].aria);
  }
  return actual;
}

function redactTextFile(path) {
  const original = readFileSync(path, 'utf8');
  const sanitized = redact(original);
  if (sanitized !== original) writeFileSync(path, sanitized, 'utf8');
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid < 2) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function processInfo(pid) {
  if (!processAlive(pid)) return { alive: false, state: null, cwd: null, command: null, pgid: null, identity: null };
  try {
    const cwd = realpathSync(`/proc/${pid}/cwd`);
    const command = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean).join(' ');
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
    const state = fields[0] || null;
    const pgid = Number(fields[2]);
    const startTicks = fields[19];
    const bootId = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
    const validPgid = Number.isInteger(pgid) && pgid >= 2 ? pgid : null;
    const identity = bootId && /^\d+$/.test(startTicks || '') ? `${bootId}:${startTicks}` : null;
    return { alive: state !== 'Z', state, cwd, command, pgid: validPgid, identity };
  } catch {
    let state = null;
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      state = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/)[0];
    } catch { }
    return { alive: state === 'Z' ? false : processAlive(pid), state, cwd: null, command: null, pgid: null, identity: null };
  }
}

function processTable() {
  const result = spawnSync('ps', ['-eo', 'pid=,ppid=,pgid=,stat='], { encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  const table = new Map();
  for (const line of result.stdout.split('\n').filter(Boolean)) {
    const fields = line.trim().split(/\s+/);
    const numbers = fields.slice(0, 3).map(Number);
    if (numbers.length === 3 && numbers.every(Number.isInteger)) table.set(numbers[0], { ppid: numbers[1], pgid: numbers[2], state: fields[3] || null });
  }
  return table;
}

function processTree(pid) {
  const table = processTable();
  if (!table) return null;
  const found = new Set([pid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [candidate, value] of table) {
      if (found.has(value.ppid) && !found.has(candidate)) {
        found.add(candidate);
        changed = true;
      }
    }
  }
  return found;
}

function processGroupPids(pgid) {
  const table = processTable();
  if (!table) return null;
  return [...table.entries()].filter(([, value]) => value.pgid === pgid && !value.state?.startsWith('Z')).map(([pid]) => pid);
}

async function waitForProcessInfo(pid, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  let info = processInfo(pid);
  while (Date.now() < deadline) {
    if (info.alive && info.cwd === rootDir && info.pgid === pid && info.identity) return info;
    await new Promise(resolvePromise => setTimeout(resolvePromise, 50));
    info = processInfo(pid);
  }
  return info;
}

async function terminateUnpublishedChild(child) {
  if (!child?.pid) return;
  const info = processInfo(child.pid);
  try {
    if (info.alive && info.cwd === rootDir && info.pgid === child.pid) {
      process.kill(-child.pid, 'SIGTERM');
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    try { child.kill('SIGKILL'); } catch { return; }
  }
  const stopped = await waitForExit(child.pid, 5_000);
  if (!stopped) {
    const after = processInfo(child.pid);
    try {
      if (after.alive && after.cwd === rootDir && after.pgid === child.pid) process.kill(-child.pid, 'SIGKILL');
      else child.kill('SIGKILL');
    } catch { return; }
    await waitForExit(child.pid, 5_000);
  }
}

function portPids(port) {
  const result = spawnSync('ss', ['-Hltnp', `sport = :${port}`], { encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  const rows = result.stdout.split('\n').filter(line => line.trim());
  const owners = rows.map(line => [...line.matchAll(/pid=(\d+)/g)].map(match => Number(match[1])));
  if (owners.some(pids => pids.length === 0)) return null;
  return [...new Set(owners.flat())];
}

async function getHttp(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_000);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'manual' });
    return { status: response.status, body: await response.text() };
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForHttp(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'sem resposta';
  while (Date.now() < deadline) {
    try {
      const result = await getHttp(url);
      if (result.status >= 200 && result.status < 400) return result;
      lastError = `HTTP ${result.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 500));
  }
  fail(`Timeout aguardando ${url}: ${lastError}`);
}

function writeManifest(manifest) {
  const paths = pathsFor(manifest.runId);
  mkdirSync(paths.stateDir, { recursive: true });
  mkdirSync(paths.evidenceDir, { recursive: true });
  writeJson(paths.stateManifest, manifest);
  writeJson(paths.evidenceManifest, manifest);
}

async function launchManifest(options) {
  const port = ensurePort(options.port || process.env.PORT || '3102');
  const occupied = portPids(port);
  if (!occupied) fail(`Não foi possível inspecionar a porta dedicada ${port}`);
  if (occupied.length) fail(`A porta ${port} já está ocupada pelos PIDs ${occupied.join(', ')}`);
  const runId = options.runId || process.env.RUN_ID || createRunId();
  if (!/^[A-Za-z0-9._-]+$/.test(runId)) fail(`RUN_ID inválido: ${runId}`);
  const checkoutBefore = requireCleanCheckout('launch antes');
  const launchSha = checkoutBefore.sha;
  const paths = pathsFor(runId);
  mkdirSync(paths.stateDir, { recursive: true });
  mkdirSync(paths.evidenceDir, { recursive: true });
  if (existsSync(paths.stateManifest)) fail(`RUN_ID já existe: ${runId}`);
  const logPath = join(paths.evidenceDir, 'launch.log');
  ensureWriteTarget(logPath);
  const logFd = openSync(logPath, 'a');
  const command = ['npm', 'run', 'dev', '--', '--hostname', '127.0.0.1', '--port', String(port)];
  const child = spawn(command[0], command.slice(1), {
    cwd: rootDir,
    detached: true,
    env: demoEnvironment(),
    stdio: ['ignore', logFd, logFd],
  });
  closeSync(logFd);
  if (!child.pid) {
    await terminateUnpublishedChild(child);
    fail('npm não retornou um PID');
  }
  const info = await waitForProcessInfo(child.pid);
  if (!info.alive || info.cwd !== rootDir || info.pgid !== child.pid || !info.identity) {
    await terminateUnpublishedChild(child);
    fail(`Não foi possível estabelecer a identidade do processo ${child.pid} antes do manifesto`);
  }
  const initialPids = processGroupPids(info.pgid);
  if (!initialPids || !initialPids.includes(child.pid)) {
    await terminateUnpublishedChild(child);
    fail(`Não foi possível inspecionar o grupo do processo ${child.pid} antes do manifesto`);
  }
  let checkoutAfter;
  try {
    checkoutAfter = requireCleanCheckout('launch depois', launchSha);
  } catch (error) {
    await terminateUnpublishedChild(child);
    throw error;
  }
  child.unref();
  const manifest = {
    version: 1,
    runId,
    gitSha: launchSha,
    worktree: rootDir,
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    pid: child.pid,
    pgid: info.pgid,
    processIdentity: info.identity,
    processPids: initialPids,
    command: command.join(' '),
    mode: 'demo',
    launchEnv: {
      allowlist: demoEnvironmentNames,
      overrides: {
        NEXT_PUBLIC_SUPABASE_URL: '',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
        NEXT_PUBLIC_AUTO_OPEN_PRODUCT_UPDATE: 'false',
      },
    },
    startedAt: nowIso(),
    checkout: { before: checkoutBefore, after: checkoutAfter },
    logPath,
    stateDir: paths.stateDir,
    evidenceDir: paths.evidenceDir,
  };
  if (!manifest.pid) fail('npm não retornou um PID');
  writeManifest(manifest);
  return manifest;
}

async function launch(options) {
  const manifest = await launchManifest(options);
  try {
    const response = await waitForHttp(`${manifest.baseUrl}/jogo-do-mes`);
    const updated = { ...manifest, readyAt: nowIso(), readyStatus: response.status };
    writeManifest(updated);
    process.stdout.write(`${JSON.stringify({ runId: updated.runId, pid: updated.pid, port: updated.port, baseUrl: updated.baseUrl, evidenceDir: updated.evidenceDir }, null, 2)}\n`);
  } catch (error) {
    try {
      await terminateManifest(manifest, false);
    } catch (cleanupError) {
      fail(`Launch falhou e cleanup também falhou: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
    }
    throw error;
  }
}

async function doctor(options) {
  const manifest = readManifest(options.runId);
  const paths = validateManifestEnvelope(manifest);
  const info = processInfo(manifest.pid);
  const trackedTree = processTree(manifest.pid);
  const owners = portPids(manifest.port);
  let http = { status: 0, body: '' };
  let httpError = null;
  try {
    http = await getHttp(`${manifest.baseUrl}/jogo-do-mes`);
  } catch (error) {
    httpError = redact(error instanceof Error ? error.message : String(error));
  }
  const checks = {
    pidAlive: info.alive,
    worktreeCwd: info.cwd === manifest.worktree,
    processIdentity: Boolean(manifest.processIdentity) && info.identity === manifest.processIdentity,
    processGroup: info.pgid === manifest.pgid,
    portAllowed: allowedPorts.has(manifest.port),
    processTreeAvailable: trackedTree !== null,
    portInspectionAvailable: owners !== null,
    appResponds: http.status >= 200 && http.status < 400,
    appIdentity: http.body.includes('Clube do Jogo'),
    portOwnedByRun: Boolean(owners?.length) && Boolean(trackedTree) && owners.every(pid => trackedTree.has(pid)),
  };
  const ok = Object.values(checks).every(value => value === true);
  const report = {
    runId: manifest.runId,
    gitSha: manifest.gitSha,
    worktree: manifest.worktree,
    baseUrl: manifest.baseUrl,
    checkedAt: nowIso(),
    ok,
    checks,
    pid: manifest.pid,
    pidInfo: info,
    port: manifest.port,
    pgid: manifest.pgid,
    portPids: owners || [],
    http: { status: http.status, error: httpError },
    mode: manifest.mode,
    localSupabase: 'disabled for demo',
  };
  writeJson(join(paths.evidenceDir, 'doctor.json'), report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!ok) process.exitCode = 1;
}

async function ariaSnapshot(page) {
  const body = page.locator('body');
  if (typeof body.ariaSnapshot === 'function') return body.ariaSnapshot();
  return body.innerText();
}

async function driveRanking(manifest) {
  const paths = validateManifestEnvelope(manifest);
  const checkoutBefore = requireCleanCheckout('drive antes', manifest.gitSha);
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 }, locale: 'pt-BR' });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(redact(message.text()));
  });
  page.on('pageerror', error => pageErrors.push(redact(error.message)));
  page.on('requestfailed', request => failedRequests.push({ url: redact(request.url()), error: redact(request.failure()?.errorText || 'unknown') }));
  const result = {
    runId: manifest.runId,
    gitSha: manifest.gitSha,
    worktree: manifest.worktree,
    port: manifest.port,
    mode: manifest.mode,
    feature: 'ranking-vote-reason',
    harness: 'Playwright',
    baseUrl: manifest.baseUrl,
    fixture: 'demo-user / Cocoon without an initial choice',
    startedAt: nowIso(),
    status: 'failed',
    actions: [],
    sideEffect: null,
    consoleErrors,
    pageErrors,
    failedRequests,
    checkout: { before: checkoutBefore, after: null },
    captures: null,
  };
  try {
    await page.goto(`${manifest.baseUrl}/jogo-do-mes`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const updateClose = page.getByRole('dialog').getByRole('button', { name: /Agora não|Fechar novidades/ }).first();
    await updateClose.click({ timeout: 2_000 }).catch(() => undefined);
    await page.getByRole('heading', { name: 'Hades', exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
    result.actions.push('opened /jogo-do-mes and dismissed optional product update');
    await page.getByRole('link', { name: 'Ranking', exact: true }).first().click();
    await page.waitForURL(url => new URL(url).pathname === '/ranking', { timeout: 10_000 });
    await page.getByRole('heading', { name: /Votação para/ }).waitFor({ state: 'visible', timeout: 30_000 });
    const card = page.locator('article.ranking-card').filter({ hasText: 'Cocoon' }).first();
    await card.waitFor({ state: 'visible', timeout: 30_000 });
    ensureWriteTarget(join(paths.evidenceDir, 'before-action.aria.txt'));
    ensureWriteTarget(join(paths.evidenceDir, 'before-action.png'));
    writeFileSync(join(paths.evidenceDir, 'before-action.aria.txt'), `${redact(await ariaSnapshot(page))}\n`, 'utf8');
    await page.screenshot({ path: join(paths.evidenceDir, 'before-action.png'), fullPage: true });
    result.captures = {
      beforeAction: {
        screenshot: pngMetadata(join(paths.evidenceDir, 'before-action.png'), 'before-action.png'),
        aria: fileDigest(join(paths.evidenceDir, 'before-action.aria.txt'), 'before-action.aria.txt'),
      },
    };
    result.actions.push('opened Ranking and captured before state');
    await card.getByRole('button', { name: 'Não', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: /Por que você não jogaria\?/ });
    await dialog.waitFor({ state: 'visible', timeout: 5_000 });
    await dialog.getByRole('button', { name: 'Não consigo rodar', exact: true }).click();
    await dialog.getByRole('button', { name: 'Confirmar Não', exact: true }).click();
    await card.locator('button[data-choice="would_not_play"][aria-pressed="true"]').waitFor({ state: 'visible', timeout: 10_000 });
    await card.locator('button.preference-count[data-choice="would_not_play"]').click();
    const participants = page.getByRole('dialog', { name: 'Escolhas do clube' });
    await participants.waitFor({ state: 'visible', timeout: 5_000 });
    await participants.getByText('Não consigo rodar', { exact: true }).first().waitFor({ state: 'visible', timeout: 10_000 });
    result.actions.push('selected Não consigo rodar, confirmed the negative vote, and opened its participant reason');
    result.sideEffect = {
      selectors: {
        card: 'article.ranking-card:has-text("Cocoon") button[data-choice="would_not_play"][aria-pressed="true"]',
        participantDialog: 'getByRole(dialog, { name: "Escolhas do clube" }).getByText("Não consigo rodar")',
      },
      observed: 'Não consigo rodar',
      url: redact(page.url()),
    };
    ensureWriteTarget(join(paths.evidenceDir, 'after-vote.aria.txt'));
    ensureWriteTarget(join(paths.evidenceDir, 'after-vote.png'));
    writeFileSync(join(paths.evidenceDir, 'after-vote.aria.txt'), `${redact(await ariaSnapshot(page))}\n`, 'utf8');
    await page.screenshot({ path: join(paths.evidenceDir, 'after-vote.png'), fullPage: true });
    result.captures.afterVote = {
      screenshot: pngMetadata(join(paths.evidenceDir, 'after-vote.png'), 'after-vote.png'),
      aria: fileDigest(join(paths.evidenceDir, 'after-vote.aria.txt'), 'after-vote.aria.txt'),
    };
    assertNoRuntimeErrors(result);
    result.status = 'passed';
  } catch (error) {
    result.error = redact(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    result.finishedAt = nowIso();
    result.consoleErrors = consoleErrors;
    result.pageErrors = pageErrors;
    result.failedRequests = failedRequests;
    const checkoutAfter = gitCheckoutState();
    result.checkout.after = checkoutAfter;
    if (consoleErrors.length || pageErrors.length || failedRequests.length) {
      result.status = 'failed';
      result.error = result.error || 'Runtime errors no drive';
    }
    if (!checkoutAfter.clean || checkoutAfter.sha !== manifest.gitSha) {
      result.status = 'failed';
      result.error = result.error || `Checkout sujo durante drive depois: ${checkoutAfter.entries.join(' | ')}`;
    }
    writeJson(join(paths.evidenceDir, 'drive-result.json'), result);
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

async function drive(options, positional) {
  const feature = positional[0];
  if (feature !== 'ranking') fail(`Feature não suportada: ${feature || '(ausente)'}`);
  const manifest = readManifest(options.runId);
  await driveRanking(manifest);
  const paths = validateManifestEnvelope(manifest);
  const result = readJson(join(paths.evidenceDir, 'drive-result.json'));
  assertNoRuntimeErrors(result);
  if (result.status !== 'passed') fail(`drive-result.json não passou: ${result.status}`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function hashFile(path) {
  ensureRegularFile(path, path);
  const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
  return { path, bytes: statSync(path).size, sha256: hash };
}

function evidenceFiles(dir) {
  return readdirSync(dir)
    .filter(name => name !== 'evidence.json')
    .map(name => join(dir, name))
    .map(path => {
      const stats = lstatSync(path);
      if (stats.isSymbolicLink()) fail(`Evidência simbólica recusada: ${path}`);
      return stats.isFile() ? path : null;
    })
    .filter(Boolean)
    .sort()
    .map(hashFile);
}

function evidence(options) {
  const manifest = readManifest(options.runId);
  const paths = validateManifestEnvelope(manifest);
  const checkoutBefore = requireCleanCheckout('evidence antes', manifest.gitSha);
  const currentSha = checkoutBefore.sha;
  if (!existsSync(paths.evidenceManifest)) fail(`Manifesto de evidência ausente para run ${manifest.runId}`);
  ensureRegularFile(paths.evidenceManifest, paths.evidenceManifest);
  if (!sameJson(readJson(paths.evidenceManifest), manifest)) fail(`Manifestos de estado e evidência divergentes para run ${manifest.runId}`);
  const required = ['manifest.json', 'launch.log', 'doctor.json', 'before-action.png', 'after-vote.png', 'before-action.aria.txt', 'after-vote.aria.txt', 'drive-result.json'];
  const missing = required.filter(name => !existsSync(join(paths.evidenceDir, name)));
  if (missing.length) fail(`Evidência incompleta; ausentes: ${missing.join(', ')}`);
  for (const name of required) ensureRegularFile(join(paths.evidenceDir, name), name);
  for (const name of ['launch.log', 'doctor.json', 'drive-result.json', 'before-action.aria.txt', 'after-vote.aria.txt']) {
    redactTextFile(join(paths.evidenceDir, name));
  }
  const storedManifest = readJson(paths.evidenceManifest);
  if (!sameJson(storedManifest, manifest)) fail(`Manifesto de evidência alterado para run ${manifest.runId}`);
  const driveResult = readJson(join(paths.evidenceDir, 'drive-result.json'));
  if (driveResult.status !== 'passed') fail(`drive-result.json não passou: ${driveResult.status}`);
  assertNoRuntimeErrors(driveResult);
  assertArtifactIdentity('drive-result.json', driveResult, manifest);
  assertCleanSnapshot('drive antes', driveResult.checkout?.before, manifest.gitSha);
  assertCleanSnapshot('drive depois', driveResult.checkout?.after, manifest.gitSha);
  const doctorResult = readJson(join(paths.evidenceDir, 'doctor.json'));
  if (doctorResult.ok !== true) fail('doctor.json não está aprovado');
  assertArtifactIdentity('doctor.json', doctorResult, manifest);
  const cleanupPath = join(paths.evidenceDir, 'cleanup.json');
  const cleanupResult = existsSync(cleanupPath) ? readJson(cleanupPath) : null;
  if (cleanupResult) {
    assertArtifactIdentity('cleanup.json', cleanupResult, manifest);
    if (cleanupResult.stopped !== true || cleanupResult.portFree !== true) fail('cleanup.json não confirma grupo e porta encerrados');
    const doctorTime = Date.parse(doctorResult.checkedAt || '');
    const cleanupTime = Date.parse(cleanupResult.cleanedAt || '');
    if (!Number.isFinite(doctorTime) || !Number.isFinite(cleanupTime) || doctorTime > cleanupTime) fail('snapshot do doctor ocorre depois do cleanup');
  }
  const captures = captureMetadata(paths.evidenceDir, driveResult.captures);
  const checkoutAfter = requireCleanCheckout('evidence depois', manifest.gitSha);
  const files = evidenceFiles(paths.evidenceDir);
  const report = {
    runId: manifest.runId,
    createdAt: nowIso(),
    gitSha: manifest.gitSha,
    gitShaAtEvidence: currentSha,
    shaMatchesLaunch: currentSha === manifest.gitSha,
    worktree: manifest.worktree,
    port: manifest.port,
    baseUrl: manifest.baseUrl,
    checkout: { before: checkoutBefore, after: checkoutAfter },
    platform: 'web',
    mode: manifest.mode,
    feature: driveResult.feature,
    status: 'passed',
    files,
    captures,
    sideEffect: driveResult.sideEffect,
    snapshots: { doctorCheckedAt: doctorResult.checkedAt, cleanupCleanedAt: cleanupResult?.cleanedAt || null },
    checks: { doctor: doctorResult.ok, drive: driveResult.status === 'passed', runtimeErrors: false, captures: true, checkoutClean: checkoutAfter.clean, evidenceRetained: true, manifestLinked: true, shaMatchesLaunch: currentSha === manifest.gitSha },
  };
  writeJson(join(paths.evidenceDir, 'evidence.json'), report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

async function waitForExit(pid, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processInfo(pid).alive) return true;
    await new Promise(resolvePromise => setTimeout(resolvePromise, 250));
  }
  return !processInfo(pid).alive;
}

function inspectRun(manifest) {
  const groupPids = processGroupPids(manifest.pgid);
  const groupUnsafePids = [];
  if (groupPids) {
    for (const pid of groupPids) {
      const info = processInfo(pid);
      if (!info.alive) continue;
      const owned = pid === manifest.pid
        ? info.alive && info.cwd === manifest.worktree && info.pgid === manifest.pgid && info.identity === manifest.processIdentity
        : info.alive && info.cwd === manifest.worktree && info.pgid === manifest.pgid;
      if (!owned) groupUnsafePids.push(pid);
    }
    const leaderInfo = processInfo(manifest.pid);
    if (leaderInfo.alive && !groupPids.includes(manifest.pid)) groupUnsafePids.push(manifest.pid);
  }
  const portOwners = portPids(manifest.port);
  const portUnsafePids = portOwners && groupPids
    ? portOwners.filter(pid => !groupPids.includes(pid))
    : [];
  return {
    groupAvailable: groupPids !== null,
    groupPids: groupPids || [],
    groupUnsafePids: [...new Set(groupUnsafePids)],
    portAvailable: portOwners !== null,
    portOwners: portOwners || [],
    portUnsafePids,
  };
}

async function waitForRunStop(manifest, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let snapshot = inspectRun(manifest);
  while (Date.now() < deadline) {
    if (snapshot.groupUnsafePids.length || snapshot.portUnsafePids.length) return snapshot;
    if (snapshot.groupAvailable && snapshot.portAvailable && snapshot.groupPids.length === 0 && snapshot.portOwners.length === 0) return snapshot;
    await new Promise(resolvePromise => setTimeout(resolvePromise, 250));
    snapshot = inspectRun(manifest);
  }
  return snapshot;
}

async function terminateManifest(manifest, writeCleanup = true) {
  const paths = validateManifestEnvelope(manifest);
  const info = processInfo(manifest.pid);
  const owned = !info.alive || (info.cwd === manifest.worktree && info.pgid === manifest.pgid && manifest.processIdentity && info.identity === manifest.processIdentity);
  if (!owned) fail(`PID ${manifest.pid} não pertence ao worktree registrado; cleanup abortado`);
  let snapshot = inspectRun(manifest);
  if (!snapshot.groupAvailable || !snapshot.portAvailable) fail('Não foi possível inspecionar grupo e porta; cleanup abortado');
  if (snapshot.groupUnsafePids.length || snapshot.portUnsafePids.length) {
    fail(`Processos fora da posse registrada detectados; cleanup abortado (grupo: ${snapshot.groupUnsafePids.join(', ') || 'nenhum'}, porta: ${snapshot.portUnsafePids.join(', ') || 'nenhum'})`);
  }
  let signal = null;
  if (snapshot.groupPids.length) {
    try {
      process.kill(-manifest.pgid, 'SIGTERM');
      signal = 'SIGTERM process-group';
    } catch (error) {
      if (error?.code !== 'ESRCH') throw error;
    }
    snapshot = await waitForRunStop(manifest, 5_000);
    if (snapshot.groupUnsafePids.length || snapshot.portUnsafePids.length) {
      fail(`Processos fora da posse registrada detectados durante cleanup; cleanup abortado (grupo: ${snapshot.groupUnsafePids.join(', ') || 'nenhum'}, porta: ${snapshot.portUnsafePids.join(', ') || 'nenhum'})`);
    }
    if (snapshot.groupPids.length || snapshot.portOwners.length) {
      const beforeKill = inspectRun(manifest);
      if (!beforeKill.groupAvailable || !beforeKill.portAvailable || beforeKill.groupUnsafePids.length || beforeKill.portUnsafePids.length) {
        fail('Não foi possível confirmar a posse antes do SIGKILL; cleanup abortado');
      }
      try {
        process.kill(-manifest.pgid, 'SIGKILL');
        signal = 'SIGKILL process-group';
      } catch (error) {
        if (error?.code !== 'ESRCH') throw error;
      }
      snapshot = await waitForRunStop(manifest, 5_000);
    }
  }
  const stopped = snapshot.groupAvailable && snapshot.groupPids.length === 0;
  const portFree = snapshot.portAvailable && snapshot.portOwners.length === 0;
  const report = {
    runId: manifest.runId,
    gitSha: manifest.gitSha,
    worktree: manifest.worktree,
    port: manifest.port,
    baseUrl: manifest.baseUrl,
    mode: manifest.mode,
    cleanedAt: nowIso(),
    pid: manifest.pid,
    pgid: manifest.pgid,
    initialPids: manifest.processPids || [],
    remainingPids: snapshot.groupPids,
    portPids: snapshot.portOwners,
    portInspectionAvailable: snapshot.portAvailable,
    signal,
    stopped,
    portFree,
    evidenceRetained: existsSync(paths.evidenceDir),
  };
  if (writeCleanup) writeJson(join(paths.evidenceDir, 'cleanup.json'), report);
  if (!stopped || !portFree) fail(`Cleanup incompleto para o run ${manifest.runId}: grupo restante ${snapshot.groupPids.join(', ') || 'nenhum'}, porta restante ${snapshot.portOwners.join(', ') || 'nenhum'}`);
  return report;
}

async function cleanup(options) {
  const manifest = readManifest(options.runId);
  const report = await terminateManifest(manifest, true);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function status(options) {
  process.stdout.write(`${JSON.stringify(readManifest(options.runId), null, 2)}\n`);
}

function check() {
  const validatorCandidates = [join(homedir(), '.codex', 'skills', '.system', 'skill-creator', 'scripts', 'quick_validate.py')];
  const validator = validatorCandidates.find(path => existsSync(path));
  let quickValidation = 'not-available';
  if (validator) {
    const validation = spawnSync('python3', [validator, skillDir], { cwd: rootDir, encoding: 'utf8' });
    if (validation.status !== 0) fail((validation.stdout || validation.stderr || 'quick_validate falhou').trim());
    quickValidation = (validation.stdout || validation.stderr || '').trim();
  } else {
    const content = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
    if (!content.startsWith('---\n') || !content.includes('\nname: verify-clube-do-jogo\n') || !content.includes('\ndescription:')) fail('SKILL.md sem frontmatter mínimo');
  }
  const source = resolve(skillDir);
  const claudeLink = resolve(rootDir, '.claude/skills/verify-clube-do-jogo');
  if (!existsSync(claudeLink) || realpathSync(claudeLink) !== source) fail('Symlink Claude não aponta para a fonte .agents');
  const wrapper = join(skillDir, 'scripts', 'verify-clube-do-jogo');
  const nodeHelper = join(skillDir, 'scripts', 'verify-clube-do-jogo.mjs');
  for (const path of [wrapper, nodeHelper]) {
    if ((statSync(path).mode & 0o111) === 0) fail(`Helper não executável: ${path}`);
  }
  const featureDir = join(skillDir, 'features');
  const featureFiles = readdirSync(featureDir).filter(name => name.endsWith('.md') && name !== 'README.md');
  // Sanity bound, not a target: catches an empty/near-empty features/ dir or a
  // runaway generator, not meant to cap the map's own growth. No test pins the
  // exact number; widen further if features/ legitimately grows past this.
  if (featureFiles.length < 3 || featureFiles.length > 15) fail(`Quantidade de feature maps inválida: ${featureFiles.length}`);
  for (const name of featureFiles) {
    const content = readFileSync(join(featureDir, name), 'utf8');
    for (const heading of ['## Sub-features', '## How to get to it (user POV)', '## Driving it with ', '## Gotchas']) {
      if (!content.includes(heading)) fail(`${name} não contém ${heading}`);
    }
  }
  process.stdout.write(`${JSON.stringify({ valid: true, source, claudeLink, quickValidation, features: featureFiles.sort() }, null, 2)}\n`);
}

async function main() {
  const command = process.argv[2];
  if (!command) {
    usage();
    return;
  }
  const { positional, options } = parseArgs(process.argv.slice(3));
  if (process.env.RUN_ID && !options.runId) options.runId = process.env.RUN_ID;
  if (command === 'launch') return launch(options);
  if (command === 'doctor') return doctor(options);
  if (command === 'drive') return drive(options, positional);
  if (command === 'evidence') return evidence(options);
  if (command === 'cleanup') return cleanup(options);
  if (command === 'status') return status(options);
  if (command === 'check') return check();
  fail(`Comando desconhecido: ${command}`);
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
