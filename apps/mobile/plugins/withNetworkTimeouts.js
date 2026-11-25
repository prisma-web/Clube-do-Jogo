// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withMainApplication } = require('expo/config-plugins');

const MARKER = 'withNetworkTimeouts';

const IMPORTS = `import com.facebook.react.modules.network.OkHttpClientProvider
import java.util.concurrent.TimeUnit
`;

const FACTORY = `    // Pedidos sem limite de tempo nem ping (plugins/${MARKER}.js).
    OkHttpClientProvider.setOkHttpClientFactory {
      OkHttpClientProvider.createClientBuilder(applicationContext)
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .pingInterval(10, TimeUnit.SECONDS)
        .build()
    }
`;

const IMPORT_ANCHOR = 'import com.facebook.react.ReactApplication\n';
const LOAD_ANCHOR = '    loadReactNative(this)\n';

function replaceOnce(contents, needle, replacement, what) {
  const occurrences = contents.split(needle).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `${MARKER}: esperava exatamente 1 ocorrência de ${what} em MainApplication.kt, achei ${occurrences}. ` +
        'O template do Expo mudou; revise o plugin antes de gerar o app.'
    );
  }
  return contents.replace(needle, replacement);
}

module.exports = function withNetworkTimeouts(config) {
  return withMainApplication(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') {
      throw new Error(`${MARKER}: MainApplication em ${cfg.modResults.language}, o plugin só trata Kotlin.`);
    }
    let contents = cfg.modResults.contents;
    if (contents.includes(MARKER)) {
      return cfg;
    }
    contents = replaceOnce(contents, IMPORT_ANCHOR, IMPORT_ANCHOR + IMPORTS, 'o import de ReactApplication');
    contents = replaceOnce(contents, LOAD_ANCHOR, FACTORY + LOAD_ANCHOR, 'loadReactNative(this)');
    cfg.modResults.contents = contents;
    return cfg;
  });
};
