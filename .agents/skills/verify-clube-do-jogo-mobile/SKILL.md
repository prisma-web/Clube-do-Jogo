---
name: verify-clube-do-jogo-mobile
description: Verifique o app mobile Expo do Clube do Jogo (apps/mobile) em um simulador iOS ou emulador Android de verdade. Use para compilar o app do commit atual em modo demo, instalar num aparelho do pool Simlock pelas device tools do T3, conferir com doctor, dirigir uma feature com fluxo Maestro, guardar evidência e limpar só o que o run criou. A web tem outra skill.
---

# Verify Clube do Jogo mobile

Rode tudo a partir da raiz do checkout. A fonte fica em `.agents/skills/verify-clube-do-jogo-mobile`, e o Claude Code a encontra pelo symlink `.claude/skills/verify-clube-do-jogo-mobile`. O helper é `scripts/verify-mobile` (bash, macOS com Xcode).

O app mora em dois diretórios. `apps/mobile/app` guarda as rotas do Expo Router, que são as telas. `apps/mobile/src` guarda componentes, hooks e estado. Antes de afirmar que um código mobile existe, não existe ou não está ligado a uma tela, busque nos dois:

```sh
grep -rn "<símbolo>" apps/mobile/src apps/mobile/app
```

Buscar só em `src/` já produziu falsos "não está conectado".

## Dados: demo, nunca produção

Não há fixture Supabase local alcançável hoje (conferido em 23/11/2026). Ninguém escuta na porta 55421 neste Mac nem no `rogstrix`, não há CLI `supabase` aqui, e o `rogstrix` nega acesso ao Docker para o usuário `matheus`. O caminho sem credencial é o **modo demonstração**: o build não recebe `EXPO_PUBLIC_SUPABASE_*`, a tela de login oferece `Entrar no modo demonstração`, e os dados vêm de `packages/domain/src/demo.ts`, em memória. O usuário demo (`Artur Lima`) é admin.

Consequências:

- Demo não prova RLS, persistência, auth real, callback `clubedojogo://auth/callback` nem push. Marque essas lanes como `not-run` com esse motivo.
- `login.yaml`, `logout.yaml`, `admin-*.yaml` e outros fluxos de `apps/mobile/.maestro/` assumem uma conta de fixture e dados de setembro de 2026. Eles não rodam em demo.
- O launcher não sobe Next. O transporte da API mobile (`apps/mobile/src/platform/api.ts`) exige cliente e sessão Supabase, então uma API em `3103` não serve ao demo. Descoberta e mídia ficam fora do demo.
- Nunca aponte `EXPO_PUBLIC_SUPABASE_URL` para o projeto de produção. Uma fixture futura usa só `http://127.0.0.1:55421`. O launcher e o doctor recusam um bundle que contenha host `*.supabase.co`.

## Aparelhos

Peça o aparelho ao pool Simlock pelas device tools do T3: `device_list`, depois `device_open` com o `hostId` do Simlock e o `id` do aparelho (simuladores iOS rodam no worker `macbook-2`, emuladores Android no `rogstrix`). O `device_open` devolve um comando `agent-device` já preso ao aparelho. Use esse comando para instalar, abrir, tocar e capturar. `device_screenshot` serve para olhar. No fim, `device_close` com `shutdown: true`. Os simuladores do pool já vêm reduzidos pelo SimSlim.

Se o pool falhar, cite o erro e tente uma vez. Em 23/11/2026 o `device_open` de iOS no Simlock falhou com `Remote daemon RPC protocol is incompatible`: o `simlock doctor` mostrou Simlock 0.5.0 pedindo agent-device RPC 2 e o agent-device 0.21.41 falando RPC 3. Não conserte a infra compartilhada no meio de uma verificação. Use o simulador local que o `device_list` lista no host `local` deste Mac, aplique `simslim on <UDID>` e confira `simslim verify <UDID>` antes de instalar, e registre a troca no resultado.

O helper roda no Mac que compila. O `doctor` inspeciona o simulador com `xcrun simctl`, então só enxerga simuladores deste Mac. Um emulador Android ou um iOS em outro Mac não passa pelo doctor. Esse caminho fica sem prova até alguém compilar o APK no `rogstrix` (`npx expo run:android --variant release --no-bundler`, ver [docs/mobile-release.md](../../../docs/mobile-release.md)).

Um aparelho tem um só escritor. Nunca rode dois fluxos no mesmo aparelho ao mesmo tempo, nem da mesma sessão. Um fluxo pode passar só porque o outro levou o app à tela que ele esperava. O `drive` pega um lock atômico (`mkdir`) em `state/verify-clube-do-jogo-mobile/device-locks/<UDID>.lock` e recusa se ele já existir.

