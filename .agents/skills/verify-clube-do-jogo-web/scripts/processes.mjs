import { readFileSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const darwin = process.platform === 'darwin';
const unknown = { alive: false, state: null, cwd: null, command: null, pgid: null, identity: null };

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' } });
  if (result.error) return null;
  return result;
}

function signalable(pid) {
  if (!Number.isInteger(pid) || pid < 2) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

let bootIdCache;
function bootId() {
  if (bootIdCache !== undefined) return bootIdCache;
  try {
    bootIdCache = darwin
      ? (run('sysctl', ['-n', 'kern.bootsessionuuid'])?.stdout || '').trim() || null
      : readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim() || null;
  } catch {
    bootIdCache = null;
  }
  return bootIdCache;
}

function linuxProcessInfo(pid) {
  let state = null;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
    state = fields[0] || null;
    const cwd = realpathSync(`/proc/${pid}/cwd`);
    const command = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean).join(' ');
    const pgid = Number(fields[2]);
    const startTicks = fields[19];
    const boot = bootId();
    return {
      alive: state !== 'Z',
      state,
      cwd,
      command,
      pgid: Number.isInteger(pgid) && pgid >= 2 ? pgid : null,
      identity: boot && /^\d+$/.test(startTicks || '') ? `${boot}:${startTicks}` : null,
    };
  } catch {
    return { ...unknown, alive: state === 'Z' ? false : signalable(pid), state };
  }
}

export function parseLsofCwd(output) {
  const line = output.split('\n').find(value => value.startsWith('n/'));
  return line ? line.slice(1) : null;
}

function darwinCwd(pid) {
  const result = run('lsof', ['-a', '-n', '-P', '-p', String(pid), '-d', 'cwd', '-Fn']);
  const cwd = parseLsofCwd(result?.stdout || '');
  if (!cwd) return null;
  try { return realpathSync(cwd); } catch { return null; }
}

export function parseDarwinPs(output, boot) {
  const tokens = output.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 7) return null;
  const pgid = Number(tokens[0]);
  const state = tokens[1];
  const startedAt = tokens.slice(2, 7).join(' ');
  return {
    alive: !state.startsWith('Z'),
    state,
    command: tokens.slice(7).join(' '),
    pgid: Number.isInteger(pgid) && pgid >= 2 ? pgid : null,
    identity: boot ? `${boot}:${startedAt}` : null,
  };
}

function darwinProcessInfo(pid) {
  const result = run('ps', ['-o', 'pgid=,stat=,lstart=,command=', '-p', String(pid)]);
  const parsed = parseDarwinPs(result?.status === 0 ? result.stdout : '', bootId());
  if (!parsed) return { ...unknown, alive: signalable(pid) };
  return { ...parsed, cwd: darwinCwd(pid) };
}

export function processInfo(pid) {
  if (!signalable(pid)) return unknown;
  return darwin ? darwinProcessInfo(pid) : linuxProcessInfo(pid);
}

export function parsePsTable(output) {
  const table = new Map();
  for (const line of output.split('\n').filter(Boolean)) {
    const fields = line.trim().split(/\s+/);
    const numbers = fields.slice(0, 3).map(Number);
    if (numbers.length === 3 && numbers.every(Number.isInteger)) table.set(numbers[0], { ppid: numbers[1], pgid: numbers[2], state: fields[3] || null });
  }
  return table;
}

export function processTable() {
  const result = run('ps', ['-Ao', 'pid=,ppid=,pgid=,stat=']);
  if (!result || result.status !== 0) return null;
  return parsePsTable(result.stdout);
}

export function parseSsPids(output) {
  const rows = output.split('\n').filter(line => line.trim());
  const owners = rows.map(line => [...line.matchAll(/pid=(\d+)/g)].map(match => Number(match[1])));
  if (owners.some(pids => pids.length === 0)) return null;
  return [...new Set(owners.flat())];
}

function linuxPortPids(port) {
  const result = run('ss', ['-Hltnp', `sport = :${port}`]);
  if (!result || result.status !== 0) return null;
  return parseSsPids(result.stdout);
}

export function parseLsofPids(output) {
  const pids = output.split('\n').filter(line => /^p\d+$/.test(line)).map(line => Number(line.slice(1)));
  return [...new Set(pids)];
}

function loopbackAccepts(port) {
  let unknown = false;
  for (const host of ['127.0.0.1', '::1']) {
    const result = run('nc', ['-z', '-w', '1', host, String(port)]);
    if (!result || result.signal) unknown = true;
    else if (result.status === 0) return true;
  }
  return unknown ? null : false;
}

function darwinPortPids(port) {
  const accepts = loopbackAccepts(port);
  const result = run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpn']);
  if (!result) return null;
  const owners = parseLsofPids(result.stdout);
  if (owners.length) return owners;
  if (result.status !== 0 && result.status !== 1) return null;
  return accepts === false ? [] : null;
}

export function portPids(port) {
  return darwin ? darwinPortPids(port) : linuxPortPids(port);
}
