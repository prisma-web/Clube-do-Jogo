import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const pluginPath = fileURLToPath(new URL('../../apps/mobile/plugins/withUISceneLifecycle.js', import.meta.url));
const templatePath = fileURLToPath(new URL('./fixtures/AppDelegate.sdk57.swift', import.meta.url));

type Mod<T> = (config: unknown, action: (config: T) => T) => unknown;
type AppDelegateConfig = { modResults: { language: string; contents: string } };
type InfoPlistConfig = { modResults: Record<string, unknown> };

function loadPluginMods() {
  const configPlugins = require('expo/config-plugins') as Record<string, unknown>;
  const original = { withAppDelegate: configPlugins.withAppDelegate, withInfoPlist: configPlugins.withInfoPlist };
  let appDelegateMod: ((config: AppDelegateConfig) => AppDelegateConfig) | undefined;
  let infoPlistMod: ((config: InfoPlistConfig) => InfoPlistConfig) | undefined;

  configPlugins.withAppDelegate = ((config, action) => {
    appDelegateMod = action;
    return config;
  }) as Mod<AppDelegateConfig>;
  configPlugins.withInfoPlist = ((config, action) => {
    infoPlistMod = action;
    return config;
  }) as Mod<InfoPlistConfig>;

  try {
    delete require.cache[require.resolve(pluginPath)];
    (require(pluginPath) as (config: unknown) => unknown)({});
  } finally {
    Object.assign(configPlugins, original);
  }

  assert.ok(appDelegateMod, 'plugin não registrou um mod de AppDelegate');
  assert.ok(infoPlistMod, 'plugin não registrou um mod de Info.plist');
  return { appDelegateMod, infoPlistMod };
}

function transform(contents: string): string {
  const { appDelegateMod } = loadPluginMods();
  return appDelegateMod({ modResults: { language: 'swift', contents } }).modResults.contents;
}

const template = readFileSync(templatePath, 'utf8');

test('template de referência é o que o plugin espera: sem cenas e criando a própria janela', () => {
  assert.match(template, /window = UIWindow\(frame: UIScreen\.main\.bounds\)/);
  assert.doesNotMatch(template, /SceneDelegate/);
});

test('adota UIScene: janela sai do AppDelegate e nasce na cena, com launchOptions preservadas', () => {
  const output = transform(template);

  assert.doesNotMatch(output, /window = UIWindow\(frame: UIScreen\.main\.bounds\)/);
  assert.match(output, /AppDelegate\.sceneLaunchOptions = launchOptions/);
  assert.match(output, /static var sceneLaunchOptions: \[UIApplication\.LaunchOptionsKey: Any\]\?/);

  assert.match(output, /class SceneDelegate: UIResponder, UIWindowSceneDelegate/);
  assert.match(output, /configuration\.delegateClass = SceneDelegate\.self/);
  assert.match(output, /UIWindow\(windowScene: windowScene\)/);
  assert.match(output, /factory\.startReactNative\(/);

  assert.match(output, /func scene\(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>\)/);
  assert.match(output, /func scene\(_ scene: UIScene, continue userActivity: NSUserActivity\)/);
  assert.match(output, /appDelegate\.application\(UIApplication\.shared, open: context\.url, options: options\)/);

  assert.match(output, /launchOptions\[\.url\] = url/);
});

test('transformação é idempotente, para prebuild repetido não duplicar o delegate', () => {
  const once = transform(template);
  const twice = transform(once);
  assert.equal(twice, once);
});

test('falha alto quando o template do Expo muda, em vez de gerar janela em branco', () => {
  const drifted = template.replace('window = UIWindow(frame: UIScreen.main.bounds)', 'window = UIWindow()');
  assert.notEqual(drifted, template);
  assert.throws(() => transform(drifted), /esperava exatamente 1 ocorrência/);
});

test('manifesto de cena declara configuração única apontando para UIWindowScene', () => {
  const { infoPlistMod } = loadPluginMods();
  const plist = infoPlistMod({ modResults: {} }).modResults;
  const manifest = plist.UIApplicationSceneManifest as Record<string, unknown>;

  assert.equal(manifest.UIApplicationSupportsMultipleScenes, false);
  const roles = manifest.UISceneConfigurations as Record<string, unknown>;
  const application = roles.UIWindowSceneSessionRoleApplication as Record<string, string>[];
  assert.equal(application.length, 1);
  assert.equal(application[0].UISceneClassName, 'UIWindowScene');
  assert.equal(application[0].UISceneDelegateClassName, undefined);
});
