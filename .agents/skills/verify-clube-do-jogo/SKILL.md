---
name: verify-clube-do-jogo
description: Execute verificações reproduzíveis do Clube do Jogo em Next demo e prepare condução controlada de Expo Android/iOS. Use quando precisar iniciar um ambiente isolado, diagnosticar sua posse, dirigir uma feature com Playwright ou Maestro, coletar evidências auditáveis e limpar somente os processos próprios.
---

# Verify Clube do Jogo

Use esta skill a partir da raiz do checkout. Ela usa a pasta fonte `.agents/skills/verify-clube-do-jogo`; Claude Code encontra a mesma fonte pelo symlink `.claude/skills/verify-clube-do-jogo`. Os helpers de processos usam /proc e o comando ss e rodam em Linux/WSL. Uma porta ocupada sem PID inspecionável faz a verificação falhar. Os comandos iOS são executados remotamente no Mac indicado. O padrão web usa somente uma das portas dedicadas `3102` e `3103`, modo demo e nenhuma credencial Supabase. Nunca aponte o modo local autenticado para produção.

## Busca no repositório: dois diretórios mobile, não um

O mobile do Expo divide propositalmente componentes/estado de telas/rotas em dois diretórios de topo dentro de `apps/mobile`: `src/` guarda hooks, componentes e estado; `app/` guarda as rotas do Expo Router — as telas de fato. Uma feature pode existir e nunca ser usada, ou existir e estar plenamente conectada; a única forma de saber é procurar nos dois lugares. Buscar só em `src/` já produziu, nesta mesma leva, três falsos negativos de "não existe"/"não está conectado" (duas vezes sobre chaves de estado persistido, uma vez sobre `useClubGameAdminAction`, que na verdade está ligado em `apps/mobile/app/(app)/(tabs)/ranking.tsx` e `apps/mobile/app/(app)/jogos/[id].tsx`). Qualquer afirmação sobre existência ou uso de código mobile — em um mapa de feature, em um recibo de verificação, em um relatório — precisa cobrir os dois diretórios antes de ser escrita. Comando pronto:

```sh
grep -rn "<símbolo>" apps/mobile/src apps/mobile/app
```

Se o símbolo não aparecer em `apps/mobile/app`, ele pode ainda não ter uma tela que o use — mas essa é uma conclusão que só se pode tirar depois de rodar o grep nos dois diretórios, nunca só em `src/`.

## Run contract

Cada execução recebe um `RUN_ID` e grava o manifesto, log, snapshots, screenshots, resultado e hashes em `evidence/verify-clube-do-jogo/<RUN_ID>/`. O estado operacional fica em `state/verify-clube-do-jogo/<RUN_ID>/`. Essas pastas são artefatos ignorados; os caminhos são derivados do `RUN_ID`, os diretórios canônicos não podem ser symlinks e a evidência só aceita artefatos que preservem o worktree, porta, modo e SHA do manifesto. Launch, drive e evidence registram um snapshot limpo do checkout antes e depois da condução. A limpeza encerra apenas o grupo de processos registrado no manifesto e preserva a evidência.

Use uma porta 3102 ou 3103 que não esteja em uso por outro agente:

```sh
./.agents/skills/verify-clube-do-jogo/scripts/verify-clube-do-jogo launch --port 3102
```

Passe `RUN_ID=<id>` ou `--run-id <id>` aos comandos seguintes. Sem isso, o helper seleciona o manifesto mais recente. Não use `pkill`, `killall`, limpeza ampla de diretórios ou comandos que alterem simuladores compartilhados.

### Execução serial, com lock e não por confiança

O simulador ou emulador é um recurso de escritor único, e isso vale tanto entre sessões quanto entre fluxos da mesma execução: nunca dirija dois fluxos Maestro ao mesmo dispositivo ao mesmo tempo, mesmo que os dois pareçam independentes. O perigo real não é a falha visível. É o falso positivo: um fluxo pode registrar `PASS` só porque o outro fluxo navegou o app até a tela que o primeiro esperava encontrar, e o recibo não prova nada do que afirma provar. Um `PASS` inválido é pior do que nenhum recibo, porque custa confiança sem custar suspeita.