## Launch

```sh
npm ci   # uma vez por checkout
./.agents/skills/verify-clube-do-jogo-mobile/scripts/verify-mobile launch --run-id <id>
```

Exige checkout limpo. Compila um Release iOS para simulador do `HEAD`, com o bundle JS embarcado e sem Metro: `expo prebuild`, `pod install` e `xcodebuild` com `CODE_SIGNING_ALLOWED=NO`. O ambiente do build é uma allowlist (`APP_VARIANT=development`, `EXPO_NO_DOTENV=1`, `EXPO_PUBLIC_AUTO_OPEN_PRODUCT_UPDATE=false`), e nada do shell entra no bundle. O primeiro build levou 5 minutos neste Mac (M1 Pro). Rode-o desvinculado e com log se o turno puder cair. O `.app` fica em cache em `state/verify-clube-do-jogo-mobile/builds/ios-<chave>/`, com a chave tirada da árvore de `apps/mobile`, `packages` e dos `package*.json`. Um commit que não mexe nessa árvore reaproveita o build, e um rebuild usa o DerivedData incremental. Pronto significa que o comando imprimiu `RUN_ID=` e `APP_PATH=`. O log do build fica em `evidence/.../<RUN_ID>/build.log`.

Depois instale com o comando do `device_open`:

```sh
<agent-device> install com.clubedojogo.mobile.dev <APP_PATH>
```

Para hot reload, use o dev client com Metro (`npm run start --workspace @clube-do-jogo/mobile`). Esse caminho exige um build Debug próprio, que o helper não cobre.

## Doctor

```sh
./.agents/skills/verify-clube-do-jogo-mobile/scripts/verify-mobile doctor --run-id <id> --udid <UDID>
```

Só lê, nada muda. Confere que a árvore do app no `HEAD` (`apps/mobile`, `packages`, `package*.json`) é a do build, que o simulador está ligado neste Mac, e que o `main.jsbundle` instalado no simulador tem o mesmo SHA-256 do build do run. Esse SHA prova que você vai dirigir o commit certo e não um `.app` velho de outra sessão. Também confere que o bundle instalado não tem host Supabase, e avisa se houver lock de dispositivo. Rode o doctor primeiro sempre que algo parecer errado.

## Drive

```sh
./.agents/skills/verify-clube-do-jogo-mobile/scripts/verify-mobile drive --run-id <id> --udid <UDID> \
  --agent-device <comando do device_open> .agents/skills/verify-clube-do-jogo-mobile/flows/<fluxo>.yaml
```

O helper roda `<agent-device> test <fluxo> --maestro` sob o lock, grava `run.log`, artefatos e `result.env` em `evidence/.../<RUN_ID>/drive-<fluxo>/` e sai com código diferente de zero se o fluxo falhar, se a árvore do app mudou desde o launch ou se o checkout sujar. O fluxo roda dentro da pasta de evidência, então os `takeScreenshot` caem lá. O agent-device grava a imagem sem extensão, e o helper acrescenta `.png`. O `test` abre uma sessão própria e recusa o aparelho (`Device is already in use by session`) se uma sessão interativa estiver aberta, por isso o helper roda `<agent-device> close` antes. Depois de um drive, abra o app de novo com `open` para explorar.

O agent-device roda um subconjunto do Maestro (`agent-device help maestro`), e sintaxe fora dele falha alto. `scrollUntilVisible` com `centerElement` não é aceito, e por isso `notes-draft.yaml` e `admin-cycle.yaml` do repo não rodam assim. O `~/.maestro/bin/maestro` direto é a alternativa, mas fica fora do helper, sem lock e sem recibo. Em 23/11/2026 ele ficou 300 s sem saída no simulador local já preso ao runner do agent-device, e foi encerrado.

Os fluxos desta skill ficam em `flows/` e partem de `launchApp: clearState: true`, então não dependem do que o run anterior deixou. Para exploração manual, use o mesmo comando `agent-device`: `open com.clubedojogo.mobile.dev --relaunch`, `snapshot -i` e `press @eN --settle`.

Regras de autoria de fluxo:

