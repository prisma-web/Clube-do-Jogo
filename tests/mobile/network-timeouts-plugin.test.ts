import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// O plugin edita por string o MainApplication.kt gerado. A fixture é a cópia verbatim do
// MainApplication.kt que o prebuild do SDK 57 gera para este projeto.

const require = createRequire(import.meta.url);
const pluginPath = fileURLToPath(new URL('../../apps/mobile/plugins/withNetworkTimeouts.js', import.meta.url));
const templatePath = fileURLToPath(new URL('./fixtures/MainApplication.sdk57.kt', import.meta.url));

type MainApplicationConfig = { modResults: { language: string; contents: string } };

function loadMainApplicationMod() {
  const configPlugins = require('expo/config-plugins') as Record<string, unknown>;
  const original = configPlugins.withMainApplication;
  let mod: ((config: MainApplicationConfig) => MainApplicationConfig) | undefined;
  configPlugins.withMainApplication = (config: unknown, action: (config: MainApplicationConfig) => MainApplicationConfig) => {
    mod = action;
    return config;
  };
  try {
    delete require.cache[require.resolve(pluginPath)];
    (require(pluginPath) as (config: unknown) => unknown)({});
  } finally {
    configPlugins.withMainApplication = original;
  }
  assert.ok(mod, 'plugin não registrou um mod de MainApplication');
  return mod;
}

function transform(contents: string, language = 'kt'): string {
  return loadMainApplicationMod()({ modResults: { language, contents } }).modResults.contents;
}

const template = readFileSync(templatePath, 'utf8');

test('template de referência usa o OkHttp padrão do React Native, sem timeout nem ping', () => {
  assert.doesNotMatch(template, /OkHttpClientProvider/);
  assert.match(template, /\n {4}loadReactNative\(this\)\n/);
});

test('registra a fábrica do OkHttp com timeouts e ping antes de o React Native subir', () => {
  const output = transform(template);
  assert.match(output, /\nimport com\.facebook\.react\.modules\.network\.OkHttpClientProvider\n/);
  assert.match(output, /\nimport java\.util\.concurrent\.TimeUnit\n/);
  const factory = output.indexOf('OkHttpClientProvider.setOkHttpClientFactory');
  const load = output.indexOf('loadReactNative(this)');
  assert.ok(factory > 0 && factory < load, 'a fábrica precisa existir antes da primeira requisição');
  const block = output.slice(factory, load);
  assert.match(block, /createClientBuilder\(applicationContext\)/, 'mantém cookie jar e cache do builder do RN');
  assert.match(block, /\.connectTimeout\(20, TimeUnit\.SECONDS\)/);
  assert.match(block, /\.readTimeout\(60, TimeUnit\.SECONDS\)/);
  assert.match(block, /\.writeTimeout\(60, TimeUnit\.SECONDS\)/);
  assert.match(block, /\.pingInterval\(10, TimeUnit\.SECONDS\)/);
});

test('é idempotente', () => {
  const once = transform(template);
  assert.equal(transform(once), once);
});

test('falha alto se o template mudar', () => {
  assert.throws(() => transform(template.replace('    loadReactNative(this)\n', '')), /loadReactNative/);
  assert.throws(() => transform(template, 'java'), /Kotlin/);
});

test('app.config.ts aplica o plugin', () => {
  const appConfig = readFileSync(fileURLToPath(new URL('../../apps/mobile/app.config.ts', import.meta.url)), 'utf8');
  assert.match(appConfig, /'\.\/plugins\/withNetworkTimeouts'/);
});
