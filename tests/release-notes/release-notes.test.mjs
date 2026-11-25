import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = join(root, 'scripts', 'release-notes.mjs');
const fixture = name => readFileSync(join(root, 'tests', 'fixtures', 'release-notes', name));
const repos = [];
after(() => repos.forEach(dir => rmSync(dir, { recursive: true, force: true })));

function git(dir, ...args) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
}

function createRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'release-notes-'));
  repos.push(dir);
  git(dir, 'init', '-q', '-b', 'master');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'config', 'tag.gpgsign', 'false');
  commit(dir, { 'README.md': 'clube' }, 'initial');
  return dir;
}

function commit(dir, files, message) {
  for (const [path, content] of Object.entries(files)) {
    const file = join(dir, path);
    if (content === null) {
      rmSync(file);
      continue;
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, typeof content === 'string' || Buffer.isBuffer(content) ? content : JSON.stringify(content, null, 2));
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', message);
  return git(dir, 'rev-parse', 'HEAD');
}

function run(dir, ...args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_REPOSITORY: 'prisma-web/Clube-do-Jogo' },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function note(slug, overrides = {}) {
  return {
    eyebrow: 'RANKING',
    title: `Novidade ${slug}`,
    body: 'Jogos com a mesma pontuação dividem a posição.',
    ...overrides,
  };
}

function withImage(slug, width = 12, height = 8) {
  return note(slug, { image: { file: `${slug}.webp`, alt: 'Ranking real.', width, height } });
}

function branchFromMaster(dir) {
  const base = git(dir, 'rev-parse', 'HEAD');
  git(dir, 'checkout', '-q', '-b', `pr-${repos.length}-${Date.now()}`);
  return base;
}

test('check passes without a note when the PR opts out', () => {
  const dir = createRepo();
  const base = branchFromMaster(dir);
  const head = commit(dir, { 'src/a.ts': 'x' }, 'infra');
  const result = run(dir, 'check', base, head, '--opt-out');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /sem-novidade/);
});

test('check fails a PR without a note and says what to add or which label to use', () => {
  const dir = createRepo();
  const base = branchFromMaster(dir);
  const head = commit(dir, { 'src/a.ts': 'x' }, 'feature');
  const result = run(dir, 'check', base, head);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /updates\/notes\/<slug>\.json/);
  assert.match(result.stderr, /sem-novidade/);
});

test('check passes a PR that adds a valid note with its screenshot', () => {
  const dir = createRepo();
  const base = branchFromMaster(dir);
  const head = commit(dir, {
    'updates/notes/ranking-empates.json': withImage('ranking-empates'),
    'updates/notes/ranking-empates.webp': fixture('lossy.webp'),
  }, 'feature');
  const result = run(dir, 'check', base, head);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /updates\/notes\/ranking-empates\.json/);
});

test('check reads lossless and alpha WebP sizes', () => {
  const dir = createRepo();
  const base = branchFromMaster(dir);
  const head = commit(dir, {
    'updates/notes/lossless.json': withImage('lossless', 12, 8),
    'updates/notes/lossless.webp': fixture('lossless.webp'),
    'updates/notes/alpha.json': withImage('alpha', 10, 6),
    'updates/notes/alpha.webp': fixture('alpha.webp'),
  }, 'feature');
  const result = run(dir, 'check', base, head);
  assert.equal(result.status, 0, result.stderr);
});

test('check counts a modified note', () => {
  const dir = createRepo();
  commit(dir, { 'updates/notes/perfil.json': note('perfil') }, 'note');
  const base = branchFromMaster(dir);
  const head = commit(dir, { 'updates/notes/perfil.json': note('perfil', { body: 'Texto revisado.' }) }, 'fix copy');
  assert.equal(run(dir, 'check', base, head).status, 0);
});

test('check fails an invalid note and names the file and the field', () => {
  const dir = createRepo();
  const base = branchFromMaster(dir);
  const head = commit(dir, { 'updates/notes/ranking.json': note('ranking', { eyebrow: 'Ranking' }) }, 'feature');
  const result = run(dir, 'check', base, head);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /updates\/notes\/ranking\.json/);
  assert.match(result.stderr, /eyebrow/);
});