- **Nunca presuma a tela inicial.** Com Supabase, o app restaura a sessão e pula o login. Force o estado: `logout.yaml` sai e espera `Boas-vindas de volta`, e depois vem `login.yaml`. Em demo, `clearState` basta, porque o modo demonstração não é restaurado.
- **Convirja ao mesmo estado final em toda execução.** Normalize no começo, na tela onde o controle existe. Desfaça a mutação no último passo, ou aja sobre algo que o próprio fluxo criou. Um fluxo que só passa na primeira execução dá `PASS` por sorte.
- **Votação rápida.** Logo depois do login, o app abre a `Votação rápida` (um `Modal` em `apps/mobile/src/features/voting/VotingDeckGate.tsx`) por cima das abas, com os jogos recentes sem voto. Ela também reabre quando o app volta ao primeiro plano. Todo fluxo que passa do login precisa lidar com ela.
- **Abas no iOS** expõem `Ranking, tab, 2 of 5`. Use `text: 'Ranking(, tab, 2 of 5)?'` com `index: 0`.
- **Novidades:** o build fixa `EXPO_PUBLIC_AUTO_OPEN_PRODUCT_UPDATE=false`. Só o valor exato `'false'` desliga a abertura automática (`apps/mobile/src/platform/config.ts`). A reabertura manual em Configurações continua funcionando.

## Evidence

```sh
./.agents/skills/verify-clube-do-jogo-mobile/scripts/verify-mobile evidence --run-id <id>
```

Escreve `SHA256SUMS` de todos os arquivos do run, lista o status de cada drive e falha se algum não passou. A prova de uma feature tem a ação e o estado resultante (screenshots antes e depois dentro do fluxo), o `result.env` com SHA do commit, SHA do bundle, UDID e código de saída, e o resultado do doctor. Capture também um `device_screenshot` ou `<agent-device> screenshot <caminho>` do estado final quando o fluxo não tiver `takeScreenshot`. Separe `unit`, `live` e `perf` no relato, e marque como `not-run` o que não rodou, com o motivo.

Evidência vai para `evidence/verify-clube-do-jogo-mobile/<RUN_ID>/`. Estado e cache vão para `state/verify-clube-do-jogo-mobile/`. As duas bases recebem um `.gitignore` com `*` no primeiro launch, então nada disso entra no git.

## Cleanup

```sh
./.agents/skills/verify-clube-do-jogo-mobile/scripts/verify-mobile cleanup --run-id <id>
```

Apaga o estado do run, mantém o build em cache e a evidência, e falha se a evidência sumir. O helper não deixa processo vivo: o build e cada drive terminam dentro do próprio comando, então não há o que encerrar. Depois devolva o aparelho com `device_close` e `shutdown: true`. Não mate Metro, Next ou simulador de outra sessão por nome. O cache de build (DerivedData incluído) passa de 5 GB em `state/verify-clube-do-jogo-mobile/builds/`; apague-o quando terminar de verificar o branch.

## Defeito aberto: a tela trava depois da Votação rápida

Em 23/11/2026, com o app de `c3117bb` (master) em Release num iPhone 18 Pro com iOS 27.2 e SimSlim máximo: depois que a `Votação rápida` fecha, seja pelo `Fechar votação rápida` ou depois de votar no último jogo, a tela principal para de receber toques. Abas, botões e até a rolagem nativa não respondem, e ir ao fundo e voltar não resolve. Como a rolagem nativa também trava, o bloqueio está na camada do UIKit e não no JS. O `Modal` dispensado parece continuar segurando os toques. Os toques dentro do deck funcionam. Isso foi observado com toques do agent-device (XCTest) e não foi confirmado com um toque humano. Até alguém corrigir, toda receita que precisa das abas depois do login falha nesse ponto. `flows/demo-ranking-vote.yaml` fica como fluxo de regressão desse defeito: hoje ele falha ao procurar `Cocoon` no Ranking.

## Gotcha: Pressable acessível engole o filho

No iOS, um `Pressable` com `accessibilityRole` e `accessibilityLabel` ao mesmo tempo colapsa a subárvore de acessibilidade. Um botão aninhado continua visível e tocável por coordenada, mas some para o VoiceOver e para automação por árvore. `testID` não resolve, porque não entra na árvore do leitor de tela. A correção é estrutural: o Pressable e a ação secundária viram irmãos, como em `apps/mobile/src/components/GameListRow.tsx`. O mesmo colapso explica por que o texto `Novidades da V1.1` não é alvo em Configurações. O alvo é o rótulo do Pressable, `Ver novamente as novidades da V1.1`.

## Mapa de features

[features/README.md](features/README.md) lista as features e como provar cada uma. Atualize o mapa com `/maintain-verification-skill` quando telas, rótulos ou aparelhos mudarem.
