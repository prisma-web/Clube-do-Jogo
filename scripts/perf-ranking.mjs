import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpus, platform, release, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';

const baselineRef = process.argv[2];
const candidateRef = process.argv[3] || 'HEAD';
if (!baselineRef) throw new Error('Usage: node scripts/perf-ranking.mjs <baseline-ref> [candidate-ref]');

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

async function loadRanking(ref) {
  const sha = git('rev-parse', '--verify', `${ref}^{commit}`);
  const files = git('ls-tree', '-r', '--name-only', sha).split('\n');
  const path = files.includes('packages/domain/src/ranking.ts')
    ? 'packages/domain/src/ranking.ts'
    : 'src/lib/ranking.ts';
  const source = git('show', `${sha}:${path}`);
  const { outputText: code } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  });
  const rankingModule = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  return { sha, path, module: rankingModule };
}

const fixtures = Array.from({ length: 1000 }, (_, index) => ({
  game: {
    id: `game-${index}`,
    title: `${['Ação', 'Órbita', 'Cidade', 'Árvore'][index % 4]} ${String(1000 - index).padStart(4, '0')}`,
    duration_hours: [4, 8, 15, 20, 25, 70][index % 6],
    average_rating: index % 9 === 0 ? null : (index * 13) % 101,
  },
  choiceCounts: { would_play: (index * 7) % 31, would_not_play: (index * 11) % 19 },
  completed: index % 7,
}));

function calculate(ranking, formula) {
  return fixtures.map(row => ({
    ...row,
    totalPoints: ranking.rankingScore(formula, row.game, row.choiceCounts, row.completed),
  })).sort(ranking.compareRankingItems).map(row => [row.game.id, row.totalPoints]);
}

function percentile95(samples) {
  return [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1];
}

const baseline = await loadRanking(baselineRef);
const candidate = await loadRanking(candidateRef);
const results = [];
for (const formula of ['preference', 'legacy']) {
  const expected = calculate(baseline.module, formula);
  assert.deepEqual(calculate(candidate.module, formula), expected, `${formula} ordering and scores changed`);
  for (let warmup = 0; warmup < 5; warmup += 1) {
    calculate(baseline.module, formula);
    calculate(candidate.module, formula);
  }
  const samples = { baseline: [], candidate: [] };
  for (let pair = 0; pair < 10; pair += 1) {
    const order = pair % 2 === 0 ? ['baseline', 'candidate'] : ['candidate', 'baseline'];
    for (const side of order) {
      const ranking = side === 'baseline' ? baseline : candidate;
      const start = performance.now();
      const output = calculate(ranking.module, formula);
      samples[side].push(performance.now() - start);
      assert.deepEqual(output, expected);
    }
  }
  const candidateP95Ms = percentile95(samples.candidate);
  results.push({
    formula,
    samplesMs: samples,
    baselineP95Ms: percentile95(samples.baseline),
    candidateP95Ms,
    limitMs: 50,
    passed: candidateP95Ms <= 50,
  });
}

const passed = results.every(result => result.passed);
console.log(JSON.stringify({
  status: passed ? 'passed' : 'failed',
  scope: 'pure ranking calculation and sorting; excludes web rendering, database and native frames',
  timestamp: new Date().toISOString(),
  host: { platform: platform(), release: release(), cpu: cpus()[0]?.model, logicalCpus: cpus().length, memoryBytes: totalmem(), node: process.version },
  baseline: { sha: baseline.sha, path: baseline.path },
  candidate: { sha: candidate.sha, path: candidate.path },
  fixtureCount: fixtures.length,
  warmups: 5,
  measuredPairs: 10,
  results,
}, null, 2));
process.exitCode = passed ? 0 : 1;