test('check fails a note that is not valid JSON', () => {
  const dir = createRepo();
  const base = branchFromMaster(dir);
  const head = commit(dir, { 'updates/notes/ranking.json': '{ "eyebrow": ' }, 'feature');
  const result = run(dir, 'check', base, head);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /JSON/);
});

test('check validates touched notes even when the PR opts out', () => {
  const dir = createRepo();
  const base = branchFromMaster(dir);
  const head = commit(dir, { 'updates/notes/ranking.json': note('ranking', { title: '' }) }, 'feature');
  assert.equal(run(dir, 'check', base, head, '--opt-out').status, 1);
});

test('check fails when the screenshot is missing, has other dimensions or is too heavy', () => {
  const dir = createRepo();
  const base = branchFromMaster(dir);
  const missing = commit(dir, { 'updates/notes/ranking.json': withImage('ranking') }, 'no image');
  assert.match(run(dir, 'check', base, missing).stderr, /ranking\.webp/);

  const wrongSize = commit(dir, { 'updates/notes/ranking.webp': fixture('lossy.webp'), 'updates/notes/ranking.json': withImage('ranking', 13, 8) }, 'wrong size');
  const sizeResult = run(dir, 'check', base, wrongSize);
  assert.equal(sizeResult.status, 1);
  assert.match(sizeResult.stderr, /12x8/);

  const heavy = commit(dir, {
    'updates/notes/ranking.webp': Buffer.concat([fixture('lossy.webp'), Buffer.alloc(301 * 1024)]),
    'updates/notes/ranking.json': withImage('ranking'),
  }, 'heavy');
  const heavyResult = run(dir, 'check', base, heavy);
  assert.equal(heavyResult.status, 1);
  assert.match(heavyResult.stderr, /300 KB/);

  const notWebp = commit(dir, { 'updates/notes/ranking.webp': 'not an image' }, 'not webp');
  assert.equal(run(dir, 'check', base, notWebp).status, 1);
});

test('check fails a file under updates/notes that is not a note or its screenshot', () => {
  const dir = createRepo();
  const base = branchFromMaster(dir);
  const head = commit(dir, {
    'updates/notes/ranking.json': note('ranking'),
    'updates/notes/ranking.png': 'png',
  }, 'feature');
  const result = run(dir, 'check', base, head);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ranking\.png/);
});

test('check fails a screenshot without its note', () => {
  const dir = createRepo();
  const base = branchFromMaster(dir);
  const head = commit(dir, {
    'updates/notes/perfil.json': note('perfil'),
    'updates/notes/ranking.webp': fixture('lossy.webp'),
  }, 'feature');
  const result = run(dir, 'check', base, head);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ranking\.json/);
});

test('check only looks at what the PR changed since it left master', () => {
  const dir = createRepo();
  commit(dir, { 'updates/notes/perfil.json': note('perfil') }, 'note');
  const forkPoint = branchFromMaster(dir);
  const head = commit(dir, { 'src/a.ts': 'x' }, 'pr without note');
  git(dir, 'checkout', '-q', 'master');
  const base = commit(dir, { 'updates/notes/perfil.json': note('perfil', { body: 'Mudou no master.' }) }, 'master edits note');
  assert.notEqual(base, forkPoint);
  assert.equal(run(dir, 'check', base, head).status, 1);
});

function assemble(dir, tag) {
  const out = join(dir, 'out', 'product-update.json');
  rmSync(join(dir, 'out'), { recursive: true, force: true });
  mkdirSync(join(dir, 'out'));
  const result = run(dir, 'assemble', tag, '--out', out);
  return { ...result, update: existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null };
}

