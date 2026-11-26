import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
  return runWith({}, dir, ...args);
}

function runWith(env, dir, ...args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_REPOSITORY: 'prisma-web/Clube-do-Jogo', ...env },
    timeout: 30_000,
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

test('check does not count editing or renaming an existing note as a new one', () => {
  const dir = createRepo();
  commit(dir, { 'updates/notes/perfil.json': note('perfil') }, 'note');
  const base = branchFromMaster(dir);
  const edited = commit(dir, { 'updates/notes/perfil.json': note('perfil', { body: 'Texto revisado.' }) }, 'fix copy');
  const editResult = run(dir, 'check', base, edited);
  assert.equal(editResult.status, 1);
  assert.match(editResult.stderr, /renomear/);

  git(dir, 'checkout', '-q', '-B', 'rename', base);
  const renamed = commit(dir, { 'updates/notes/perfil.json': null, 'updates/notes/perfil-novo.json': note('perfil') }, 'rename');
  assert.equal(run(dir, 'check', base, renamed).status, 1);
  const optOut = run(dir, 'check', base, renamed, '--opt-out');
  assert.equal(optOut.status, 0, optOut.stderr);
  assert.match(optOut.stdout, /perfil-novo\.json/);
});

test('check counts a new note next to an edited one', () => {
  const dir = createRepo();
  commit(dir, { 'updates/notes/perfil.json': note('perfil') }, 'note');
  const base = branchFromMaster(dir);
  const head = commit(dir, {
    'updates/notes/perfil.json': note('perfil', { body: 'Texto revisado.' }),
    'updates/notes/ranking.json': note('ranking'),
  }, 'feature');
  assert.equal(run(dir, 'check', base, head).status, 0);
});

test('check revalidates a note whose screenshot the PR deletes or renames, even with the opt-out label', () => {
  const dir = createRepo();
  commit(dir, { 'updates/notes/ranking.json': withImage('ranking'), 'updates/notes/ranking.webp': fixture('lossy.webp') }, 'note');
  const base = branchFromMaster(dir);
  const deleted = commit(dir, { 'updates/notes/ranking.webp': null }, 'drop image');
  const deleteResult = run(dir, 'check', base, deleted, '--opt-out');
  assert.equal(deleteResult.status, 1);
  assert.match(deleteResult.stderr, /ranking\.webp, que não existe/);

  git(dir, 'checkout', '-q', '-B', 'rename-image', base);
  const renamed = commit(dir, { 'updates/notes/ranking.webp': null, 'updates/notes/ranking-v2.webp': fixture('lossy.webp') }, 'rename image');
  const renameResult = run(dir, 'check', base, renamed, '--opt-out');
  assert.equal(renameResult.status, 1);
  assert.match(renameResult.stderr, /ranking\.webp, que não existe/);
  assert.match(renameResult.stderr, /ranking-v2\.json não existe/);
});

