import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const mobileRoot = fileURLToPath(new URL('../../apps/mobile/', import.meta.url));
const expoBin = fileURLToPath(new URL('../../node_modules/expo/bin/cli', import.meta.url));

function readConfig(variables: Record<string, string> = {}) {
  const env = { ...process.env };
  for (const key of ['APP_VARIANT', 'APP_VERSION', 'EAS_BUILD_PROFILE', 'EXPO_APPLICATION_ID', 'EXPO_EAS_PROJECT_ID', 'EXPO_LOCAL_HTTP', 'EXPO_PUBLIC_SITE_URL']) {
    delete env[key];
  }
  return spawnSync(process.execPath, [expoBin, 'config', '--type', 'public', '--json'], {
    cwd: mobileRoot,
    env: { ...env, EXPO_NO_DOTENV: '1', EXPO_NO_TELEMETRY: '1', ...variables },
    encoding: 'utf8',
    timeout: 30_000,
  });
}

test('build local mantém identidade de desenvolvimento e usa somente o bundle embarcado', () => {
  const result = readConfig();
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.equal(config.android.package, 'com.clubedojogo.mobile.dev');
  assert.equal(config.ios.bundleIdentifier, 'com.clubedojogo.mobile.dev');
  assert.equal(config.updates.enabled, false);
  assert.equal(config.updates.url, undefined);
  assert.deepEqual(config.runtimeVersion, { policy: 'fingerprint' });
});

test('associated domain aceita só host https sem porta e cai no domínio de produção nos outros casos', () => {
  const production = ['webcredentials:clube-do-jogo-coral.vercel.app'];
  const cases: Array<[string | undefined, string[]]> = [
    [undefined, production],
    ['https://staging.example.com', ['webcredentials:staging.example.com']],
    ['http://localhost:3000', production],
    // The localhost case above never reaches the https rule; the dotted-host rule rejects it first.
    ['http://staging.example.com', production],
    ['https://example.com:8443', production],
    ['not-a-url', production],
    ['https://localhost', production],
  ];
  for (const [siteUrl, expected] of cases) {
    const result = readConfig(siteUrl === undefined ? {} : { EXPO_PUBLIC_SITE_URL: siteUrl });
    assert.equal(result.status, 0, `${siteUrl}: ${result.stderr}`);
    const config = JSON.parse(result.stdout);
    assert.deepEqual(config.ios.associatedDomains, expected, `EXPO_PUBLIC_SITE_URL=${siteUrl}`);
  }
});

test('preview e produção geram configuração sem projeto EAS e usam somente o bundle embarcado', () => {
  for (const variant of ['preview', 'production']) {
    const result = readConfig({
      APP_VARIANT: variant,
      EXPO_APPLICATION_ID: `com.example.club.${variant}`,
    });
    assert.equal(result.status, 0, result.stderr);
    const config = JSON.parse(result.stdout);
    assert.equal(config.android.package, `com.example.club.${variant}`);
    assert.equal(config.ios.bundleIdentifier, `com.example.club.${variant}`);
    assert.equal(config.updates.enabled, false);
    assert.equal(config.updates.url, undefined);
    assert.equal(config.extra?.eas, undefined);
  }
});

test('configuração EAS herdada não altera variante nem adiciona serviços remotos', () => {
  const result = readConfig({ EAS_BUILD_PROFILE: 'production', EXPO_EAS_PROJECT_ID: 'unused' });
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.equal(config.android.package, 'com.clubedojogo.mobile.dev');
  assert.equal(config.updates.enabled, false);
  assert.equal(config.updates.url, undefined);
  assert.equal(config.extra?.eas, undefined);
});

