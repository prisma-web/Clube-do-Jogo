// Runs every scenario over all schedules and compares the result with the
// findings recorded in SKILL.md. Usage (from the repo root):
//   npx --yes tsx@4.23.13 .agents/skills/formal-verify-notes-sync-web/check.ts [--trace] [--only <scenario>]
// Exit: 0 as expected, 1 unexpected result, 2 harness broke, 3 as expected but the
// covered code changed since sync-commit.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { noteFingerprint } from '../../../src/lib/notes-sync';
import {
  create,
  createThenRemove,
  deviceDelete,
  deviceEdit,
  edit,
  explore,
  makeNote,
  remove,
  resolve,
  sync,
  type Actor,
  type Scenario,
  type Shape,
  type World,
  violationKey,
} from './harness';

// A known finding covers a violation only when the signature matches and the pair
// the sync read was torn in one of the listed shapes (harness.ts, Shape). The same
// signature without that shape is a new bug.
const KNOWN_FINDINGS: Record<string, { signature: string; shapes: Shape[]; summary: string }> = {
  F1: {
    signature: 'NoSilentRollback:remote.update:rollback',
    shapes: ['torn-read', 'torn-write'],
    summary: 'nota e metadado vivem em transações IndexedDB separadas; quando outra aba grava entre as duas leituras da sincronização, ou duas abas gravam o par intercalado, syncNotes vê a versão velha como edição local e a envia por cima da nova no servidor (SKILL.md, Findings).',
  },
  F2: {
    signature: 'NoSilentRollback:remote.insert:resurrect',
    shapes: ['torn-read', 'half-write'],
    summary: 'mesma causa de F1; syncNotes vê a nota que outra aba acabou de criar ainda sem metadado, toma-a por nota legada e a recria no servidor depois que o usuário a apagou (SKILL.md, Findings).',
  },
};
const findingKeys = (id: string) => KNOWN_FINDINGS[id].shapes.map(shape => violationKey(KNOWN_FINDINGS[id].signature, shape));

const v1 = makeNote('n', 1);

// The server had v1, this browser edited it to v2, and the server then moved to v3
// (both-changed) or lost the note (remote-deleted). v2 exists only in IndexedDB.
function seedConflict(world: World, kind: 'both-changed' | 'remote-deleted') {
  const base = makeNote('n', 1);
  const local = makeNote('n', 2);
  world.seedVersion(3);
  world.seedServer(base);
  if (kind === 'both-changed') world.seedServer(makeNote('n', 3));
  else world.server.delete('n');
  world.seedLocal(local, {
    state: 'conflict',
    localHash: noteFingerprint(local),
    baselineHash: noteFingerprint(base),
    baselineUpdatedAt: base.updatedAt,
    conflict: { kind, detectedAt: '2026-11-23T11:00:00.000Z', remote: kind === 'both-changed' ? makeNote('n', 3) : undefined },
  });
}

// A local edit v2 over the synced v1 that has not reached the server: the state F1
// leaves behind in IndexedDB, or an upload that failed with a network error.
function seedUnsyncedEdit(world: World) {
  const base = makeNote('n', 1);
  const local = makeNote('n', 2);
  world.seedServer(base);
  world.seedLocal(local, {
    state: 'error',
    localHash: noteFingerprint(local),
    baselineHash: noteFingerprint(base),
    baselineUpdatedAt: base.updatedAt,
    lastError: 'Failed to fetch',
  });
}

// One user action and then the quiet sync, with nothing concurrent: a bug here
// needs no race, so no known finding can cover it.
function solo(name: string, summary: string, setup: (world: World) => void, actor: Actor, reach: string): Scenario {
  return { name, summary, setup, actors: [actor], reaches: [reach], knownFindings: [] };
}