test('check lets a PR delete a whole note, but not leave its screenshot behind', () => {
  const dir = createRepo();
  commit(dir, { 'updates/notes/ranking.json': withImage('ranking'), 'updates/notes/ranking.webp': fixture('lossy.webp') }, 'note');
  const base = branchFromMaster(dir);
  const removed = commit(dir, { 'updates/notes/ranking.json': null, 'updates/notes/ranking.webp': null }, 'drop note');
  const result = run(dir, 'check', base, removed, '--opt-out');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ranking\.json removida/);

  git(dir, 'checkout', '-q', '-B', 'orphan', base);
  const orphan = commit(dir, { 'updates/notes/ranking.json': null }, 'drop json only');
  const orphanResult = run(dir, 'check', base, orphan, '--opt-out');
  assert.equal(orphanResult.status, 1);
  assert.match(orphanResult.stderr, /ranking\.json não existe/);
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

  const atLimit = commit(dir, {
    'updates/notes/ranking.webp': Buffer.concat([fixture('lossy.webp'), Buffer.alloc(300 * 1024 - fixture('lossy.webp').length)]),
    'updates/notes/ranking.json': withImage('ranking'),
  }, 'at the limit');
  const atLimitResult = run(dir, 'check', base, atLimit);
  assert.equal(atLimitResult.status, 0, atLimitResult.stderr);

  const heavy = commit(dir, {
    'updates/notes/ranking.webp': Buffer.concat([fixture('lossy.webp'), Buffer.alloc(300 * 1024 - fixture('lossy.webp').length + 1)]),
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

test('check lets a PR remove a stray file from updates/notes', () => {
  const dir = createRepo();
  commit(dir, { 'updates/notes/README.md': 'solto' }, 'stray file');
  const base = branchFromMaster(dir);
  const head = commit(dir, { 'updates/notes/README.md': null }, 'clean up');
  const result = run(dir, 'check', base, head, '--opt-out');
  assert.equal(result.status, 0, result.stderr);
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

test('check does not count a note that master deleted after the PR left it', () => {
  const dir = createRepo();
  commit(dir, { 'updates/notes/antiga.json': note('antiga') }, 'note');
  branchFromMaster(dir);
  const head = commit(dir, { 'src/a.ts': 'x' }, 'pr without note');
  git(dir, 'checkout', '-q', 'master');
  const base = commit(dir, { 'updates/notes/antiga.json': null }, 'master deletes note');
  const result = run(dir, 'check', base, head);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /não adiciona nenhuma nota/);
});

function assemble(dir, tag, released = git(dir, 'tag', '--list').split('\n')) {
  const out = join(dir, 'out', 'product-update.json');
  rmSync(join(dir, 'out'), { recursive: true, force: true });
  mkdirSync(join(dir, 'out'));
  const result = run(dir, 'assemble', tag, '--released', released.join(','), '--out', out);
  return { ...result, update: existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null };
}

const titles = result => result.update?.steps.map(step => step.title.replace('Novidade ', ''));

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
  commit(dir, { 'updates/notes/antes.json': note('antes') }, 'before the side branch');
  git(dir, 'checkout', '-q', '-b', 'side');
  commit(dir, { 'updates/notes/lateral.json': note('lateral') }, 'side');
  git(dir, 'tag', 'v1.5.0');
  git(dir, 'checkout', '-q', 'master');
  commit(dir, { 'updates/notes/nova.json': note('nova') }, 'new');
  git(dir, 'tag', 'v2.0.0');
  commit(dir, { 'updates/notes/mais.json': note('mais') }, 'more');
  git(dir, 'tag', 'not-a-version');
  git(dir, 'tag', 'v2.1.0');

  assert.deepEqual(titles(assemble(dir, 'v2.0.0')), ['antes', 'nova']);
  assert.deepEqual(titles(assemble(dir, 'v2.1.0')), ['mais']);
});

test('assemble compares tags as versions, not as text', () => {
  const dir = createRepo();
  commit(dir, { 'updates/notes/nove.json': note('nove') }, 'nine');
  git(dir, 'tag', 'v1.9.0');
  commit(dir, { 'updates/notes/dez.json': note('dez') }, 'ten');
  git(dir, 'tag', 'v1.10.0');
  commit(dir, { 'updates/notes/onze.json': note('onze') }, 'eleven');
  git(dir, 'tag', 'v1.11.0');
  assert.deepEqual(titles(assemble(dir, 'v1.11.0')), ['onze']);
});

test('assemble starts from the last published release, so a tag whose build failed passes its notes on', () => {
  const dir = createRepo();
  commit(dir, { 'updates/notes/doze.json': note('doze') }, 'v1.2');
  git(dir, 'tag', 'v1.2.0');
  commit(dir, { 'updates/notes/treze.json': note('treze') }, 'v1.3');
  git(dir, 'tag', 'v1.3.0');
  commit(dir, { 'updates/notes/hotfix.json': note('hotfix') }, 'v1.3.1');
  git(dir, 'tag', 'v1.3.1');
  assert.deepEqual(titles(assemble(dir, 'v1.3.1', ['v1.2.0'])), ['treze', 'hotfix']);
  assert.deepEqual(titles(assemble(dir, 'v1.3.1', ['v1.2.0', 'v1.3.0'])), ['hotfix']);
  assert.deepEqual(titles(assemble(dir, 'v1.3.1', [])), ['doze', 'treze', 'hotfix']);
});

test('assemble skips published releases whose tag is not vX.Y.Z', () => {
  const dir = createRepo();
  commit(dir, { 'updates/notes/um.json': note('um') }, 'one');
  git(dir, 'tag', 'v1.0.0');
  git(dir, 'tag', 'v1.1.0-rc1');
  git(dir, 'tag', 'v2');
  commit(dir, { 'updates/notes/dois.json': note('dois') }, 'two');
  git(dir, 'tag', 'v1.1.0');
  const result = assemble(dir, 'v1.1.0', ['v1.0.0', 'v1.1.0-rc1', 'v2']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(titles(result), ['dois']);
});

test('assemble announces a note that was reverted and added again once', () => {
  const dir = createRepo();
  git(dir, 'tag', 'v1.0.0');
  commit(dir, { 'updates/notes/volta.json': note('volta') }, 'add');
  commit(dir, { 'updates/notes/outra.json': note('outra') }, 'other');
  commit(dir, { 'updates/notes/volta.json': null }, 'revert');
  commit(dir, { 'updates/notes/volta.json': note('volta') }, 'reapply');
  git(dir, 'tag', 'v1.1.0');
  assert.deepEqual(titles(assemble(dir, 'v1.1.0')), ['volta', 'outra']);
});

test('assemble needs the list of published releases', () => {
  const dir = createRepo();
  commit(dir, { 'updates/notes/um.json': note('um') }, 'one');
  git(dir, 'tag', 'v1.0.0');
  const result = run(dir, 'assemble', 'v1.0.0', '--out', join(dir, 'product-update.json'));
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--released/);
});

test('assemble keeps the notes of one merged branch together, in the order they were written', () => {
  const dir = createRepo();
  const date = day => ({ GIT_AUTHOR_DATE: `2026-01-0${day}T12:00:00Z`, GIT_COMMITTER_DATE: `2026-01-0${day}T12:00:00Z` });
  const dated = (day, files, message) => {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), JSON.stringify(content));
    }
    execFileSync('git', ['add', '-A'], { cwd: dir });
    execFileSync('git', ['commit', '-q', '-m', message], { cwd: dir, env: { ...process.env, ...date(day) } });
  };
  git(dir, 'tag', 'v1.0.0');
  git(dir, 'checkout', '-q', '-b', 'feature');
  dated(1, { 'updates/notes/ramo-um.json': note('ramo-um') }, 'branch one');
  git(dir, 'checkout', '-q', 'master');
  dated(2, { 'updates/notes/master.json': note('master') }, 'master');
  git(dir, 'checkout', '-q', 'feature');
  dated(3, { 'updates/notes/ramo-dois.json': note('ramo-dois') }, 'branch two');
  git(dir, 'checkout', '-q', 'master');
  execFileSync('git', ['merge', '-q', '--no-ff', '-m', 'merge feature', 'feature'], { cwd: dir, env: { ...process.env, ...date(4) } });
  git(dir, 'tag', 'v1.1.0');
  const order = titles(assemble(dir, 'v1.1.0'));
  assert.equal(order.length, 3);
  assert.equal(Math.abs(order.indexOf('ramo-um') - order.indexOf('ramo-dois')), 1, `branch notes split: ${order}`);
  assert.ok(order.indexOf('ramo-um') < order.indexOf('ramo-dois'), `branch notes reversed: ${order}`);
});

