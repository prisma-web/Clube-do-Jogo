import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const projectRoot = resolve(import.meta.dirname, '../..');
const script = join(projectRoot, 'scripts/mobile-dependency-gate.mjs');
const fixtures = join(projectRoot, 'tests/fixtures/release');

function run(...args) {
  return spawnSync(process.execPath, [script, ...args], { cwd: projectRoot, encoding: 'utf8' });
}

function doctorFixture(transform = value => value) {
  const directory = mkdtempSync(join(tmpdir(), 'doctor-gate-'));
  const path = join(directory, 'doctor.log');
  writeFileSync(path, transform(readFileSync(join(fixtures, 'expo-doctor-react-split.log'), 'utf8')));
  return path;
}

function mapFixtures(transform = value => value) {
  const directory = mkdtempSync(join(tmpdir(), 'source-map-gate-'));
  const android = join(directory, 'android');
  const ios = join(directory, 'ios');
  mkdirSync(android);
  mkdirSync(ios);
  const androidSource = readFileSync(join(fixtures, 'android-react-source-map.json'), 'utf8');
  const iosSource = readFileSync(join(fixtures, 'ios-react-source-map.json'), 'utf8');
  writeFileSync(join(android, 'entry.hbc.map'), transform(androidSource, 'android'));
  writeFileSync(join(ios, 'entry.hbc.map'), transform(iosSource, 'ios'));
  return { android, ios };
}

test('accepts only the captured 20/21 React split diagnostic', () => {
  const result = run('doctor', '--log', doctorFixture(), '--exit-code', '1');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).checks, { passed: 20, total: 21, failed: 1 });
});

test('rejects a changed duplicate version', () => {
  const result = run('doctor', '--log', doctorFixture(value => value.replace('react@19.2.4', 'react@19.2.5')), '--exit-code', '1');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /sole accepted 20\/21 React split diagnostic/);
});

test('rejects a changed duplicate path', () => {
  const result = run('doctor', '--log', doctorFixture(value => value.replace('../../node_modules/react)', '../node_modules/react)')), '--exit-code', '1');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /sole accepted 20\/21 React split diagnostic/);
});

test('rejects an additional Doctor failure', () => {
  const result = run('doctor', '--log', doctorFixture(value => `${value}\n✖ Unexpected failure\n`), '--exit-code', '1');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /sole accepted 20\/21 React split diagnostic/);
});

test('rejects a changed Doctor exit code', () => {
  const result = run('doctor', '--log', doctorFixture(), '--exit-code', '0');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /must exit 1/);
});

test('accepts one mobile React origin in Android and iOS source maps', () => {
  const { android, ios } = mapFixtures();
  const result = run('sourcemaps', '--project-root', projectRoot, '--android-dir', android, '--ios-dir', ios);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).bundles.map(bundle => bundle.reactOrigins), [
    ['/apps/mobile/node_modules/react'],
    ['/apps/mobile/node_modules/react'],
  ]);
});

test('rejects a root React origin', () => {
  const { android, ios } = mapFixtures(value => value.replaceAll('/apps/mobile/node_modules/react/', '/node_modules/react/'));
  const result = run('sourcemaps', '--project-root', projectRoot, '--android-dir', android, '--ios-dir', ios);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /bundle React origins differ/);
});

test('rejects multiple React origins', () => {
  const { android, ios } = mapFixtures(value => value.replace('"/apps/mobile/app/_layout.tsx"', '"/node_modules/react/index.js"'));
  const result = run('sourcemaps', '--project-root', projectRoot, '--android-dir', android, '--ios-dir', ios);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /bundle React origins differ/);
});

test('rejects a relative workspace-root React origin', () => {
  const { android, ios } = mapFixtures(value => value.replace('"/apps/mobile/app/_layout.tsx"', '"node_modules/react/index.js"'));
  const result = run('sourcemaps', '--project-root', projectRoot, '--android-dir', android, '--ios-dir', ios);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /bundle React origins differ/);
});

test('rejects React DOM from the workspace root', () => {
  const { android, ios } = mapFixtures(value => value.replace('"/apps/mobile/app/_layout.tsx"', '"/node_modules/react-dom/index.js"'));
  const result = run('sourcemaps', '--project-root', projectRoot, '--android-dir', android, '--ios-dir', ios);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /React DOM outside apps\/mobile/);
});

test('rejects a source map without React', () => {
  const { android, ios } = mapFixtures(value => value.replaceAll('/apps/mobile/node_modules/react/', '/apps/mobile/node_modules/state-library/'));
  const result = run('sourcemaps', '--project-root', projectRoot, '--android-dir', android, '--ios-dir', ios);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /bundle React origins differ/);
});

test('rejects a source map without embedded source content', () => {
  const { android, ios } = mapFixtures(value => value.replace('"sourcesContent"', '"unknownContent"'));
  const result = run('sourcemaps', '--project-root', projectRoot, '--android-dir', android, '--ios-dir', ios);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /source map has an unknown shape/);
});
