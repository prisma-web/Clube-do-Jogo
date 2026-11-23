// Process and port inspection for Linux (/proc, ss) and macOS (ps, lsof, netstat).
// Every function returns null or a dead/unknown record when it cannot inspect, so
// callers fail closed instead of signalling a process they cannot identify.

import { readFileSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const darwin = process.platform === 'darwin';
const unknown = { alive: false, state: null, cwd: null, command: null, pgid: null, identity: null };

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } });
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

function darwinCwd(pid) {
  const result = run('lsof', ['-a', '-n', '-P', '-p', String(pid), '-d', 'cwd', '-Fn']);
  const line = result?.stdout?.split('\n').find(value => value.startsWith('n/'));
  if (!line) return null;
  try { return realpathSync(line.slice(1)); } catch { return null; }
}

function darwinProcessInfo(pid) {
  const result = run('ps', ['-o', 'pgid=,stat=,lstart=,command=', '-p', String(pid)]);
  const tokens = (result?.status === 0 ? result.stdout : '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 7) return { ...unknown, alive: signalable(pid) };
  const pgid = Number(tokens[0]);
  const state = tokens[1];
  const startedAt = tokens.slice(2, 7).join(' ');
  const boot = bootId();
  return {
    alive: !state.startsWith('Z'),
    state,
    cwd: darwinCwd(pid),
    command: tokens.slice(7).join(' '),
    pgid: Number.isInteger(pgid) && pgid >= 2 ? pgid : null,
    identity: boot ? `${boot}:${startedAt}` : null,
  };
}

/** Identity is boot id plus process start time, so a reused PID never matches. */
export function processInfo(pid) {
  if (!signalable(pid)) return unknown;
  return darwin ? darwinProcessInfo(pid) : linuxProcessInfo(pid);
}

export function processTable() {
  const result = run('ps', ['-Ao', 'pid=,ppid=,pgid=,stat=']);
  if (!result || result.status !== 0) return null;
  const table = new Map();
  for (const line of result.stdout.split('\n').filter(Boolean)) {
    const fields = line.trim().split(/\s+/);
    const numbers = fields.slice(0, 3).map(Number);
    if (numbers.length === 3 && numbers.every(Number.isInteger)) table.set(numbers[0], { ppid: numbers[1], pgid: numbers[2], state: fields[3] || null });
  }
  return table;
}

function linuxPortPids(port) {
  const result = run('ss', ['-Hltnp', `sport = :${port}`]);
  if (!result || result.status !== 0) return null;
  const rows = result.stdout.split('\n').filter(line => line.trim());
  const owners = rows.map(line => [...line.matchAll(/pid=(\d+)/g)].map(match => Number(match[1])));
  if (owners.some(pids => pids.length === 0)) return null;
  return [...new Set(owners.flat())];
}

// `netstat -anv` reads the kernel socket list, so it also lists sockets owned by
// other users, which `lsof` without root silently omits.
function darwinPortPids(port) {
  const result = run('netstat', ['-anv', '-p', 'tcp']);
  if (!result || result.status !== 0) return null;
  const rows = result.stdout.split('\n')
    .map(line => ({ line, fields: line.trim().split(/\s+/) }))
    .filter(({ fields }) => fields[0]?.startsWith('tcp') && fields[5] === 'LISTEN' && fields[3]?.endsWith(`.${port}`));
  const owners = rows.map(({ line }) => line.match(/:(\d+)\s+[0-9a-f]{5}\s+[0-9a-f]{8}\s/));
  if (owners.some(match => !match)) return null;
  return [...new Set(owners.map(match => Number(match[1])))];
}

/** PIDs listening on the TCP port, [] when free, null when an owner cannot be identified. */
export function portPids(port) {
  return darwin ? darwinPortPids(port) : linuxPortPids(port);
}
