import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const expectedDoctorOutput = `Running 21 checks on your project...
20/21 checks passed. 1 checks failed. Possible issues detected:
Use the --verbose flag to see more details about passed checks.

✖ Check that no duplicate dependencies are installed
Your project contains duplicate native module dependencies, which should be de-duplicated.
Native builds may only contain one version of any given native module, and having multiple versions of a single Native module installed may lead to unexpected build errors.
Found duplicates for react:
  ├─ react@19.2.3 (at: node_modules/react)
  └─ react@19.2.4 (at: ../../node_modules/react)
Found duplicates for react-dom:
  ├─ react-dom@19.2.3 (at: node_modules/react-dom)
  └─ react-dom@19.2.4 (at: ../../node_modules/react-dom)
Advice:
Resolve your dependency issues and deduplicate your dependencies. Learn more: https://expo.fyi/resolving-dependency-issues

1 check failed, indicating possible issues with the project.`;

function fail(message) {
  throw new Error(message);
}

function parseOptions(values) {
  const options = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (!name?.startsWith('--') || value === undefined || options.has(name)) fail('options must be unique name/value pairs');
    options.set(name, value);
  }
  return options;
}

function exactOptions(options, expected) {
  const actual = [...options.keys()].sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) fail(`expected options ${wanted.join(', ')}, received ${actual.join(', ')}`);
}

function cleanTerminalOutput(value) {
  return value.replaceAll('\r\n', '\n').replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '').trim();
}

function checkDoctor(options) {
  exactOptions(options, ['--exit-code', '--log']);
  const exitCode = Number(options.get('--exit-code'));
  if (!Number.isInteger(exitCode) || exitCode !== 1) fail(`Expo Doctor must exit 1 for the classified exception, received ${options.get('--exit-code')}`);
  const output = cleanTerminalOutput(readFileSync(resolve(options.get('--log')), 'utf8'));
  if (output !== expectedDoctorOutput) fail('Expo Doctor output differs from the sole accepted 20/21 React split diagnostic');
  return {
    status: 'passed',
    checks: { passed: 20, total: 21, failed: 1 },
    acceptedFailure: {
      check: 'duplicate dependencies',
      mobile: { react: '19.2.3', reactDom: '19.2.3' },
      workspaceRoot: { react: '19.2.4', reactDom: '19.2.4' },
    },
  };
}

function findSourceMap(directory) {
  const matches = [];
  const visit = current => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name.endsWith('.map')) matches.push(path);
    }
  };
  visit(resolve(directory));
  if (matches.length !== 1) fail(`expected one source map in ${directory}, found ${matches.length}`);
  return matches[0];
}

function packageRoot(source, packageName) {
  const normalized = `/${source.replaceAll('\\', '/').replace(/^\/+/, '')}`;
  const suffix = `/node_modules/${packageName}/`;
  const index = normalized.indexOf(suffix);
  return index === -1 ? null : normalized.slice(0, index + suffix.length - 1);
}

function inspectSourceMap(platform, directory) {
  const path = findSourceMap(directory);
  const bytes = readFileSync(path);
  let map;
  try {
    map = JSON.parse(bytes);
  } catch {
    fail(`${platform} source map is not valid JSON`);
  }
  if (
    map.version !== 3
    || !Array.isArray(map.sources)
    || map.sources.some(source => typeof source !== 'string')
    || !Array.isArray(map.sourcesContent)
    || map.sourcesContent.length !== map.sources.length
    || typeof map.mappings !== 'string'
    || map.mappings.length === 0
  ) {
    fail(`${platform} source map has an unknown shape`);
  }
  const reactSources = map.sources.filter(source => packageRoot(source, 'react'));
  const reactRoots = [...new Set(reactSources.map(source => packageRoot(source, 'react')))];
  const reactDomRoots = [...new Set(map.sources.map(source => packageRoot(source, 'react-dom')).filter(Boolean))];
  if (JSON.stringify(reactRoots) !== JSON.stringify(['/apps/mobile/node_modules/react'])) {
    fail(`${platform} bundle React origins differ from /apps/mobile/node_modules/react`);
  }
  if (reactSources.length < 2) fail(`${platform} source map does not contain enough React modules to prove the bundle origin`);
  const reactContentMissing = map.sources.some((source, index) => packageRoot(source, 'react') && !map.sourcesContent[index]);
  if (reactContentMissing) fail(`${platform} source map does not embed its React sources`);
  if (reactDomRoots.some(root => root !== '/apps/mobile/node_modules/react-dom')) {
    fail(`${platform} bundle contains React DOM outside apps/mobile`);
  }
  return {
    platform,
    path,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
    sources: map.sources.length,
    reactSources: reactSources.length,
    reactOrigins: reactRoots,
    reactDomOrigins: reactDomRoots,
  };
}

function packageVersion(projectRoot, path) {
  const directory = resolve(projectRoot, path);
  if (lstatSync(directory).isSymbolicLink()) fail(`${path} must be a real npm dependency directory, not a symlink`);
  return JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8')).version;
}

function checkSourceMaps(options) {
  exactOptions(options, ['--android-dir', '--ios-dir', '--project-root']);
  const projectRoot = resolve(options.get('--project-root'));
  const installed = {
    mobileReact: packageVersion(projectRoot, 'apps/mobile/node_modules/react'),
    mobileReactDom: packageVersion(projectRoot, 'apps/mobile/node_modules/react-dom'),
    rootReact: packageVersion(projectRoot, 'node_modules/react'),
    rootReactDom: packageVersion(projectRoot, 'node_modules/react-dom'),
  };
  const expected = { mobileReact: '19.2.3', mobileReactDom: '19.2.3', rootReact: '19.2.4', rootReactDom: '19.2.4' };
  if (JSON.stringify(installed) !== JSON.stringify(expected)) fail(`installed React versions differ from the accepted split: ${JSON.stringify(installed)}`);
  return {
    status: 'passed',
    installed,
    bundles: [
      inspectSourceMap('android', options.get('--android-dir')),
      inspectSourceMap('ios', options.get('--ios-dir')),
    ],
  };
}

try {
  const [command, ...values] = process.argv.slice(2);
  const options = parseOptions(values);
  const result = command === 'doctor' ? checkDoctor(options) : command === 'sourcemaps' ? checkSourceMaps(options) : fail('expected doctor or sourcemaps command');
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