const SCENARIOS: Scenario[] = [
  solo('solo-edit', 'aba B salva uma edição, sem concorrência', world => world.seedSynced(v1), edit('B', v1), 'B:edit:saved'),
  solo('solo-create-then-remove', 'aba B cria e apaga uma nota, sem concorrência', () => {}, createThenRemove('B', 'm'), 'B:create:saved+remove:done'),
  solo('solo-resolve-use-local', 'conflito both-changed; aba B mantém a versão local, sem concorrência', world => seedConflict(world, 'both-changed'), resolve('B', 'n', 'use-local'), 'B:resolve:use-local'),
  solo('solo-resolve-use-remote', 'conflito both-changed; aba B usa a versão do servidor, sem concorrência', world => seedConflict(world, 'both-changed'), resolve('B', 'n', 'use-remote'), 'B:resolve:use-remote'),
  solo('solo-resolve-restore', 'conflito remote-deleted; aba B restaura a versão local, sem concorrência', world => seedConflict(world, 'remote-deleted'), resolve('B', 'n', 'restore-local'), 'B:resolve:restore-local'),
  solo('solo-resolve-accept-deletion', 'conflito remote-deleted; aba B aceita a exclusão, sem concorrência', world => seedConflict(world, 'remote-deleted'), resolve('B', 'n', 'accept-remote-deletion'), 'B:resolve:accept-remote-deletion'),
  {
    name: 'sync-vs-device-edit',
    summary: 'aba A sincroniza enquanto outro aparelho edita a nota no servidor',
    setup: world => world.seedSynced(v1),
    actors: [sync('A'), deviceEdit('n')],
    reaches: ['A:n:synced', 'D:device:edited'],
    knownFindings: [],
  },
  {
    name: 'sync-vs-device-delete',
    summary: 'aba A sincroniza enquanto outro aparelho apaga a nota',
    setup: world => world.seedSynced(v1),
    actors: [sync('A'), deviceDelete('n')],
    reaches: ['A:n:synced', 'A:n:conflict/remote-deleted'],
    knownFindings: [],
  },
  {
    name: 'sync-vs-sync-vs-device-edit',
    summary: 'abas A e B sincronizam enquanto outro aparelho edita',
    setup: world => world.seedSynced(v1),
    actors: [sync('A'), sync('B'), deviceEdit('n')],
    reaches: ['A:n:synced', 'B:n:synced'],
    knownFindings: ['F1'],
  },
  {
    name: 'remote-only-sync-vs-sync-vs-device-edit',
    summary: 'nota criada em outro aparelho; abas A e B baixam enquanto o aparelho edita de novo',
    setup: world => world.seedServer(v1),
    actors: [sync('A'), sync('B'), deviceEdit('n')],
    reaches: ['A:n:synced', 'B:n:synced'],
    knownFindings: ['F1'],
  },
  {
    name: 'sync-vs-edit',
    summary: 'aba A sincroniza enquanto o usuário salva uma edição na aba B',
    setup: world => world.seedSynced(v1),
    actors: [sync('A'), edit('B', v1)],
    reaches: ['A:n:synced', 'B:edit:saved'],
    knownFindings: ['F1'],
  },
  {
    name: 'sync-vs-remove',
    summary: 'aba A sincroniza enquanto o usuário apaga a nota na aba B',
    setup: world => world.seedSynced(v1),
    actors: [sync('A'), remove('B', v1)],
    reaches: ['A:n:synced', 'B:remove:done'],
    knownFindings: [],
  },
  {
    name: 'sync-vs-create',
    summary: 'aba A sincroniza enquanto o usuário cria uma nota na aba B',
    setup: world => world.seedSynced(v1),
    actors: [sync('A'), create('B', 'm')],
    reaches: ['B:create:saved'],
    knownFindings: [],
  },
  {
    name: 'sync-vs-create-then-remove',
    summary: 'aba A sincroniza enquanto o usuário cria e logo apaga uma nota na aba B',
    setup: () => {},
    actors: [sync('A'), createThenRemove('B', 'm')],
    reaches: ['B:create:saved+remove:done'],
    knownFindings: ['F2'],
  },
  {
    name: 'legacy-sync-vs-sync',
    summary: 'nota legada só no IndexedDB; abas A e B sobem ao mesmo tempo',
    setup: world => world.seedLocal(v1),
    actors: [sync('A'), sync('B')],
    reaches: ['A:n:synced', 'B:n:synced'],
    knownFindings: [],
  },
  {
    name: 'resolve-use-remote-vs-sync',
    summary: 'conflito both-changed; aba B escolhe a versão do servidor enquanto aba A sincroniza',
    setup: world => seedConflict(world, 'both-changed'),
    actors: [resolve('B', 'n', 'use-remote'), sync('A')],
    reaches: ['B:resolve:use-remote'],
    knownFindings: ['F1'],
  },
  {
    name: 'resolve-use-local-vs-device-edit',
    summary: 'conflito both-changed; aba B mantém a versão local enquanto outro aparelho edita',
    setup: world => seedConflict(world, 'both-changed'),
    actors: [resolve('B', 'n', 'use-local'), deviceEdit('n')],
    reaches: ['B:resolve:use-local', 'B:resolve:stale'],
    knownFindings: [],
  },
  {
    name: 'resolve-restore-vs-sync',
    summary: 'conflito remote-deleted; aba B restaura a versão local enquanto aba A sincroniza',
    setup: world => seedConflict(world, 'remote-deleted'),
    actors: [resolve('B', 'n', 'restore-local'), sync('A')],
    reaches: ['B:resolve:restore-local'],
    knownFindings: [],
  },
  {
    name: 'resolve-accept-deletion-vs-sync',
    summary: 'conflito remote-deleted; aba B aceita a exclusão enquanto aba A sincroniza',
    setup: world => seedConflict(world, 'remote-deleted'),
    actors: [resolve('B', 'n', 'accept-remote-deletion'), sync('A')],
    reaches: ['B:resolve:accept-remote-deletion', 'A:n:synced'],
    knownFindings: [],
  },
  {
    name: 'conflict-sync-vs-device-edit',
    summary: 'conflito both-changed ainda aberto; aba A sincroniza enquanto outro aparelho edita de novo',
    setup: world => seedConflict(world, 'both-changed'),
    actors: [sync('A'), deviceEdit('n')],
    reaches: ['A:n:conflict/both-changed'],
    knownFindings: [],
  },
  {
    name: 'unsynced-edit-sync-vs-device-edit',
    summary: 'edição local que não subiu; aba A sincroniza enquanto outro aparelho edita',
    setup: seedUnsyncedEdit,
    actors: [sync('A'), deviceEdit('n')],
    reaches: ['A:n:synced', 'A:n:conflict/both-changed'],
    knownFindings: [],
  },
  {
    name: 'unsynced-edit-sync-vs-device-delete',
    summary: 'edição local que não subiu; aba A sincroniza enquanto outro aparelho apaga (update sem linha e nota sumida, notes-sync.ts:332-335)',
    setup: seedUnsyncedEdit,
    actors: [sync('A'), deviceDelete('n')],
    reaches: ['A:n:synced', 'A:n:conflict/remote-deleted', 'passo A  remote.get(n) → —'],
    knownFindings: [],
  },
];