Não confie apenas na disciplina de não sobrepor comandos; use um lock estrutural por dispositivo antes de qualquer `maestro test`:

```sh
lock_dir="state/verify-clube-do-jogo/device-locks/${UDID_OU_SERIAL}.lock"
mkdir "$lock_dir" 2>/dev/null || { echo "Dispositivo em uso por outro fluxo, aborte."; exit 1; }
trap 'rmdir "$lock_dir"' EXIT
maestro --device "$UDID_OU_SERIAL" test apps/mobile/.maestro/<fluxo>.yaml
```

`mkdir` é atômico no mesmo host, então duas execuções concorrentes nunca adquirem o lock ao mesmo tempo. Execute isso no host que efetivamente segura o dispositivo (o Mac para iOS via `ssh macbook-2`, o Linux/WSL para o emulador Android), e libere o lock mesmo em falha (`trap`).

## Launch

`launch` inicia `npm run dev -- --hostname 127.0.0.1 --port <port>` com `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` vazios e `NEXT_PUBLIC_AUTO_OPEN_PRODUCT_UPDATE=false`. O processo recebe uma allowlist de ambiente demo sem segredos herdados do shell. Ele é separado em seu próprio grupo; o helper exige checkout limpo antes e depois de iniciar, espera cwd, PGID, boot ID e instante de criação válidos antes de publicar o manifesto, e a rota `/jogo-do-mes` precisa responder antes do comando terminar.

```sh
./.agents/skills/verify-clube-do-jogo/scripts/verify-clube-do-jogo launch --port 3102
```

Se a inicialização falhar, execute `cleanup --run-id <id>` antes de tentar novamente e preserve o log da tentativa.

## Doctor

`doctor` verifica a identidade do processo pelo boot do host e instante de criação, além de confirmar que o PID ainda existe, que seu cwd pertence a este checkout, que o PGID e a árvore podem ser inspecionados, que a porta responde, que o HTML identifica Clube do Jogo e que a porta não foi tomada por processo externo. O doctor conhece o modo demo pelo manifesto de launch e não simula uma sessão autenticada.

```sh
./.agents/skills/verify-clube-do-jogo/scripts/verify-clube-do-jogo doctor --run-id <id>
```

O `npx expo-doctor` é um diagnóstico, não uma aprovação automática. O gate estrito fica em `scripts/mobile-dependency-gate.mjs` e deve receber a saída e o código real do mesmo processo. Preserve os dois resultados em um diretório de artefatos da execução:

```sh
doctor_dir="evidence/verify-clube-do-jogo/${RUN_ID:?Defina RUN_ID}"
mkdir -p "$doctor_dir"
doctor_log="$doctor_dir/expo-doctor.log"
doctor_result="$doctor_dir/mobile-doctor-classification.json"
if (cd apps/mobile && npx expo-doctor) >"$doctor_log" 2>&1; then doctor_exit=0; else doctor_exit=$?; fi
npm run --silent mobile:dependencies:gate -- doctor --log "$doctor_log" --exit-code "$doctor_exit" >"$doctor_result" 2>&1
```

Neste commit, o gate aceita uma única forma de Doctor: texto exato do split 20/21, com `react` e `react-dom` 19.2.3 no mobile, 19.2.4 na raiz e código 1. Ele rejeita qualquer versão, caminho, código ou falha adicional. `21/21` com código 0 não é uma aceitação implementada pelo gate atual; deve ser tratado como resultado não classificado até que o script e seus testes passem a suportá-lo. A confirmação de uma única origem React nos bundles também pertence ao gate de source maps. O workflow de CI preserva o log e a classificação como artefatos. Consulte [docs/mobile-migration.md](../../../docs/mobile-migration.md) para o motivo da divergência.

## Drive

