import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseDarwinPs, parseLsofCwd, parseLsofPids, parsePsTable, parseSsPids, portPids, processInfo } from '../scripts/processes.mjs';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const macos = name => readFileSync(join(fixtures, 'macos', name), 'utf8');
const linux = name => readFileSync(join(fixtures, 'linux', name), 'utf8');

const npmPid = 59977;
const serverPid = 60022;

test('lsof -Fpn: dono de listener IPv4 em loopback', () => {
  assert.deepEqual(parseLsofPids(macos('lsof-listen-ipv4-loopback.F.txt')), [serverPid]);
});

test('lsof -Fpn: dono de listener IPv6 em ::1', () => {
  assert.equal(macos('lsof-listen-ipv6-loopback.F.txt').includes('n[::1]:3103'), true);
  assert.deepEqual(parseLsofPids(macos('lsof-listen-ipv6-loopback.F.txt')), [63739]);
});

test('lsof -Fpn: dono de listener curinga dual-stack', () => {
  assert.deepEqual(parseLsofPids(macos('lsof-listen-wildcard-ipv6.F.txt')), [63739]);
});

test('lsof -Fpn: vários descritores e processos viram PIDs únicos, em ordem', () => {
  assert.deepEqual(parseLsofPids('p10\nf3\nn*:3102\nf4\nn*:3102\np11\nf3\nn[::1]:3102\n'), [10, 11]);
});

test('lsof -Fpn: saída vazia, de aviso ou sem linha p não tem dono', () => {
  assert.deepEqual(parseLsofPids(''), []);
  assert.deepEqual(parseLsofPids('f13\nn127.0.0.1:3102\n'), []);
  assert.deepEqual(parseLsofPids('pabc\n'), []);
});

test('lsof tabular não é aceito como formato -F', () => {
  assert.deepEqual(parseLsofPids(macos('lsof-listen-ipv4-loopback.table.txt')), []);
});

test('lsof -d cwd -Fn: cwd vem da linha n/, não da linha f', () => {
  assert.equal(parseLsofCwd(macos('lsof-cwd.F.txt')), '/Users/dev/cdj-verify-macos-tmp/work');
  assert.equal(parseLsofCwd('p1\nfcwd\n'), null);
  assert.equal(parseLsofCwd(''), null);
});

test('ps -o pgid=,stat=,lstart=,command= no macOS', () => {
  const boot = macos('bootsession.txt').trim();
  const info = parseDarwinPs(macos('ps-lstart.txt'), boot);
  assert.equal(info.alive, true);
  assert.equal(info.state, 'Ss');
  assert.equal(info.pgid, npmPid);
  assert.equal(info.command, 'npm run dev --hostname 127.0.0.1 --port 3102');
  assert.equal(info.identity, `${boot}:Thu Nov 26 00:20:42 2026`);
});

test('ps no macOS: zumbi não está vivo, saída curta ou vazia não é processo, sem boot não há identidade', () => {
  assert.equal(parseDarwinPs('7 Z Thu Nov 26 00:20:42 2026 (node)', 'boot').alive, false);
  assert.equal(parseDarwinPs('', 'boot'), null);
  assert.equal(parseDarwinPs('7 S Thu Nov 26', 'boot'), null);
  assert.equal(parseDarwinPs(macos('ps-lstart.txt'), null).identity, null);
  assert.equal(parseDarwinPs('1 Ss Thu Nov 26 00:20:42 2026 launchd', 'boot').pgid, null);
});

test('ps -Ao pid=,ppid=,pgid=,stat= no macOS: árvore do npm no mesmo grupo', () => {
  const table = parsePsTable(macos('ps-table.txt'));
  assert.deepEqual(table.get(npmPid), { ppid: 1, pgid: npmPid, state: 'Ss' });
  assert.deepEqual(table.get(60018), { ppid: npmPid, pgid: npmPid, state: 'S' });
  assert.deepEqual(table.get(serverPid), { ppid: 60018, pgid: npmPid, state: 'S' });
  const group = [...table].filter(([, value]) => value.pgid === npmPid).map(([pid]) => pid);
  assert.deepEqual(group, [npmPid, 60018, serverPid]);
  assert.equal(table.get(99064).state, 'S+');
});

test('ps -Ao no Linux, incluindo estado com sufixo', () => {
  const table = parsePsTable(linux('ps-table.txt'));
  assert.deepEqual(table.get(1), { ppid: 0, pgid: 1, state: 'Ss' });
  assert.deepEqual(table.get(2172190), { ppid: 2172189, pgid: 2172190, state: 'Sl' });
});

test('ss no Linux: IPv4 em loopback, IPv6 em ::1 e curinga', () => {
  assert.deepEqual(parseSsPids(linux('ss-listen-ipv4-loopback.txt')), [2172190]);
  assert.deepEqual(parseSsPids(linux('ss-listen-ipv6-loopback.txt')), [2172190]);
  assert.deepEqual(parseSsPids(linux('ss-listen-wildcard.txt')), [2172190]);
});

test('ss no Linux: porta livre é lista vazia e listener sem PID visível é desconhecido', () => {
  assert.deepEqual(parseSsPids(''), []);
  assert.equal(parseSsPids('LISTEN 0 511 127.0.0.1:3102 0.0.0.0:*\n'), null);
});

test('processInfo conhece o próprio processo no host atual', () => {
  const info = processInfo(process.pid);
  assert.equal(info.alive, true);
  assert.equal(info.cwd, process.cwd());
  assert.ok(info.pgid >= 2);
  assert.ok(info.identity);
});

for (const host of ['127.0.0.1', '::1', '::']) {
  test(`portPids no host atual vê um listener em ${host} e depois a porta livre`, async t => {
    const server = createServer();
    try {
      await new Promise((resolvePromise, reject) => {
        server.once('error', reject);
        server.listen(0, host, resolvePromise);
      });
    } catch (error) {
      if (error?.code === 'EADDRNOTAVAIL' || error?.code === 'EAFNOSUPPORT') return t.skip(`${host} indisponível neste host`);
      throw error;
    }
    const { port } = server.address();
    try {
      assert.deepEqual(portPids(port), [process.pid]);
    } finally {
      await new Promise(resolvePromise => server.close(resolvePromise));
    }
    assert.deepEqual(portPids(port), []);
  });
}
