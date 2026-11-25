// Config plugins do Expo são carregados com require na avaliação de app.config.ts,
// então este arquivo precisa ser CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withMainApplication } = require('expo/config-plugins');

/**
 * Dá timeouts e ping HTTP/2 ao OkHttp que o `fetch` do React Native usa no Android.
 *
 * O cliente padrão (OkHttpClientProvider.createClientBuilder) sai com connect, read e write
 * timeout 0, isto é, sem limite, e sem ping. Quando a rede de uma conexão some sem o Android
 * destruir o socket (dados móveis que caem e voltam pelo wifi, sinal fraco), o pedido fica
 * pendurado para sempre, e a conexão morta continua no pool recebendo os pedidos seguintes do
 * mesmo host. Foi isso que travou a fila de anotações: o envio nunca terminava, e nem a
 * leitura nem "Sincronizar novamente" saíam depois que a rede voltava.
 *
 * Com `pingInterval`, um ping sem resposta derruba a conexão: os pedidos dela falham com erro
 * e os seguintes abrem conexão nova. Read e write de 60 s igualam o timeout padrão do
 * NSURLSession no iOS. O WebSocket do RN usa outro cliente e não é afetado.
 */

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
    // Antes do React Native subir: o NetworkingModule cria o cliente na primeira requisição.
    contents = replaceOnce(contents, LOAD_ANCHOR, FACTORY + LOAD_ANCHOR, 'loadReactNative(this)');
    cfg.modResults.contents = contents;
    return cfg;
  });
};