O helper Playwright dirige ações de usuário por papéis e texto visível, sem mutação via `page.evaluate`. A prova incluída navega para Ranking, escolhe `Não` para Cocoon, seleciona `Não consigo rodar`, confirma, abre as escolhas negativas do cartão e verifica o motivo visível `Não consigo rodar`.

```sh
./.agents/skills/verify-clube-do-jogo/scripts/verify-clube-do-jogo drive ranking --run-id <id>
```

O fluxo gera `before-action.png`, `after-vote.png`, snapshots ARIA antes/depois e `drive-result.json`. Após cada captura, o resultado registra assinatura PNG, dimensões, bytes e SHA-256 da imagem, além de bytes e SHA-256 do snapshot ARIA. Console errors, page errors e requests falhas entram no resultado e qualquer item reprova o drive. O helper também exige checkout limpo antes e depois da condução. Se uma tentativa falhar, limpe o run antes de corrigir ou repetir.

## Evidence

`evidence` exige o manifesto, log, snapshots, screenshots e resultado com `status: passed`, checkout limpo antes e depois e as três coleções de erros de runtime vazias. Ele recalcula a assinatura PNG, dimensões, bytes e SHA-256 das imagens, compara as capturas com os metadados registrados pelo drive, recalcula os hashes dos snapshots ARIA e calcula SHA-256 de cada arquivo retido. Antes de escrever o relatório, confirma que o SHA atual é o SHA do launch, que o manifesto na pasta de evidência é igual ao manifesto de estado e que doctor/drive/cleanup têm o mesmo run, worktree, porta, URL e modo. Logs e snapshots de texto são redigidos antes de serem retidos.

```sh
./.agents/skills/verify-clube-do-jogo/scripts/verify-clube-do-jogo evidence --run-id <id>
```

Uma evidência válida inclui o comando executado, a feature, a URL, o efeito observável, os arquivos e seus hashes. Relatórios devem separar `unit`, `live` e `perf`; qualquer cenário que não tenha sido executado deve aparecer como `not-run` com motivo.

## Cleanup

`cleanup` compara a identidade do processo salvo, seu cwd e seu PGID, inspeciona todos os membros do grupo e a posse da porta antes de sinalizar. Ele nunca sinaliza um grupo com processo externo e só retorna sucesso depois de confirmar que os descendentes e a porta desapareceram; o relatório registra os PIDs restantes quando a limpeza falha. O manifesto, o log e todos os arquivos em `evidence` continuam disponíveis para revisão.

```sh
./.agents/skills/verify-clube-do-jogo/scripts/verify-clube-do-jogo cleanup --run-id <id>
./.agents/skills/verify-clube-do-jogo/scripts/verify-clube-do-jogo evidence --run-id <id>
```

Não faça logout global, não encerre Metro, Next ou simuladores de outra sessão e não remova evidências para obter uma execução limpa.

## Helpers

Os helpers são executáveis e não dependem de `jq`:

```sh
./.agents/skills/verify-clube-do-jogo/scripts/verify-clube-do-jogo launch --port 3102
./.agents/skills/verify-clube-do-jogo/scripts/verify-clube-do-jogo doctor --run-id <id>
./.agents/skills/verify-clube-do-jogo/scripts/verify-clube-do-jogo drive ranking --run-id <id>
./.agents/skills/verify-clube-do-jogo/scripts/verify-clube-do-jogo evidence --run-id <id>
./.agents/skills/verify-clube-do-jogo/scripts/verify-clube-do-jogo cleanup --run-id <id>
```

O contrato de execução tem regressões automatizadas em `node --test .agents/skills/verify-clube-do-jogo/tests/run-contract.test.mjs`. Elas verificam seleção explícita de run, caminhos/SHA/identidade de artefatos, checkout limpo com arquivos rastreados e não rastreados, runtime errors, integridade PNG/ARIA, diretórios canônicos sem symlink, allowlist demo e redaction, portas dedicadas, recusa de identidade diferente e encerramento de descendente órfão.

`check` executa a validação estrutural da skill e `status` imprime o manifesto sem tocar no app:

