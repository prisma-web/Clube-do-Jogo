# Builds locais do mobile

O mobile é compilado localmente com Expo CLI, Android SDK e Xcode. O Next mantém seu próprio build e deploy. Este fluxo usa AVDs Android e simuladores iOS no `macbook-2`, sem EAS ou alterações no banco de produção. A distribuição sai das tags `vX.Y.Z`: o APK Android vai para o GitHub Release ([Release do APK Android](#release-do-apk-android)) e o app iOS vai para o TestFlight ([Release iOS no TestFlight](#release-ios-no-testflight)). A [documentação de builds locais do Expo](https://docs.expo.dev/guides/local-app-overview/) descreve as ferramentas usadas.

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

O APK local usa a assinatura de desenvolvimento gerada pelo projeto. Ele serve para o AVD e não é apresentado como artefato de distribuição. O APK distribuído aos membros sai do workflow descrito em [Release do APK Android](#release-do-apk-android).

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

## Release do APK Android

Membros instalam o APK de produção a partir do GitHub Release mais recente de `prisma-web/Clube-do-Jogo`. A cada abertura, o app Android de produção consulta esse release. Se a versão for mais nova que a instalada, ele mostra um modal com "Atualizar" e "Depois". "Atualizar" baixa o APK e abre o instalador do Android. "Depois" esconde o modal até a próxima abertura. Development, preview e iOS não fazem essa consulta.

### Novidades da versão

As Novidades vêm das notas em `updates/notes/`, uma por mudança que o membro percebe. Todo PR adiciona uma nota ou leva a label `sem-novidade`, e o workflow `.github/workflows/release-note.yml` cobra isso. A skill `release-note` explica o formato e como capturar a imagem.

No release, o workflow lista as tags com release publicado (`gh release list`, sem rascunhos) e roda `node scripts/release-notes.mjs assemble vX.Y.Z --released <tags>`. Ele junta as notas adicionadas desde o release anterior, que é a maior tag `vX.Y.Z` menor que a atual, ancestral dela e com release publicado, na ordem dos commits que as adicionaram. Uma tag cujo build falhou não tem release, então as notas dela entram no próximo release publicado. Uma nota renomeada com o conteúdo quase igual (o git a vê como renomeação, com 50% ou mais de semelhança) mantém o lugar e não é anunciada de novo. O resultado vai como `product-update.json`, segundo asset do release. As imagens apontam para `raw.githubusercontent.com` na tag, então não mudam depois. Sem nota nova, o release não tem `product-update.json`.

Com `--history-out`, o mesmo comando escreve `product-updates.json`, terceiro asset: `{ "id": "vX.Y.Z", "releases": [...] }`, com o `product-update.json` de cada release publicado até a tag, do mais novo para o mais antigo, refeito pela mesma regra a partir das tags. Vão os 25 releases mais recentes que têm notas. Um release antigo cujas notas não passam mais na validação fica de fora com um aviso; uma nota inválida na tag atual continua falhando o job. O histórico sai mesmo quando a tag atual não tem nota nova, para quem pulou versões ver o que perdeu. Versões do app até a v1.3.x só leem o `product-update.json`, que não mudou.

As Novidades não usam a API do GitHub, que limita 60 pedidos por hora por IP. O app Android de produção baixa `https://github.com/prisma-web/Clube-do-Jogo/releases/download/vX.Y.Z/product-updates.json` da versão instalada e só aceita o arquivo se o `id` for essa tag. No site, o navegador pede `/api/product-update` depois de abrir a página. Essa rota baixa `releases/latest/download/product-updates.json` sem o cache de dados do Next (e, se o release mais recente ainda não tiver histórico, o `product-update.json` dele) e responde `{ history }`, com o histórico ou `null`.

Os dois mostram as versões publicadas depois da última que o membro fechou, da mais nova para a mais antiga, em páginas de até 10 notas com versões inteiras (`productUpdateDigest` em `packages/domain`). No fim de cada página, um botão `Mais N novidades …` abre a próxima. A última vista é a maior tag com a chave `clube-do-jogo:product-update:vX.Y.Z:completed` em `true`, que todas as versões desde a v1.2.0 gravam ao fechar as Novidades (no app, com o escopo da conta). O app também grava `clube-do-jogo:product-update:last-seen`, que vale depois que a versão sai do histórico, e, para saber de qual versão o membro veio quando ele nunca fechou as Novidades, usa o cache `clube-do-jogo:product-update:release` das versões antigas ou o histórico em cache da versão anterior, guardado em `clube-do-jogo:product-update:from` até ele fechar. Quando não há nada pendente, a versão atual já conta como vista, para que uma versão sem notas também sirva de ponto de partida. Sem nada disso, a instalação é nova e aparece só a versão atual. Em Configurações, `Ver novamente` repete o que abriu na sessão; quando não há nada pendente, mostra a versão atual e, depois dela, as anteriores. A CDN guarda a resposta por uma hora, inclusive quando o release não tem notas, e por um minuto quando o GitHub falha. Nenhuma página e nenhum build esperam o GitHub. Todo download desiste em 3 s, e qualquer falha não mostra nada.

No app, a última cópia válida fica no AsyncStorage e a folha abre uma vez por versão. "Ver novidades" em Configurações reabre essa cópia e some quando não há nenhuma. Um 404 (versão sem notas) não é buscado de novo até o app abrir a frio. Uma falha de rede ou timeout tenta de novo quando o app volta para o primeiro plano.

### Configuração única da keystore

Rode `scripts/android-release-keystore.sh` uma vez, a partir do checkout. O wizard gera a keystore de release fora do repositório e grava no repositório os secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` e `ANDROID_KEY_PASSWORD`. Ao rodar de novo, ele reaproveita a keystore que já existe. Guarde o arquivo, o alias e a senha num cofre. Sem eles, nenhum APK novo instala por cima do atual, e cada membro precisa desinstalar e instalar de novo. APKs antigos assinados com a keystore de debug também exigem essa reinstalação uma única vez.

O workflow também lê as variables do repositório `EXPO_APPLICATION_ID`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_API_BASE_URL` e `EXPO_PUBLIC_SITE_URL`. As quatro `EXPO_PUBLIC_*` também podem ficar em secrets. Sem qualquer uma delas, o workflow falha no primeiro passo e lista as que faltam.

### Cortar uma versão

A versão é o `X.Y.Z` da tag, com minor e patch abaixo de 100. O `versionCode` do Android vale `X*10000 + Y*100 + Z`. Escreva a mensagem da tag em português, porque ela vira o texto de novidades mostrado no modal.

```sh
git tag -a v1.2.0 -m "Votação mais rápida e correções no ranking."
git push origin v1.2.0
```

O push da tag dispara `.github/workflows/android-release.yml`. Ele gera o projeto Android com `APP_VARIANT=production` e `APP_VERSION` tirada da tag, compila `assembleRelease` assinado com a keystore e confere que o APK não saiu com a assinatura de debug e que tem o `versionName` da tag. Depois publica `clube-do-jogo-vX.Y.Z.apk`, `product-update.json` quando há nota nova e `product-updates.json` quando algum release até a tag tem notas. Uma nota inválida falha o job antes do build. Rodar o job de novo substitui os assets do release existente. Se o build falhar, rode o job de novo ou publique a próxima tag. As notas da tag que falhou entram no próximo release publicado. Assim que o release sai, a próxima abertura do app instalado mostra o modal.

Localmente, `plugins/withReleaseSigning.js` assina o release com a keystore de `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` e `ANDROID_KEY_PASSWORD`, lidos do ambiente ou de propriedades Gradle na hora do build. Sem `ANDROID_KEYSTORE_PATH`, o release continua com a keystore de debug.

## Release iOS no TestFlight

O mesmo push da tag `vX.Y.Z` dispara `.github/workflows/ios-release.yml`, separado do workflow do Android. Uma falha no iOS não afeta o APK nem o GitHub Release. O job roda na imagem `xcode-27` com o Xcode 27.1. Com o Xcode 26.6 da imagem `macos-26`, o export terminou sem erro mas devolveu o `.ipa` com a assinatura ad hoc do archive, e o App Store Connect o recusou; o mesmo archive, exportado com o Xcode 27.1, sai assinado pelo certificado Apple Distribution do time. O App Store Connect aceita builds de Xcode 26 ou mais novo, e o Expo SDK 57 pede Xcode 26.4 ou mais novo. Para trocar de Xcode, mude `XCODE_APP` e a imagem do runner no workflow.

O job confere a tag e as credenciais, instala Node e Ruby e roda `bundle exec fastlane ios beta` em `apps/mobile`. A lane está em `apps/mobile/fastlane/Fastfile`, com fastlane e CocoaPods fixados em `apps/mobile/Gemfile.lock`. Ela:

1. Consulta o último build enviado ao App Store Connect, de qualquer versão e mesmo ainda em processamento, e usa esse número + 1 como `CFBundleVersion` (`IOS_BUILD_NUMBER` em `app.config.ts`). O primeiro upload é o build 1. A versão (`CFBundleShortVersionString`) é o `X.Y.Z` da tag.
2. Gera o projeto com `npx expo prebuild --platform ios --clean` e `APP_VARIANT=production`, e roda `pod install`.
3. Compila o archive Release sem assinatura e depois o assina ad hoc com `codesign`: os frameworks embutidos e o `.app`, este com `ios/ClubedoJogo/ClubedoJogo.entitlements`. Não precisa de certificado nem de aparelho registrado. O Xcode não assina ad hoc um app de iPhone sozinho (pede provisioning profile), por isso a assinatura fica fora dele. Os entitlements nessa assinatura são o que o export usa para montar o profile.
4. Exporta o `.ipa` para App Store Connect com assinatura automática na nuvem da Apple (certificado de distribuição gerenciado pela Apple), usando a API key com `-allowProvisioningUpdates`. O Xcode cria ou atualiza sozinho o provisioning profile de App Store. Nenhum certificado ou profile fica no repositório, nos secrets ou no runner.
5. Confere que o `.ipa` saiu assinado pelo certificado Apple Distribution do time e falha antes do upload se não saiu.
6. Envia ao TestFlight sem esperar o processamento. O grupo interno com distribuição automática recebe o build quando a Apple termina de processar, em geral entre 5 e 30 minutos.

`app.config.ts` declara `ITSAppUsesNonExemptEncryption = false`, porque o app só usa HTTPS e a criptografia do sistema. Sem isso, cada build espera a resposta de conformidade de exportação no App Store Connect. Revise se o app passar a usar criptografia própria.

`bundle exec fastlane ios archive` faz os passos 2 e 3 sem conta da Apple, para conferir num Mac que o projeto de produção compila. Ele exige as mesmas variáveis `EXPO_APPLICATION_ID` e `EXPO_PUBLIC_*` do release.

### Configuração única na Apple

Faça uma vez, com a conta do Apple Developer Program:

1. Em [developer.apple.com/account](https://developer.apple.com/account), em Membership details, copie o Team ID (10 caracteres). Ele vai na variable `APPLE_TEAM_ID`.
2. Confira que o Account Holder aceitou os contratos mais recentes em developer.apple.com e em App Store Connect → Business. Com um contrato pendente, o upload falha.
3. Em Certificates, Identifiers & Profiles → Identifiers → +, registre um App ID do tipo App, explícito, com o bundle ID igual à variable `EXPO_APPLICATION_ID` (`com.clubedojogo.mobile`). Marque as capabilities **Push Notifications** e **Associated Domains**, que o app declara (`aps-environment` do `expo-notifications` e `webcredentials:` para o preenchimento de senhas). Se a Apple disser que o identificador já está em uso, ele pertence a outra conta. Trocar o ID muda também o pacote do Android, então decida isso antes do primeiro release iOS.
4. Em [App Store Connect](https://appstoreconnect.apple.com) → Apps → + → New App, crie o app: plataforma iOS, nome Clube do Jogo, idioma principal Português (Brasil), o bundle ID do passo 3 e um SKU qualquer (por exemplo `clube-do-jogo`).
5. No app, em TestFlight → Internal Testing → +, crie o grupo interno e deixe marcada a distribuição automática ("Enable automatic distribution"). Adicione os testadores. Testador interno precisa ser usuário do time em Users and Access, com qualquer papel; convide lá primeiro quem ainda não for.
6. Em Users and Access → Integrations → App Store Connect API → Team Keys, gere uma chave com acesso **Admin**. A assinatura na nuvem usa o certificado de distribuição gerenciado pela Apple, e chaves App Manager ou Developer não têm acesso a ele por padrão. Baixe o `.p8` (a Apple só deixa baixar uma vez) e anote o Key ID e o Issuer ID mostrado no topo da página.

### Secrets e variables do iOS

| Nome | Tipo | Valor |
| --- | --- | --- |
| `APP_STORE_CONNECT_API_KEY_ID` | secret | Key ID da chave |
| `APP_STORE_CONNECT_API_KEY_ISSUER_ID` | secret | Issuer ID |
| `APP_STORE_CONNECT_API_KEY_P8` | secret | Conteúdo do `.p8`, em PEM ou em base64 |
| `APPLE_TEAM_ID` | variable | Team ID |

O workflow também lê `EXPO_APPLICATION_ID` e as quatro `EXPO_PUBLIC_*` do Android. Sem qualquer um desses valores, ele falha no primeiro passo e lista o que falta. Para cadastrar sem deixar os valores no histórico do shell:

```sh
gh secret set APP_STORE_CONNECT_API_KEY_ID
gh secret set APP_STORE_CONNECT_API_KEY_ISSUER_ID
gh secret set APP_STORE_CONNECT_API_KEY_P8 < AuthKey_XXXXXXXXXX.p8
gh variable set APPLE_TEAM_ID --body XXXXXXXXXX
```

Guarde o `.p8` num cofre e apague a cópia local. Se a chave vazar, revogue-a no App Store Connect e cadastre outra.

### Reenviar uma versão

Cada run sobe um build novo da mesma versão, com o próximo build number. Para reenviar, use "Re-run jobs" no run da tag, ou Actions → iOS release → Run workflow, escolhendo a tag em "Use workflow from". O workflow recusa um branch nesse campo. Um build que já subiu não precisa de reenvio para aparecer no TestFlight; espere o processamento terminar.

## Evidência e limites

Registre unit, live e perf separadamente. Faça cinco aquecimentos e dez amostras em release para o tempo de abertura. Guarde todos os valores, o p95, o limite aplicado e a identidade da fixture. Compilar e exportar Hermes não comprovam instalação ou desempenho.

Notificações remotas permanecem indisponíveis sem configuração de transporte. Os testes locais cobrem fila e receipts sintéticos, recebimento de payload injetado, sessão e abertura do destino. Não descreva esses resultados como entrega por Expo Push Service, APNs ou FCM.

O escopo atual não inclui App Store pública, Google Play ou OTA remota. As credenciais de distribuição são a keystore do APK Android e a API key do App Store Connect usada pelo TestFlight. Os critérios restantes de acessibilidade, navegação, privacidade e desempenho continuam sendo executados nos AVDs e simuladores dedicados.