test('assemble does not announce a released note again when it is renamed', () => {
  const dir = createRepo();
  commit(dir, { 'updates/notes/perfil.json': note('perfil') }, 'note');
  git(dir, 'tag', 'v1.0.0');
  commit(dir, { 'updates/notes/perfil.json': null, 'updates/notes/perfil-config.json': note('perfil-config') }, 'rename');
  commit(dir, { 'updates/notes/nova.json': note('nova') }, 'new');
  git(dir, 'tag', 'v1.1.0');
  assert.deepEqual(titles(assemble(dir, 'v1.1.0')), ['nova']);
});

test('assemble announces a note renamed before its release under the new name, in its original place', () => {
  const dir = createRepo();
  git(dir, 'tag', 'v1.0.0');
  commit(dir, { 'updates/notes/rascunho.json': note('rascunho') }, 'draft');
  commit(dir, { 'updates/notes/depois.json': note('depois') }, 'later');
  commit(dir, { 'updates/notes/rascunho.json': null, 'updates/notes/final.json': note('final') }, 'rename');
  git(dir, 'tag', 'v1.1.0');
  assert.deepEqual(titles(assemble(dir, 'v1.1.0')), ['final', 'depois']);
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

function assembleHistory(dir, tag, released = git(dir, 'tag', '--list').split('\n')) {
  const out = join(dir, 'out');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out);
  const result = run(dir, 'assemble', tag, '--released', released.join(','), '--out', join(out, 'product-update.json'), '--history-out', join(out, 'product-updates.json'));
  const read = name => (existsSync(join(out, name)) ? JSON.parse(readFileSync(join(out, name), 'utf8')) : null);
  return { ...result, update: read('product-update.json'), history: read('product-updates.json') };
}

const versions = history => history?.releases.map(release => `${release.id}:${titles({ update: release }).join('+')}`);

test('the history holds every published release, newest first, each with the notes it announced', () => {
  const dir = createRepo();
  commit(dir, { 'updates/notes/um.json': note('um') }, 'one');
  git(dir, 'tag', 'v1.0.0');
  commit(dir, { 'updates/notes/dois.json': withImage('dois'), 'updates/notes/dois.webp': fixture('lossy.webp') }, 'two');
  commit(dir, { 'updates/notes/tres.json': note('tres') }, 'three');
  git(dir, 'tag', 'v1.1.0');
  commit(dir, { 'updates/notes/um.json': note('um', { body: 'Editada depois.' }), 'updates/notes/quatro.json': note('quatro') }, 'four');
  git(dir, 'tag', 'v1.2.0');

  const result = assembleHistory(dir, 'v1.2.0');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(versions(result.history), ['v1.2.0:quatro', 'v1.1.0:dois+tres', 'v1.0.0:um']);
  assert.equal(result.history.id, 'v1.2.0');
  assert.deepEqual(result.history.releases[0], result.update);
  assert.deepEqual(result.history.releases[1], assemble(dir, 'v1.1.0').update);
  assert.equal(result.history.releases[1].steps[0].image.src, 'https://raw.githubusercontent.com/prisma-web/Clube-do-Jogo/v1.1.0/updates/notes/dois.webp');
  assert.equal(result.history.releases[2].steps[0].body, note('um').body);
});

test('the history follows the published releases, so a tag whose build failed passes its notes to the next one', () => {
  const dir = createRepo();
  commit(dir, { 'updates/notes/um.json': note('um') }, 'one');
  git(dir, 'tag', 'v1.0.0');
  commit(dir, { 'updates/notes/falhou.json': note('falhou') }, 'failed build');
  git(dir, 'tag', 'v1.0.1');
  commit(dir, { 'updates/notes/dois.json': note('dois') }, 'two');
  git(dir, 'tag', 'v1.0.2');
  commit(dir, { 'src/a.ts': 'x' }, 'infra');
  git(dir, 'tag', 'v1.0.3');
  commit(dir, { 'updates/notes/tres.json': note('tres') }, 'three');
  git(dir, 'tag', 'v1.1.0');
  assert.deepEqual(versions(assembleHistory(dir, 'v1.1.0', ['v1.0.0', 'v1.0.2', 'v1.0.3']).history), ['v1.1.0:tres', 'v1.0.2:falhou+dois', 'v1.0.0:um']);
});

test('a release without notes still gets a history, so its members see the notes they skipped', () => {
  const dir = createRepo();
  commit(dir, { 'updates/notes/um.json': note('um') }, 'one');
  git(dir, 'tag', 'v1.0.0');
  commit(dir, { 'src/a.ts': 'x' }, 'infra');
  git(dir, 'tag', 'v1.0.1');
  const result = assembleHistory(dir, 'v1.0.1');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.update, null);
  assert.deepEqual({ id: result.history.id, versions: versions(result.history) }, { id: 'v1.0.1', versions: ['v1.0.0:um'] });
});