```sh
./.agents/skills/verify-clube-do-jogo/scripts/verify-clube-do-jogo check
./.agents/skills/verify-clube-do-jogo/scripts/verify-clube-do-jogo status --run-id <id>
```

## Mobile launch and drive

Há duas lanes mobile. A lane de dev client usa Metro para carregar o bundle, e ações que dependem da UI ativa podem exigir foreground. A lane de Release usa o bundle embarcado e deve ser conduzida sem Metro. A receita de build, instalação, assinatura local e túnel está em [docs/mobile-release.md](../../../docs/mobile-release.md).

### Pré-condições obrigatórias antes de qualquer condução live

Estas duas verificações são gate, não sugestão. Sem elas o app sobe, renderiza o shell e fica em spinner indefinido, e uma série inteira de Maestro retorna timeouts que se parecem com falha de performance mas são apenas dependência inalcançável. Isso já custou uma série de 15 lançamentos descartada como inválida. Verifique sempre do lado do simulador (o Mac), nunca do Linux, porque é a ponta que realmente importa: um serviço escutando no Linux não prova que o simulador consegue alcançá-lo.

**1. Fixture Supabase (porta 55421).** A fixture roda no Linux e alcança o Mac por túnel SSH reverso, que morre junto com a sessão que o abriu — um túnel de uma sessão anterior não sobrevive para a sua.

```sh
ssh macbook-2 'lsof -nP -iTCP:55421 -sTCP:LISTEN'
ssh macbook-2 'curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:55421/auth/v1/health'  # espera 200
# se não houver listener no Mac, abra o túnel e mantenha-o vivo durante toda a condução:
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -R 55421:127.0.0.1:55421 macbook-2
```

**2. API de descoberta e mídia Next (porta 3101 no Mac).** `readGameMedia` bate nessa API; se ela não responder, o erro de mídia bloqueia o resto da tela de detalhe do jogo, mesmo quando o resto do app funciona. Suba o Next local e espere a rota `/jogo-do-mes` responder antes de considerar o servidor pronto — não assuma prontidão pelo PID existir; veja o padrão de polling com deadline em `research/run-perf-auth-local.py` no diretório do programa (`os.environ` filtrado para uma allowlist, `subprocess.Popen` em grupo próprio, loop de `urllib.request.urlopen` com timeout curto e prazo total, e cleanup em `finally` que só encerra os processos que a própria execução criou). Depois de subir, confirme do Mac, não do Linux:

```sh
ssh macbook-2 'curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3101/jogo-do-mes'  # espera 200
```

Uma falha causada por qualquer uma dessas duas pré-condições não é um defeito do app; é ambiente não preparado. Não classifique o app como quebrado ou lento sem antes confirmar as duas.

```sh
EXPO_PUBLIC_AUTO_OPEN_PRODUCT_UPDATE=false npm run start --workspace @clube-do-jogo/mobile
```

### Escotilha de abertura automática do diálogo de novidades

