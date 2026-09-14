# Builds locais do mobile

O mobile é compilado localmente com Expo CLI, Android SDK e Xcode. O Next mantém seu próprio build e deploy. Este fluxo usa AVDs Android e simuladores iOS no `macbook-2`, sem EAS, distribuição em lojas ou alterações no banco de produção. A [documentação de builds locais do Expo](https://docs.expo.dev/guides/local-app-overview/) descreve as ferramentas usadas.

## Configuração

`APP_VARIANT` aceita `development`, `preview` ou `production`. O padrão local é `development`, com identificador `com.clubedojogo.mobile.dev`. Preview e produção exigem `EXPO_APPLICATION_ID` explícito, mas não exigem conta ou projeto EAS. A variante seleciona a configuração do app; `Release` seleciona a compilação otimizada. Use `development` com `Release` para medir o app local.

Todas as variantes usam apenas o bundle embarcado. Updates remotos ficam desabilitados e não há URL de update nem metadados de projeto EAS. `runtimeVersion` mantém a política `fingerprint` para identificar o runtime nativo e registrar a proveniência dos builds.

Exporte `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_API_BASE_URL` e `EXPO_PUBLIC_SITE_URL` do ambiente local de teste. Os valores `EXPO_PUBLIC_*` entram no bundle. Nunca use service role, credenciais IGDB, APNs ou FCM nessas variáveis. `EXPO_NO_DOTENV=1` evita incorporar um ambiente diferente por arquivo `.env`.

Execute `npm ci` na raiz de cada checkout. Cada host e worktree mantém suas próprias dependências. Os diretórios `android` e `ios` são gerados por CNG. Antes de regenerá-los, preserve qualquer alteração nativa manual e confira se a variante e o identificador coincidem com o build pretendido.

## Android em AVD

Inicie um AVD dedicado e confirme seu serial com `adb devices`. Execute em `apps/mobile`, com as variáveis públicas do ambiente de teste já exportadas.

```sh
APP_VARIANT=development EXPO_NO_DOTENV=1 EXPO_LOCAL_HTTP=1 npx expo run:android --variant release --no-bundler --device "${ANDROID_SERIAL:?Defina o serial do AVD}"
```

`EXPO_LOCAL_HTTP=1` permite HTTP somente no Android de desenvolvimento. Preview e produção rejeitam essa opção. Se os serviços de teste usam `127.0.0.1` no bundle, configure `adb -s "$ANDROID_SERIAL" reverse tcp:55421 tcp:55421` e `adb -s "$ANDROID_SERIAL" reverse tcp:3101 tcp:3101` para a API Next deste ambiente. Não encaminhe Metro durante a medição de release.

O APK local usa a assinatura de desenvolvimento gerada pelo projeto. Ele serve para o AVD e não é apresentado como artefato de distribuição.

## iOS no Mac remoto

Acesse `ssh macbook-2`. Defina `CLUBE_CHECKOUT` com o caminho absoluto do checkout no Mac. Prepare o PATH também em SSH não interativo; os comandos abaixo usam o Node instalado nesse host. Confirme o host e o UDID dedicado antes de alterar qualquer perfil. Execute o SimSlim no Mac que hospeda o simulador.

```sh
export PATH="/opt/homebrew/bin:$HOME/.nvm/versions/node/v24.19.0/bin:$HOME/.maestro/bin:$PATH"
cd "${CLUBE_CHECKOUT:?Defina o checkout no Mac}"
npm ci
cd apps/mobile
```

```sh
hostname
simslim --help
simslim profiles
simslim doctor --list
simslim on "${IOS_UDID:?Defina o UDID dedicado}"
simslim status "$IOS_UDID"
simslim verify "$IOS_UDID"
```

O padrão mantém todas as categorias reduzidas. Quando o cenário exigir uma funcionalidade listada pelo `doctor`, confira `simslim doctor "$IOS_UDID" --requires <recurso>`. Se necessário, preserve apenas a categoria ou daemon indispensável com `--except` ou `--keep`, registre o motivo e restaure a redução máxima depois do teste. Não altere simuladores de outras sessões. Rede local, AsyncStorage e cache do app não exigem iCloud ou sincronização de Keychain.

No checkout do Mac, instale as dependências próprias e gere o projeto iOS a partir de `apps/mobile`.

```sh
APP_VARIANT=development EXPO_NO_DOTENV=1 npx expo prebuild --platform ios --no-install
```

O `package.json` do mobile exclui `@expo/ui` e `@expo/dom-webview` do [autolinking iOS](https://docs.expo.dev/modules/autolinking/#exclude). O Router usa Expo UI nas toolbars Android; o bundle iOS atual não consome esses módulos. A exclusão evita construir suas definições nativas durante a abertura do app. Ao adicionar uma tela iOS que use um deles, remova a exclusão correspondente e gere outro binário.

Execute `pod install` dentro de `apps/mobile/ios`. Depois, em `apps/mobile`, compile com assinatura ad hoc local e instale no simulador dedicado.

```sh
APP_VARIANT=development EXPO_NO_DOTENV=1 xcodebuild -workspace ios/ClubedoJogo.xcworkspace -scheme ClubedoJogo -configuration Release -destination "id=${IOS_UDID:?Defina o UDID dedicado}" -derivedDataPath ios/build -jobs 2 CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- ONLY_ACTIVE_ARCH=YES ARCHS=arm64 build
xcrun simctl install "$IOS_UDID" ios/build/Build/Products/Release-iphonesimulator/ClubedoJogo.app
```

Execute a instalação somente após o build terminar com sucesso. A assinatura local é necessária. O build sem assinatura falhou no acesso ao Keychain usado pelo Expo Notifications. O `.app` arm64 desse comando é um artefato de simulador.

Para acessar os serviços Linux pelo loopback do Mac, mantenha um túnel SSH reverso apenas para as portas de Supabase e Next usadas pelo teste. Confira que o app abre com Metro indisponível.

## Atualização e reversão locais

Arquive cada APK ou `.app` com commit, hash do arquivo, fingerprint, sistema, dispositivo e configuração. Instale o candidato sobre o binário anterior mantendo o identificador e a assinatura. Reabra o app e confirme sessão, preferências e notas. Para reverter, reinstale o artefato anterior preservado e repita as mesmas verificações.

O bundle muda pela instalação do binário. Não há canal de OTA, publicação EAS ou rollback remoto neste fluxo. Uma reversão de binário não desfaz dados ou migrações. Preserve a compatibilidade com o schema existente e com notas já armazenadas.

## Evidência e limites

Registre unit, live e perf separadamente. Faça cinco aquecimentos e dez amostras em release para o tempo de abertura. Guarde todos os valores, o p95, o limite aplicado e a identidade da fixture. Compilar e exportar Hermes não comprovam instalação ou desempenho.

Notificações remotas permanecem indisponíveis sem configuração de transporte. Os testes locais cobrem fila e receipts sintéticos, recebimento de payload injetado, sessão e abertura do destino. Não descreva esses resultados como entrega por Expo Push Service, APNs ou FCM.

O escopo atual não inclui aparelhos físicos, lojas, credenciais de distribuição ou OTA remota. Os critérios restantes de acessibilidade, navegação, privacidade e desempenho continuam sendo executados nos AVDs e simuladores dedicados.