test('no history is written when no release has notes', () => {
  const dir = createRepo();
  git(dir, 'tag', 'v1.0.0');
  const result = assembleHistory(dir, 'v1.0.0');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.history, null);
});

test('the history keeps the 25 newest releases with notes', () => {
  const dir = createRepo();
  for (let patch = 0; patch < 30; patch += 1) {
    commit(dir, patch === 10 ? { 'src/a.ts': 'x' } : { [`updates/notes/n${patch}.json`]: note(`n${patch}`) }, `release ${patch}`);
    git(dir, 'tag', `v1.0.${patch}`);
  }
  const { history } = assembleHistory(dir, 'v1.0.29');
  assert.equal(history.releases.length, 25);
  assert.deepEqual([history.releases[0].id, history.releases.at(-1).id], ['v1.0.29', 'v1.0.4']);
});

test('an older release whose notes no longer validate stays out of the history, and the current one still fails', () => {
  const dir = createRepo();
  commit(dir, { 'updates/notes/antiga.json': note('antiga', { eyebrow: 'minúsculas' }) }, 'old invalid');
  git(dir, 'tag', 'v1.0.0');
  commit(dir, { 'updates/notes/nova.json': note('nova') }, 'new');
  git(dir, 'tag', 'v1.1.0');
  const ok = assembleHistory(dir, 'v1.1.0');
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(versions(ok.history), ['v1.1.0:nova']);
  assert.match(ok.stderr, /v1\.0\.0 fica fora do histórico/);

  commit(dir, { 'updates/notes/quebrada.json': note('quebrada', { eyebrow: 'minúsculas' }) }, 'current invalid');
  git(dir, 'tag', 'v1.2.0');
  const failed = assembleHistory(dir, 'v1.2.0');
  assert.equal(failed.status, 1);
  assert.equal(failed.history, null);
});

function runOnNode(version, dir, ...args) {
  const preload = pathToFileURL(join(root, 'tests', 'fixtures', 'release-notes', 'pretend-node.mjs')).href;
  return runWith({ NODE_OPTIONS: `--import=${preload}`, PRETEND_NODE_VERSION: version }, dir, ...args);
}

test('the script asks for Node 22.6 or later on an older Node', () => {
  const dir = createRepo();
  for (const version of ['20.19.0', '22.5.1']) {
    const result = runOnNode(version, dir, 'check', 'HEAD', 'HEAD', '--opt-out');
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, new RegExp(`precisa de Node ≥ 22\\.6.*${version.replaceAll('.', '\\.')}`));
  }
});

test('the script relaunches itself once with type stripping on Node 22.6 to 22.9', () => {
  const dir = createRepo();
  const result = runOnNode('22.8.0', dir, 'check', 'HEAD', 'HEAD', '--opt-out');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /sem-novidade/);
});