O ambiente de condução mobile deve passar `EXPO_PUBLIC_AUTO_OPEN_PRODUCT_UPDATE=false`, análogo ao que `launch` já faz para a web (`NEXT_PUBLIC_AUTO_OPEN_PRODUCT_UPDATE=false`, ver `scripts/verify-clube-do-jogo.mjs:126`). A semântica é `!== 'false'` nos dois lados: só o valor exato `'false'` desliga a abertura automática; qualquer outro valor ou a ausência da variável mantém o diálogo abrindo sozinho no primeiro login de uma versão nova. Essa escotilha mobile é recente (PR #33, `pstack/expo-35-product-update-flag`); antes dela o mobile não tinha como suprimir a abertura automática e a verificação mobile do diálogo de novidades ficava bloqueada por essa assimetria entre plataformas — a próxima feature com abertura automática deve nascer com escotilha nas duas plataformas, não só na web.

A escotilha suprime **só** a abertura automática. A reabertura manual por `Configurações` → `Preferências` → `Novidades da V1.1` continua funcionando com a variável em `'false'`. Isso é o que permite um fluxo suprimir o diálogo automático no início de uma sessão (para não competir com outro diálogo do mesmo login, como a folha de recompensas) e ainda assim exercitar a reabertura manual como prova de funcionalidade separada; um fluxo que assumir que a variável desliga o recurso inteiro nunca vai escrever esse segundo passo.

No dev client, Metro precisa estar acessível para carregar o bundle. Foreground só é requisito de uma ação que dependa da UI ativa ou do cenário específico de restauração de sessão. O callback `clubedojogo://auth/callback` também deve ser testado com o app Release instalado e frio, quando o sistema abre o app pelo deep link sem Metro. Use um dispositivo dedicado e não conduza o mesmo simulador ou emulador em duas sessões.

### Autoria de fluxo: nunca presuma estado

Um fluxo não pode assumir que o app abre na tela de login. O app restaura sessão automaticamente, e sete fluxos falharam no primeiro passo hoje por assertar a tela de login direto, quando o dispositivo já tinha uma sessão restaurada de uma condução anterior. Todo fluxo que precisa de uma sessão conhecida deve primeiro forçar o estado, não presumi-lo: saia da conta, espere o texto `Boas-vindas de volta` e então refaça o login. O padrão correto está em `apps/mobile/.maestro/logout.yaml` (sai da conta e espera `Boas-vindas de volta`) seguido de `login.yaml` (assume a tela de login e autentica); um fluxo Android já provado encadeia os dois. Não escreva um fluxo novo que comece direto em `assertVisible: Boas-vindas de volta` sem ter forçado esse estado antes.

Presumir sessão é um caso do defeito maior: **todo fluxo precisa convergir para o mesmo estado final, não importa quantas vezes rodou nem o que a execução anterior deixou na fixture.** Um fluxo que só passa na primeira execução do dia não é ferramenta, é foto. A série de hoje encontrou três fluxos que compartilhavam essa mesma premissa quebrada, o que significa que a premissa em si é o defeito, não os três fluxos isolados:

- `progresso-confirmacao` terminava revertendo o status para "Não iniciado". Depois de três execuções, o passo de normalização não encontrava mais o estado "Comecei" que esperava — e descobriu-se que esse normalize **nunca funcionou**: ele tocava no botão de status antes de navegar para a aba onde esse botão existe. Só "passava" porque a fixture nascia no estado certo por acaso. O `PASS` dele na série anterior era sorte, não prova.
- `notas-timeline` tenta "Escrever anotação", que deixa de ser oferecido quando o dia já tem anotação. Uma execução anterior do próprio fluxo já tinha postado a nota de hoje, e a execução seguinte não tinha como repetir a ação.
- A metade de remoção do `biblioteca-acoes` apaga um jogo da biblioteca e não o repõe; a fixture fica diferente para a execução seguinte, que perde o jogo que esperava encontrar.

Três formas de resolver isso, porque o autor precisa de opção, não só de proibição:

1. **Normalizar no começo, no lugar onde a ação é possível.** Navegue até a tela ou aba onde o controle existe antes de tocar nele; o defeito do `progresso-confirmacao` foi normalizar cedo demais, fora do lugar certo.
2. **Restaurar o estado no fim.** Se o fluxo muda algo (uma anotação, um status, um item de biblioteca), desfaça essa mudança como último passo, para a próxima execução herdar o mesmo ponto de partida.
3. **Agir sobre algo que o próprio fluxo criou.** Em vez de depender de um item pré-existente na fixture, crie o alvo dentro do próprio fluxo (por exemplo, adicione o jogo antes de removê-lo) para que o resultado não dependa de execuções anteriores.

Não confie em a fixture nascer num estado específico; trate esse nascimento como um acidente de quando a fixture foi semeada pela última vez, não como um contrato. Um fluxo não idempotente produz `PASS` que não prova nada, e essa é a terceira forma de falsa confiança que esta leva encontrou — as outras duas já estão registradas nesta skill: o falso positivo por execução concorrente sem lock (seção "Execução serial, com lock e não por confiança", acima) e o falso negativo por buscar existência de código mobile só em `apps/mobile/src/` (seção "Busca no repositório: dois diretórios mobile, não um", no topo deste arquivo). O padrão comum às três é o recibo afirmar mais do que foi de fato provado; ao revisar um fluxo novo ou um recibo antigo, pergunte explicitamente qual dessas três formas ele poderia estar escondendo.

Busca ao vivo no IGDB para títulos não cacheados não é verificável neste ambiente sem `IGDB_CLIENT_ID` e `IGDB_CLIENT_SECRET` reais — `.env.example` só tem placeholder vazio para os dois — e nessa condição o esperado é a interface mostrar o erro de descoberta; não leia esse erro como defeito do app.

### Bloqueio conhecido: emulador Android

O emulador Android está bloqueado neste ambiente. Três tentativas, threads do QEMU pendendo por 15 a 20s antes do processo sair com código 1; sete causas descartadas por medição direta (memória, disco, carga, `/dev/kvm`, grupo kvm, virtualização aninhada, processos zumbis e locks do AVD). Diagnóstico completo em `/home/matheus/.codex/orchestrate/clube-do-jogo-expo/research/android-emulator-blocked.json`. **Não reescave essa investigação.** A causa é ambiental e está fora do que uma sessão consegue corrigir; a condução live foi propositalmente redirecionada para o simulador iOS. Só retome Android se um sinal novo e concreto aparecer (por exemplo, o emulador subir por outra via), não por repetir as mesmas sete hipóteses já descartadas.

Android documentado, com a atribuição separada para que o shell não expanda uma variável vazia:

```sh
export EXPO_ANDROID_SERIAL=emulator-5580
maestro --device "$EXPO_ANDROID_SERIAL" test apps/mobile/.maestro/club.yaml
```

Para a lane dev client, antes de validar uma sessão live, use um emulador dedicado, confirme a versão do checkout e confira os túneis do Metro, do Supabase local e da API Next:

```sh
export EXPO_ANDROID_SERIAL=emulator-5580
adb -s "$EXPO_ANDROID_SERIAL" reverse tcp:8081 tcp:8081
adb -s "$EXPO_ANDROID_SERIAL" reverse tcp:55421 tcp:55421
adb -s "$EXPO_ANDROID_SERIAL" reverse tcp:3101 tcp:3101
adb -s "$EXPO_ANDROID_SERIAL" reverse --list
adb -s "$EXPO_ANDROID_SERIAL" forward --list
git rev-parse HEAD
artifact_dir="evidence/verify-clube-do-jogo/${RUN_ID:?Defina RUN_ID}"
mkdir -p "$artifact_dir"
(cd apps/mobile && EXPO_NO_DOTENV=1 npx expo config --type public --json) > "$artifact_dir/expo-config-public.json"
(cd apps/mobile && EXPO_NO_DOTENV=1 npx expo-updates fingerprint:generate --platform android) > "$artifact_dir/fingerprint-android.json"
```

O resultado da lane dev client precisa mostrar explicitamente os reverses `8081`, `55421` e `3101`, o SHA do checkout, o manifesto público e o fingerprint antes de abrir o fluxo. Para a lane Release, use `npx expo run:android --variant release --no-bundler` conforme [docs/mobile-release.md](../../../docs/mobile-release.md), não encaminhe `8081` e confirme somente os reverses de serviços locais que o bundle usa, normalmente `55421` e `3101`. Um export em `apps/mobile/dist` não prova que um binário foi instalado. Depois da instalação, use o pacote realmente instalado:

```sh
APP_ID="${EXPO_APPLICATION_ID:-com.clubedojogo.mobile.dev}"
adb -s "$EXPO_ANDROID_SERIAL" shell pm path "$APP_ID" | tee "$artifact_dir/installed-apk-paths.txt"
```

Extraia cada APK retornado para `$artifact_dir` e calcule seu SHA-256; registre também o fingerprint do build e a versão instalada. No iOS, defina `IOS_BUNDLE_ID="${EXPO_APPLICATION_ID:-com.clubedojogo.mobile.dev}"`, use `xcrun simctl get_app_container "$IOS_UDID" "$IOS_BUNDLE_ID" app`, arquive o `.app` instalado e calcule seu SHA-256. Em macOS, use `shasum -a 256` no lugar de `sha256sum`.

Se o botão flutuante de ferramentas Expo interceptar um toque, desative a preferência somente no app usado pelo teste e restaure-a no cleanup. Não mude uma preferência global do emulador e não mate o Metro de outra sessão. O status da execução vem do recibo da própria condução.

iOS documentado no host `macbook-2`, UDID `DED8DC40-0E4D-4B56-9A9B-7B55F189B049`. A receita completa de build local está em [docs/mobile-release.md](../../../docs/mobile-release.md). Para conduzir Maestro no checkout do Mac, edite o caminho explícito dentro do heredoc remoto:

```sh
ssh macbook-2 <<'REMOTE'
set -eu
CLUBE_CHECKOUT=/Users/matheustimbopereira/Developer/clube-do-jogo-expo
export PATH="/opt/homebrew/bin:$HOME/.nvm/versions/node/v24.19.0/bin:$HOME/.maestro/bin:$PATH"
cd "$CLUBE_CHECKOUT"
node --version
maestro --help | grep -E -- '--device'
maestro --device 'DED8DC40-0E4D-4B56-9A9B-7B55F189B049' test apps/mobile/.maestro/club.yaml
REMOTE
```

Antes de qualquer execução iOS, o operador deve consultar `simslim --help` e `simslim profiles`, aplicar `simslim on <UDID>` com a redução máxima, conferir `status` e `verify`, e reaplicar a redução máxima ao final. O recibo deste dispositivo mostrou 170/170 daemons gerenciados desativados; mantenha o perfil máximo e não adicione exceções sem uma necessidade comprovada do teste. Só use `simslim doctor --requires` depois de consultar a ajuda dessa versão e informar um recurso válido que o teste realmente exige; uma condução básica de rede não exige daemon extra e deve registrar `not-required` em vez de chamar `doctor --requires` sem argumento. As abas Maestro aceitam a acessibilidade dinâmica, por exemplo `Ranking(, tab, 2 of 5)?` com `index: 0`; não substitua essa forma por um texto fixo.

Confira a lista real antes de assumir cobertura: `ls apps/mobile/.maestro/*.yaml`. Nesta leva são 19 arquivos, entre eles `login.yaml`, `club.yaml`, `history.yaml`, `auth-link-recovery.yaml`, `auth-deeplink-back.yaml`, `logout.yaml`, `login-rewards.yaml`, `admin-cycle.yaml`, `admin-undo.yaml`, `admin-picker-cancel.yaml`, `admin-roles.yaml`, `notes-draft.yaml`, `notes-timeline.yaml`, `profile-media.yaml`, `ratings.yaml`, `themes.yaml`, `theme-scenes.yaml`, `theme-audio.yaml` e `theme-audio-off.yaml`. Esta lista é um retrato de uma leva; não a trate como fixa e não a cite sem conferir `ls` de novo. `auth-link-recovery.yaml` cobre o retorno de um link inválido; ele não fabrica um código PKCE válido nem implementa automação nativa fora do Maestro. Para um callback válido, use a fixture e o fluxo de e-mail autorizados pelo ambiente local, conduza o app Release frio e registre somente o esquema, host, caminho e forma redigida dos parâmetros, por exemplo `clubedojogo://auth/callback?code=<redacted>`; não inclua o valor de `code`, tokens, cookies, credenciais ou a URL completa em recibos e capturas publicados. Material necessário à troca deve permanecer em arquivos privados do teste, com acesso restrito. Registre o resultado da sessão, a forma do callback e o SHA do binário. Depois de incluir módulo nativo, como `react-native-webview`, rode `npx expo prebuild --no-install` e gere um development client novo no checkout dedicado antes do Maestro; não reutilize um binário antigo. A sessão real usa apenas o Supabase local `http://127.0.0.1:55421`, projeto `clube-expo-local`, com contas de fixture e RLS; rejeite qualquer host diferente e nunca use dados de produção. O demo continua sendo a opção para navegação sem credenciais.

A prova nativa deve seguir [docs/mobile-release.md](../../../docs/mobile-release.md), incluindo bundle embarcado, `--no-bundler`, assinatura local, SimSlim máximo no Mac e metadados de SHA, dispositivo e manifesto. O helper automatiza o contrato web. Para build, condução e autenticação nativos, o agente executa os comandos documentados no dispositivo atribuído à tarefa.

## Gotcha: accessible parent Pressable swallows nested actions

A verificação viva encontrou um defeito de acessibilidade que typecheck, teste e lint não pegam: no iOS, um `Pressable` pai que carrega papel de acessibilidade (`accessibilityRole`) **e** rótulo de acessibilidade (`accessibilityLabel`) colapsa toda a subárvore de acessibilidade abaixo dele. Um botão filho aninhado dentro desse `Pressable` continua visível e clicável por coordenada de tela, então um toque cego ou um teste que clica por posição passa. Mas o botão fica inalcançável para VoiceOver e para qualquer automação que navegue pela árvore de acessibilidade em vez de por coordenada, porque o filho nunca aparece como um nó próprio. Foi corrigido em `apps/mobile/src/components/GameListRow.tsx` e `apps/mobile/src/features/notes/PrivateNotes.tsx` tornando o Pressable pai e o botão de ação elementos irmãos, não um dentro do outro.

Procure este padrão sempre que revisar ou escrever um componente com uma ação secundária dentro de uma linha ou cartão tocável inteiro: um `Pressable`/`TouchableOpacity` com `accessibilityRole` e `accessibilityLabel` ao mesmo tempo, contendo outro elemento tocável como filho. `testID` **não é a solução** para esse defeito: adicionar `testID` ao botão filho faz uma automação por seletor de teste passar, mas deixa o VoiceOver de fora, porque o `testID` não participa da árvore de acessibilidade que o leitor de tela usa. A correção é estrutural (irmãos, não aninhamento), não um atalho de seletor.

## Unit, live, and performance

Unit checks são determinísticos e podem rodar isoladamente:

```sh
npm run test:domain
npm run test:data
npm run test:api
```

O smoke web dedicado desta skill é a prova live demo em 3102. O `npm run test:web` padrão usa a configuração compartilhada da raiz e sua porta própria; execute-o somente em checkout e processos isolados. Testes live autenticados devem usar o Supabase local dedicado e fixtures, com host validado antes de criar o client.

Build e export produzem artefatos de pré-requisito em uma sessão própria; sozinhos não aprovam performance ou release:

```sh
npm run build
npm run export --workspace @clube-do-jogo/mobile
```

O status de performance e release deve vir do recibo da execução correspondente. Marque `not-run` somente quando a lane não foi executada e registre o motivo. Não use um build ou export isolado, nem o resultado demo, para declarar RLS, auth real, performance, release ou compatibilidade nativa.

`npm run perf:auth` é uma lane web separada. Execute-a somente contra dois servidores de produção locais isolados, uma fixture exclusiva e URLs loopback dedicadas, informando `PERF_AUTH_BASELINE_URL`, `PERF_AUTH_CANDIDATE_URL`, `PERF_AUTH_EMAIL`, `PERF_AUTH_PASSWORD` e `PERF_AUTH_EXPECTED_IDENTITY` sem gravar credenciais no recibo. O instrumento usa 5 aquecimentos, 10 pares, contexto novo por login e identidade literal no menu da conta. Ele mede o clique de login até o nome autenticado e não prova callback nativo, interatividade completa da página, sucesso de toda request ou desempenho de Release.

Consulte `features/README.md` para os mapas de feature e invoque `/maintain-verification-skill` quando a superfície, os seletores ou os dispositivos mudarem.