test('assemble collects the notes added since the previous tag, oldest first', () => {
  const dir = createRepo();
  commit(dir, { 'updates/notes/antiga.json': note('antiga') }, 'old note');
  git(dir, 'tag', 'v1.0.0');
  commit(dir, { 'updates/notes/zeta.json': withImage('zeta'), 'updates/notes/zeta.webp': fixture('lossy.webp') }, 'first');
  commit(dir, { 'updates/notes/antiga.json': note('antiga', { body: 'Revisada depois do release.' }) }, 'edit old note');
  commit(dir, { 'updates/notes/alfa.json': note('alfa', { artwork: 'performance' }) }, 'second');
  commit(dir, { 'updates/notes/removida.json': note('removida') }, 'added');
  commit(dir, { 'updates/notes/removida.json': null }, 'removed');
  git(dir, 'tag', 'v1.1.0');

  const { status, stderr, update } = assemble(dir, 'v1.1.0');
  assert.equal(status, 0, stderr);
  assert.deepEqual(update, {
    id: 'v1.1.0',
    version: 'v1.1.0',
    title: 'Novidades da v1.1.0',
    steps: [
      {
        ...note('zeta'),
        image: {
          src: 'https://raw.githubusercontent.com/prisma-web/Clube-do-Jogo/v1.1.0/updates/notes/zeta.webp',
          alt: 'Ranking real.',
          width: 12,
          height: 8,
        },
      },
      note('alfa', { artwork: 'performance' }),
    ],
  });
});

test('assemble ignores tags that are not ancestors or are not lower than the release', () => {
  const dir = createRepo();
  commit(dir, { 'updates/notes/base.json': note('base') }, 'base');
  git(dir, 'tag', 'v1.0.0');
  git(dir, 'tag', 'v3.0.0', 'HEAD~1');
  git(dir, 'checkout', '-q', '-b', 'side');
  commit(dir, { 'updates/notes/lateral.json': note('lateral') }, 'side');
  git(dir, 'tag', 'v1.5.0');
  git(dir, 'checkout', '-q', 'master');
  commit(dir, { 'updates/notes/nova.json': note('nova') }, 'new');
  git(dir, 'tag', 'v2.0.0');
  commit(dir, { 'updates/notes/mais.json': note('mais') }, 'more');
  git(dir, 'tag', 'not-a-version');
  git(dir, 'tag', 'v2.1.0');

  assert.deepEqual(assemble(dir, 'v2.0.0').update?.steps.map(step => step.title), ['Novidade nova']);
  assert.deepEqual(assemble(dir, 'v2.1.0').update?.steps.map(step => step.title), ['Novidade mais']);
});

test('assemble without a previous tag takes every note in history', () => {
  const dir = createRepo();
  commit(dir, { 'updates/notes/um.json': note('um') }, 'one');
  commit(dir, { 'updates/notes/dois.json': note('dois') }, 'two');
  git(dir, 'tag', 'v0.1.0');
  assert.deepEqual(assemble(dir, 'v0.1.0').update?.steps.map(step => step.title), ['Novidade um', 'Novidade dois']);
});

test('assemble writes nothing when no note was added', () => {
  const dir = createRepo();
  commit(dir, { 'updates/notes/um.json': note('um') }, 'one');
  git(dir, 'tag', 'v1.0.0');
  commit(dir, { 'src/a.ts': 'x', 'updates/notes/um.json': note('um', { body: 'Editada.' }) }, 'infra');
  git(dir, 'tag', 'v1.0.1');
  const result = assemble(dir, 'v1.0.1');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.update, null);
});

test('assemble fails on an invalid note and writes nothing', () => {
  const dir = createRepo();
  commit(dir, { 'updates/notes/ranking.json': withImage('ranking', 860, 500), 'updates/notes/ranking.webp': fixture('lossy.webp') }, 'bad note');
  git(dir, 'tag', 'v1.0.0');
  const result = assemble(dir, 'v1.0.0');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ranking\.webp/);
  assert.equal(result.update, null);
});

test('assemble fails on a note whose name is not kebab-case', () => {
  const dir = createRepo();
  commit(dir, { 'updates/notes/Ranking_Empates.json': note('ranking') }, 'bad name');
  git(dir, 'tag', 'v1.0.0');
  const result = assemble(dir, 'v1.0.0');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /kebab-case/);
});

test('assemble rejects a tag that is not vX.Y.Z', () => {
  const dir = createRepo();
  git(dir, 'tag', 'v1.0');
  assert.equal(assemble(dir, 'v1.0').status, 1);
});