const root = path.resolve(__dirname, '../../..');
const skillPath = path.join(__dirname, 'SKILL.md');

function coveredDrift() {
  const skill = readFileSync(skillPath, 'utf8');
  const commit = skill.match(/^sync-commit: ([0-9a-f]{7,40})$/m)?.[1];
  const covered = [...skill.matchAll(/^covered: (\S+)/gm)].map(match => match[1]);
  const tables = [...skill.matchAll(/^covered-table: (\S+)/gm)].map(match => match[1]);
  if (!commit || !covered.length) throw new Error('SKILL.md sem sync-commit ou covered; registro de cobertura ilegível.');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  try {
    const changed = git('diff', '--name-only', commit, '--', ...covered).split('\n').filter(Boolean);
    const sqlPaths = ['supabase', 'schema.sql', 'migration_*.sql'];
    const sqlFiles = [...git('diff', '--name-only', commit, '--', ...sqlPaths).split('\n'), ...git('ls-files', '--others', '--exclude-standard', '--', ...sqlPaths).split('\n')]
      .filter(file => file.endsWith('.sql') && existsSync(path.join(root, file)));
    const touchedSql = sqlFiles.filter(file => tables.some(table => readFileSync(path.join(root, file), 'utf8').includes(table)));
    const all = [...changed, ...touchedSql];
    return all.length ? `código coberto mudou desde ${commit.slice(0, 7)}: ${all.join(', ')}` : undefined;
  } catch (error) {
    return `não consegui comparar com ${commit.slice(0, 7)}: ${(error as Error).message.split('\n')[0]}`;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const showTrace = args.includes('--trace');
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined;
  const selected = SCENARIOS.filter(scenario => !only || scenario.name === only);
  if (!selected.length) throw new Error(`cenário desconhecido: ${only}`);

  const drift = coveredDrift();
  const driftNote = `DESATUALIZADO  ${drift}\n         Revise o diff e siga "Quando o código coberto muda" no SKILL.md; só então mova sync-commit.`;
  if (drift) console.log(`${driftNote}\n`);

  let unexpected = 0;
  let totalSchedules = 0;
  const started = Date.now();
  for (const scenario of selected) {
    const report = await explore(scenario);
    totalSchedules += report.schedules;
    const expected = new Set(scenario.knownFindings.flatMap(findingKeys));
    const found = [...report.counterexamples.keys()];
    const surprises = found.filter(key => !expected.has(key));
    const vanished = scenario.knownFindings.filter(id => !findingKeys(id).some(key => found.includes(key)));
    const missing = scenario.reaches.filter(reach => reach.startsWith('passo ') ? !report.steps.has(reach.slice('passo '.length)) : !report.outcomes.has(reach));
    const ok = !surprises.length && !vanished.length && !missing.length;
    if (!ok) unexpected += 1;
    const known = scenario.knownFindings.length ? ` (finding conhecido ${scenario.knownFindings.join(', ')})` : '';
    console.log(`${ok ? 'ok  ' : 'FALHA'} ${scenario.name}: ${report.schedules} ordens${known}`);
    console.log(`      ${scenario.summary}`);
    for (const reach of missing) console.log(`      não alcançou "${reach}" (vistos: ${[...report.outcomes].sort().join(' | ')}); o cenário deixou de exercitar o que promete`);
    for (const id of vanished) console.log(`      ${id} (${KNOWN_FINDINGS[id].signature}, forma ${KNOWN_FINDINGS[id].shapes.join(' ou ')}) não reproduz mais; se o código mudou de propósito, atualize KNOWN_FINDINGS e o SKILL.md`);
    for (const [key, counterexample] of report.counterexamples) {
      const isSurprise = surprises.includes(key);
      if (!isSurprise && !showTrace) continue;
      console.log(`      ${isSurprise ? 'VIOLAÇÃO NOVA' : 'contraexemplo conhecido'} ${key}`);
      console.log(`      ${counterexample.violation.message}`);
      counterexample.trace.forEach((line, index) => console.log(`        ${String(index + 1).padStart(2)}. ${line}`));
    }
    if (showTrace) console.log(`      resultados vistos: ${[...report.outcomes].sort().join(' | ')}`);
  }
  for (const [id, finding] of Object.entries(KNOWN_FINDINGS)) console.log(`\nfinding ${id}: ${finding.summary}`);
  console.log(`\n${selected.length} cenários, ${totalSchedules} ordens em ${((Date.now() - started) / 1000).toFixed(1)}s; ${unexpected ? `${unexpected} com resultado inesperado` : 'todos como esperado'}.`);
  if (drift) console.log(driftNote);
  process.exitCode = unexpected ? 1 : drift ? 3 : 0;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