test('produção não herda identificação local quando falta configuração de distribuição', () => {
  const result = readConfig({ APP_VARIANT: 'production' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Defina EXPO_APPLICATION_ID/);
});

test('variante desconhecida é rejeitada antes de gerar o projeto nativo', () => {
  const result = readConfig({ APP_VARIANT: 'staging' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /APP_VARIANT deve ser/);
});

test('HTTP local exige opt-in de desenvolvimento e não entra em preview', () => {
  const local = readConfig({ EXPO_LOCAL_HTTP: '1' });
  assert.equal(local.status, 0, local.stderr);
  const config = JSON.parse(local.stdout);
  const properties = config.plugins.find((plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties');
  assert.equal(properties[1].android.usesCleartextTraffic, true);
  const preview = readConfig({
    APP_VARIANT: 'preview',
    EXPO_APPLICATION_ID: 'com.example.club.preview',
    EXPO_LOCAL_HTTP: '1',
  });
  assert.notEqual(preview.status, 0);
  assert.match(preview.stderr, /EXPO_LOCAL_HTTP só pode ser usado/);
});

function readDistributedConfig(variant: string, variables: Record<string, string> = {}) {
  return readConfig({ APP_VARIANT: variant, EXPO_APPLICATION_ID: `com.example.club.${variant}`, ...variables });
}

test('versão vem de APP_VERSION e o versionCode do Android deriva dela', () => {
  const fallback = readConfig();
  assert.equal(fallback.status, 0, fallback.stderr);
  assert.equal(JSON.parse(fallback.stdout).version, '0.1.0');
  assert.equal(JSON.parse(fallback.stdout).android.versionCode, 100);

  const cases: Array<[string, number]> = [['1.2.3', 10203], ['0.10.0', 1000], ['2.0.99', 20099], ['10.99.99', 109999]];
  for (const [version, versionCode] of cases) {
    const result = readDistributedConfig('production', { APP_VERSION: version });
    assert.equal(result.status, 0, `${version}: ${result.stderr}`);
    const config = JSON.parse(result.stdout);
    assert.equal(config.version, version);
    assert.equal(config.android.versionCode, versionCode, `APP_VERSION=${version}`);
    assert.equal(config.ios.buildNumber, '1');
  }
});

test('builds distribuídos recusam APP_VERSION fora de X.Y.Z com minor e patch abaixo de 100', () => {
  for (const version of ['1.2', 'v1.2.3', '1.2.3-beta', '1.100.0', '1.2.100', '01.2.3', 'abc']) {
    for (const variant of ['preview', 'production']) {
      const result = readDistributedConfig(variant, { APP_VERSION: version });
      assert.notEqual(result.status, 0, `${variant} aceitou APP_VERSION=${version}`);
      assert.match(result.stderr, /APP_VERSION/);
    }
  }
});

test('desenvolvimento com APP_VERSION mal formada volta para a versão padrão', () => {
  const result = readConfig({ APP_VERSION: 'v1.2' });
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.equal(config.version, '0.1.0');
  assert.equal(config.android.versionCode, 100);
});

test('só a produção checa atualização do APK e pede permissão para instalar pacotes', () => {
  const production = readDistributedConfig('production');
  assert.equal(production.status, 0, production.stderr);
  const config = JSON.parse(production.stdout);
  assert.deepEqual(config.extra?.apkUpdates, { repo: 'prisma-web/Clube-do-Jogo' });
  assert.ok(config.android.permissions?.includes('android.permission.REQUEST_INSTALL_PACKAGES'));

  for (const result of [readConfig(), readDistributedConfig('preview')]) {
    assert.equal(result.status, 0, result.stderr);
    const other = JSON.parse(result.stdout);
    assert.equal(other.extra?.apkUpdates, undefined);
    assert.ok(!(other.android.permissions ?? []).includes('android.permission.REQUEST_INSTALL_PACKAGES'));
  }
});

function readIntrospectedSchemes(variables: Record<string, string>) {
  const env = { ...process.env };
  for (const key of ['APP_VARIANT', 'EXPO_APPLICATION_ID', 'EXPO_LOCAL_HTTP']) delete env[key];
  const result = spawnSync(process.execPath, [expoBin, 'config', '--type', 'introspect', '--json'], {
    cwd: mobileRoot,
    env: { ...env, EXPO_NO_DOTENV: '1', EXPO_NO_TELEMETRY: '1', ...variables },
    encoding: 'utf8',
    timeout: 120_000,
  });
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  const urlTypes: Array<{ CFBundleURLSchemes?: string[] }> = config.ios?.infoPlist?.CFBundleURLTypes ?? [];
  return urlTypes.flatMap(type => type.CFBundleURLSchemes ?? []);
}

test('o esquema exp+ do dev client só existe na variante development', () => {
  assert.ok(readIntrospectedSchemes({}).includes('exp+clube-do-jogo'));
  for (const variant of ['preview', 'production']) {
    const schemes = readIntrospectedSchemes({ APP_VARIANT: variant, EXPO_APPLICATION_ID: `com.example.club.${variant}` });
    assert.ok(schemes.includes('clubedojogo'), `${variant} mantém o esquema do app: ${schemes.join(',')}`);
    assert.ok(!schemes.some(scheme => scheme.startsWith('exp+')), `${variant} vazou esquema do dev client: ${schemes.join(',')}`);
  }
});
