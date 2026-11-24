// Config plugins do Expo são carregados com require na avaliação de app.config.ts,
// então este arquivo precisa ser CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Faz o build `release` do Android assinar com a keystore de distribuição.
 *
 * A keystore é lida na hora do Gradle, de propriedade (-P ou gradle.properties) ou
 * variável de ambiente: ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD,
 * ANDROID_KEY_ALIAS e ANDROID_KEY_PASSWORD. Assim nenhum segredo vai parar no
 * android/ gerado. Sem ANDROID_KEYSTORE_PATH, o release continua com a keystore
 * de debug do template, como antes.
 */

const MARKER = 'releaseSigningValue';

const SIGNING_HELPERS = `// Assinatura de release (plugins/withReleaseSigning.js).
def ${MARKER} = { String name -> (findProperty(name) ?: System.getenv(name))?.toString() ?: null }
def releaseKeystorePath = ${MARKER}('ANDROID_KEYSTORE_PATH')
if (releaseKeystorePath) {
    def missing = ['ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD'].findAll { !${MARKER}(it) }
    if (missing) {
        throw new GradleException("ANDROID_KEYSTORE_PATH definido, mas faltam \${missing.join(', ')} para assinar o release.")
    }
    if (!file(releaseKeystorePath).isFile()) {
        throw new GradleException("Keystore de release não encontrada em \${releaseKeystorePath}.")
    }
}

android {`;

const DEBUG_SIGNING_CONFIG = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
`;

const RELEASE_SIGNING_CONFIG = `        if (releaseKeystorePath) {
            release {
                storeFile file(releaseKeystorePath)
                storePassword ${MARKER}('ANDROID_KEYSTORE_PASSWORD')
                keyAlias ${MARKER}('ANDROID_KEY_ALIAS')
                keyPassword ${MARKER}('ANDROID_KEY_PASSWORD')
            }
        }
`;

const RELEASE_BUILD_TYPE_SIGNING = `            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
`;

function replaceOnce(contents, needle, replacement, what) {
  const occurrences = contents.split(needle).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `withReleaseSigning: esperava exatamente 1 ocorrência de ${what} em android/app/build.gradle, achei ${occurrences}. ` +
        'O template do Expo mudou; revise o plugin antes de gerar um release.'
    );
  }
  return contents.replace(needle, replacement);
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error(`withReleaseSigning: build.gradle em ${cfg.modResults.language}, o plugin só trata groovy.`);
    }
    let contents = cfg.modResults.contents;
    if (contents.includes(MARKER)) {
      return cfg;
    }
    contents = replaceOnce(contents, '\nandroid {', `\n${SIGNING_HELPERS}`, 'o bloco `android {`');
    contents = replaceOnce(
      contents,
      DEBUG_SIGNING_CONFIG,
      DEBUG_SIGNING_CONFIG + RELEASE_SIGNING_CONFIG,
      'a signingConfig de debug'
    );
    contents = replaceOnce(
      contents,
      RELEASE_BUILD_TYPE_SIGNING,
      '            signingConfig releaseKeystorePath ? signingConfigs.release : signingConfigs.debug\n',
      'a assinatura do buildType release'
    );
    cfg.modResults.contents = contents;
    return cfg;
  });
};
