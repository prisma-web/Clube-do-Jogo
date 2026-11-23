import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// O plugin edita por string o android/app/build.gradle gerado. O template não vem em
// node_modules (o prebuild baixa o tarball), então a fixture é a cópia verbatim do
// build.gradle que o SDK 57 gera para este projeto.

const require = createRequire(import.meta.url);
const pluginPath = fileURLToPath(new URL('../../apps/mobile/plugins/withReleaseSigning.js', import.meta.url));
const templatePath = fileURLToPath(new URL('./fixtures/app-build.sdk57.gradle', import.meta.url));

type BuildGradleConfig = { modResults: { language: string; contents: string } };

function loadBuildGradleMod() {
  const configPlugins = require('expo/config-plugins') as Record<string, unknown>;
  const original = configPlugins.withAppBuildGradle;
  let mod: ((config: BuildGradleConfig) => BuildGradleConfig) | undefined;
  configPlugins.withAppBuildGradle = (config: unknown, action: (config: BuildGradleConfig) => BuildGradleConfig) => {
    mod = action;
    return config;
  };
  try {
    delete require.cache[require.resolve(pluginPath)];
    (require(pluginPath) as (config: unknown) => unknown)({});
  } finally {
    configPlugins.withAppBuildGradle = original;
  }
  assert.ok(mod, 'plugin não registrou um mod de app/build.gradle');
  return mod;
}

function transform(contents: string, language = 'groovy'): string {
  return loadBuildGradleMod()({ modResults: { language, contents } }).modResults.contents;
}

function block(contents: string, header: string): string {
  const start = contents.indexOf(header);
  assert.ok(start >= 0, `bloco ${header.trim()} ausente`);
  let depth = 0;
  for (let index = contents.indexOf('{', start); index < contents.length; index += 1) {
    if (contents[index] === '{') depth += 1;
    if (contents[index] === '}' && --depth === 0) return contents.slice(start, index + 1);
  }
  throw new Error(`bloco ${header.trim()} sem fechamento`);
}

const template = readFileSync(templatePath, 'utf8');

test('template de referência assina o release com a keystore de debug', () => {
  const release = block(block(template, '    buildTypes {'), '        release {');
  assert.match(release, /signingConfig signingConfigs\.debug/);
  assert.doesNotMatch(block(template, '    signingConfigs {'), /release/);
});

test('release assina com a keystore das variáveis quando ANDROID_KEYSTORE_PATH existe, e com a de debug sem ela', () => {
  const output = transform(template);

  for (const name of ['ANDROID_KEYSTORE_PATH', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']) {
    assert.match(output, new RegExp(`'${name}'`), `${name} não é lido`);
  }
  // Propriedade Gradle (-P ou gradle.properties) tem precedência sobre a variável de ambiente.
  assert.match(output, /findProperty\(name\) \?: System\.getenv\(name\)/);

  const signingConfigs = block(output, '    signingConfigs {');
  assert.match(signingConfigs, /storeFile file\('debug\.keystore'\)/);
  const release = block(signingConfigs, '            release {');
  assert.match(release, /storeFile file\(releaseKeystorePath\)/);

  const buildTypes = block(output, '    buildTypes {');
  assert.match(block(buildTypes, '        debug {'), /signingConfig signingConfigs\.debug/);
  assert.match(
    block(buildTypes, '        release {'),
    /signingConfig releaseKeystorePath \? signingConfigs\.release : signingConfigs\.debug/,
  );
});

test('keystore incompleta falha o build em vez de cair na assinatura de debug', () => {
  const output = transform(template);
  assert.match(output, /throw new GradleException\("ANDROID_KEYSTORE_PATH definido, mas faltam/);
  assert.match(output, /throw new GradleException\("Keystore de release não encontrada/);
});

test('transformação é idempotente, para prebuild repetido não duplicar a assinatura', () => {
  const once = transform(template);
  assert.equal(transform(once), once);
});

test('falha alto quando o template do Expo muda o bloco de release', () => {
  const drifted = template.replace('// see https://reactnative.dev/docs/signed-apk-android.\n', '');
  assert.notEqual(drifted, template);
  assert.throws(() => transform(drifted), /esperava exatamente 1 ocorrência/);
});

test('recusa build.gradle em Kotlin DSL', () => {
  assert.throws(() => transform(template, 'kt'), /só trata groovy/);
});
