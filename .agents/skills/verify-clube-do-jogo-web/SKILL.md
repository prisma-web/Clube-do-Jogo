---
name: verify-clube-do-jogo-web
description: Verificação reproduzível da web do Clube do Jogo (Next em modo demo, conduzido com Playwright). Use para subir uma instância isolada em 3102/3103, diagnosticar sua posse, dirigir uma feature como usuário, coletar evidência auditável e limpar só os processos próprios. Para Expo/Maestro use verify-clube-do-jogo-mobile.
---

# Verify Clube do Jogo (web)

Rode tudo a partir da raiz do checkout. A fonte é `.agents/skills/verify-clube-do-jogo-web`; Claude Code a encontra pelo symlink `.claude/skills/verify-clube-do-jogo-web`. Os helpers rodam em Linux (`/proc`, `ss`) e macOS (`ps`, `lsof`, `netstat`). A web roda em modo demo, sem credencial Supabase, e só nas portas `3102` e `3103`. Nunca aponte o modo autenticado para produção.

```sh
H=./.agents/skills/verify-clube-do-jogo-web/scripts/verify-clube-do-jogo-web
```

## Pré-requisitos

- Dependências instaladas: worktree novo não tem `node_modules`, rode `npm ci`.
- Chromium do Playwright: `npx playwright install chromium` se o drive reclamar do browser.
- Checkout limpo e commitado. Launch, drive e evidence recusam checkout sujo (rastreado ou não rastreado), porque a evidência é presa ao SHA do launch. Commite antes de verificar.
- Porta livre: escolha 3102 ou 3103, a que nenhum outro agente estiver usando. Uma porta com dono que o helper não consegue identificar faz o launch falhar.

## Run contract

Cada execução tem um `RUN_ID`. Manifesto, log, snapshots, screenshots, resultados e hashes ficam em `evidence/verify-clube-do-jogo-web/<RUN_ID>/`; o estado operacional, em `state/verify-clube-do-jogo-web/<RUN_ID>/`. As duas pastas são ignoradas pelo git e não podem ser symlinks. Passe `--run-id <id>` (ou `RUN_ID=<id>`) a todo comando depois do launch; sem isso o helper usa o manifesto mais recente, que pode ser de outro run.

Não use `pkill`, `killall` nem limpeza ampla de diretórios.

## Launch

```sh
$H launch --port 3102
```

Sobe `npm run dev -- --hostname 127.0.0.1 --port <port>` em grupo de processos próprio, com ambiente reduzido a uma allowlist sem segredos, `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` vazios e `NEXT_PUBLIC_AUTO_OPEN_PRODUCT_UPDATE=false`. Só publica o manifesto depois de confirmar cwd, PGID e identidade (boot + instante de criação) do processo, e só termina quando `/jogo-do-mes` responde. Imprime `runId`, `pid`, `port`, `baseUrl` e `evidenceDir`. A primeira compilação do Next leva dezenas de segundos.

Se falhar, rode `cleanup --run-id <id>` antes de tentar de novo; o log da tentativa fica em `evidence/.../launch.log`.

## Doctor

```sh
$H doctor --run-id <id>
```

Somente leitura. Exige: PID vivo com a identidade do manifesto, cwd neste checkout, PGID registrado, porta permitida, HTTP 2xx/3xx em `/jogo-do-mes`, HTML com `Clube do Jogo`, e todo dono da porta dentro da árvore do run. Grava `doctor.json`; sai com código 1 se qualquer check falhar. Rode primeiro sempre que algo parecer errado.

## Drive

```sh
$H drive ranking --run-id <id>
```

Único subcomando de drive. Playwright headless, só ações de usuário por papel e texto visível, sem `page.evaluate`. Abre `/jogo-do-mes`, entra em `Ranking`, escolhe `Não` em `Cocoon`, seleciona `Não consigo rodar`, confirma, abre a contagem negativa e espera o motivo `Não consigo rodar` na lista `Escolhas do clube`. Grava `before-action.png`, `after-vote.png`, os snapshots ARIA antes/depois e `drive-result.json` com tamanho, dimensões e SHA-256 de cada captura. Qualquer console error, page error ou request falha reprova o drive.

As outras features são dirigidas à mão com Playwright seguindo `features/`. Grave as capturas no `evidenceDir` do run; elas entram no hash do `evidence`.

## Evidence

```sh
$H evidence --run-id <id>
```

Exige manifesto, log, `doctor.json` aprovado, capturas e `drive-result.json` com `status: passed`, checkout limpo e erros de runtime vazios. Recalcula assinatura PNG, dimensões e hashes contra o que o drive registrou, confere que o SHA atual é o do launch e que doctor, drive e cleanup têm o mesmo run, worktree, porta, URL e modo. Redige credenciais dos logs e snapshots de texto e grava `evidence.json` com o SHA-256 de cada arquivo retido.

Padrão de prova: caminho real de usuário, ação e estado resultante (não só a tela final), efeito colateral observado. Relatórios separam `unit`, `live` e `perf`; o que não rodou aparece como `not-run` com motivo. Demo é em memória: não prova RLS, auth real nem persistência.

## Cleanup

```sh
$H cleanup --run-id <id>
$H evidence --run-id <id>
```

Antes de sinalizar, confere identidade, cwd e PGID do processo salvo, inspeciona cada membro do grupo e os donos da porta. Recusa se houver processo alheio no grupo ou na porta. Manda SIGTERM ao grupo, SIGKILL se precisar, e só retorna sucesso com grupo vazio e porta livre; grava `cleanup.json`. Nunca apaga a evidência: rodar `evidence` de novo depois do cleanup prova que ela sobreviveu e amarra o `cleanup.json` ao run.

## Helpers

```sh
$H check                    # frontmatter, symlink, helpers executáveis, cabeçalhos dos mapas
$H status --run-id <id>     # imprime o manifesto sem tocar no app
node --test .agents/skills/verify-clube-do-jogo-web/tests/run-contract.test.mjs
```

Os testes de contrato sobem servidores falsos na porta 3102; não os rode com uma instância sua viva em 3102. A inspeção de processos e portas por plataforma fica em `scripts/processes.mjs`.

## Unit, live e performance

Unit, determinísticos:

```sh
npm run test:domain
npm run test:data
npm run test:api
```

`npm run test:web` usa a config Playwright da raiz e a própria porta; rode só em checkout e processos isolados. `npm run build` é pré-requisito, não aprovação de performance.

`npm run perf:auth` é lane separada: dois servidores de produção locais isolados, fixture exclusiva, URLs loopback, com `PERF_AUTH_BASELINE_URL`, `PERF_AUTH_CANDIDATE_URL`, `PERF_AUTH_EMAIL`, `PERF_AUTH_PASSWORD` e `PERF_AUTH_EXPECTED_IDENTITY`, sem gravar credenciais no recibo. Mede do clique de login até o nome autenticado no menu (5 aquecimentos, 10 pares, contexto novo por login); não prova interatividade completa nem sucesso de toda request.

Mapas de feature em `features/README.md`. Use `/maintain-verification-skill` quando rotas, seletores ou o helper mudarem.
