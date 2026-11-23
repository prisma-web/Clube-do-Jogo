// Runs every scenario over all schedules and compares the result with the
// findings recorded in SKILL.md. Usage (from the repo root):
//   npx --yes tsx@4.23.13 .agents/skills/formal-verify-notes-sync-web/check.ts [--trace] [--only <scenario>]
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
  type Scenario,
  type World,
} from './harness';

const KNOWN_FINDINGS: Record<string, { signatures: string[]; summary: string }> = {
  F1: {
    signatures: ['NoSilentRollback:remote.update:rollback'],
    summary: 'nota e metadado vivem em transações IndexedDB separadas; quando outra aba lê ou grava entre as duas, syncNotes vê a versão velha como edição local e a envia por cima da nova no servidor (SKILL.md, Findings).',
  },
  F2: {
    signatures: ['NoSilentRollback:remote.insert:resurrect'],
    summary: 'mesma causa de F1; syncNotes lê o metadado antes de a nota existir e a nota depois de apagada, e recria no servidor a nota que o usuário acabou de apagar em outra aba (SKILL.md, Findings).',
  },
};

const v1 = makeNote('n', 1);

function seedConflict(world: World, kind: 'both-changed' | 'remote-deleted') {
  const base = makeNote('n', 1);
  const local = makeNote('n', 2);
  world.seedVersion(3);
  if (kind === 'both-changed') world.seedServer(makeNote('n', 3));
  else world.serverEverHad.add('n');
  world.seedLocal(local, {
    state: 'conflict',
    localHash: noteFingerprint(local),
    baselineHash: noteFingerprint(base),
    baselineUpdatedAt: base.updatedAt,
    conflict: { kind, detectedAt: '2026-11-23T11:00:00.000Z', remote: kind === 'both-changed' ? makeNote('n', 3) : undefined },
  });
}

const SCENARIOS: Scenario[] = [
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
];

const root = path.resolve(__dirname, '../../..');
const skillPath = path.join(__dirname, 'SKILL.md');

function driftWarning() {
  const skill = readFileSync(skillPath, 'utf8');
  const commit = skill.match(/^sync-commit: ([0-9a-f]{7,40})$/m)?.[1];
  const covered = [...skill.matchAll(/^covered: (\S+)/gm)].map(match => match[1]);
  const tables = [...skill.matchAll(/^covered-table: (\S+)/gm)].map(match => match[1]);
  if (!commit || !covered.length) return 'SKILL.md sem sync-commit ou covered; registro de cobertura ilegível.';
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

  const drift = driftWarning();
  if (drift) console.log(`ATENÇÃO  ${drift}\n         Releia a seção "Quando o código coberto muda" do SKILL.md antes de confiar no resultado.\n`);

  let unexpected = 0;
  let totalSchedules = 0;
  const started = Date.now();
  for (const scenario of selected) {
    const report = await explore(scenario);
    totalSchedules += report.schedules;
    const expected = new Set(scenario.knownFindings.flatMap(id => KNOWN_FINDINGS[id].signatures));
    const found = new Set(report.counterexamples.keys());
    const surprises = [...found].filter(signature => !expected.has(signature));
    const vanished = [...expected].filter(signature => !found.has(signature));
    const missing = scenario.reaches.filter(outcome => !report.outcomes.has(outcome));
    const ok = !surprises.length && !vanished.length && !missing.length;
    if (!ok) unexpected += 1;
    const known = scenario.knownFindings.length ? ` (finding conhecido ${scenario.knownFindings.join(', ')})` : '';
    console.log(`${ok ? 'ok  ' : 'FALHA'} ${scenario.name}: ${report.schedules} ordens${known}`);
    console.log(`      ${scenario.summary}`);
    for (const outcome of missing) console.log(`      não alcançou "${outcome}" (vistos: ${[...report.outcomes].sort().join(' | ')}); o cenário deixou de exercitar o que promete`);
    for (const signature of vanished) console.log(`      ${signature} não reproduz mais; se o código mudou de propósito, atualize KNOWN_FINDINGS e o SKILL.md`);
    for (const [signature, counterexample] of report.counterexamples) {
      const isSurprise = surprises.includes(signature);
      if (!isSurprise && !showTrace) continue;
      console.log(`      ${isSurprise ? 'VIOLAÇÃO NOVA' : 'contraexemplo conhecido'} ${signature}`);
      console.log(`      ${counterexample.violation.message}`);
      counterexample.trace.forEach((line, index) => console.log(`        ${String(index + 1).padStart(2)}. ${line}`));
    }
    if (showTrace) console.log(`      resultados vistos: ${[...report.outcomes].sort().join(' | ')}`);
  }
  for (const [id, finding] of Object.entries(KNOWN_FINDINGS)) console.log(`\nfinding ${id}: ${finding.summary}`);
  console.log(`\n${selected.length} cenários, ${totalSchedules} ordens em ${((Date.now() - started) / 1000).toFixed(1)}s; ${unexpected ? `${unexpected} com resultado inesperado` : 'todos como esperado'}.`);
  process.exitCode = unexpected ? 1 : 0;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
