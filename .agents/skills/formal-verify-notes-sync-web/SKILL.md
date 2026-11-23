---
name: formal-verify-notes-sync-web
description: Verificação exaustiva de todas as ordens de execução da sincronização de anotações do web (src/lib/notes-sync.ts, src/lib/local-notes.ts e o glue de src/components/notes-chat.tsx) entre abas do mesmo navegador, outro aparelho e o Supabase. Use antes de mudar esses arquivos, a tabela game_notes ou a resolução de conflitos de notas, e para saber se os findings F1 e F2 ainda reproduzem.
---

# Verificação formal: sincronização de anotações (web)

Use a partir da raiz do checkout. A fonte fica em `.agents/skills/formal-verify-notes-sync-web`; Claude Code a encontra pelo symlink `.claude/skills/formal-verify-notes-sync-web`. Nada toca o IndexedDB de um navegador nem o Supabase: tudo roda em memória.

## O que é verificado

Três propriedades, checadas em cada ordem de cada cenário:

- `NoSilentRollback`: a sincronização automática (`syncNotes`) nunca troca, no servidor, uma versão de nota por outra mais antiga, nem recria uma nota que foi apagada. Só o usuário pode fazer isso, ao resolver um conflito, e só contra a versão do servidor que o conflito mostrou. Dano: uma edição salva nesta aba, em outra aba ou no celular some do servidor para todos os aparelhos, ou uma nota apagada volta.
- `NoLostLocalEdit`: a sincronização automática nunca troca, no IndexedDB, uma versão que o servidor nunca recebeu por outra. Dano: uma edição que só existe neste navegador, como a de um conflito ainda aberto ou a de um upload que falhou, some de vez sem conflito na tela.
- `QuietSyncConverges`: depois que as ações concorrentes terminam, uma sincronização sem concorrência deixa navegador e servidor na mesma versão, ou mostra um conflito. Ela pega quebras que deixam a nota local divergente com status `synced`.

## Como funciona

`check.ts` roda o código real de `src/lib/notes-sync.ts`, sem reescrevê-lo, e percorre todas as ordens possíveis entre os atores de cada cenário. A busca é completa, não amostral. Cada chamada de store é um passo atômico, que é a granularidade real:

- cada função de `src/lib/local-notes.ts` (`loadNotes`, `saveNote`, `loadNoteSyncMetadata`, `getNoteSyncMetadata`, `saveNoteSyncMetadata`) abre sua própria conexão e transação IndexedDB, então outra aba pode rodar entre duas delas;
- cada método de `createSupabaseNotesRemote` (`list`, `get`, `insert`, `update`) é um request e um comando SQL;
- o JS entre dois `await` roda sem interrupção, como no navegador.

`harness.ts` tem o escalonador, as stores em memória e os atores:

| ator | código real que roda | o que é imitado |
|---|---|---|
| `sync` | `syncNotes` | nada |
| `edit`, `create` | `rememberConfirmedNote` | `submit()` em `src/components/notes-chat.tsx:130-142` (update ou insert, depois o cache local) |
| `remove` | `rememberConfirmedDeletion` | `remove()` em `src/components/notes-chat.tsx:173-187` (delete com CAS) |
| `resolve` | `resolveNoteConflict` | nada |
| `deviceEdit`, `deviceDelete` | nada | outro aparelho do mesmo usuário (app mobile, `packages/data/src/notes.ts`) escrevendo com CAS, em um passo |

O servidor em memória imita a tabela `game_notes`: chave primária em `id`, `updated_at` gravado pelo cliente (não há trigger), `update` e `delete` condicionados a `.eq('updated_at', esperado)`.

### Forma de uma violação

Cada violação vem marcada com a forma do par (nota, metadado) que o ator leu antes de decidir. `shapeOf`, em `harness.ts`, calcula a forma a partir do registro de gravações no IndexedDB e das duas leituras do ator:

- `torn-read`, leitura rasgada: outra aba gravou a nota ou o metadado entre as duas leituras do ator.
- `torn-write`, escrita rasgada: a nota guardada foi gravada no meio do par nota→metadado de outra aba, e o ator leu essa nota junto com o metadado daquela aba.
- `half-write`, meia gravação: o ator leu as duas entre as duas gravações do par de outra aba.
- sem forma: o par lido não mistura gravações de outra aba.

Um finding registrado cobre uma violação só quando a assinatura bate e a forma está entre as dele em `KNOWN_FINDINGS` (`check.ts`). F1 cobre `torn-read` e `torn-write`. F2 cobre `torn-read` e `half-write`. A mesma assinatura sem forma, ou com outra forma, é bug novo. F1 não inclui `half-write` porque hoje a nota é gravada antes do metadado: no meio do par, a sincronização vê a nota nova com o metadado velho, e para uma edição isso só confirma a versão do servidor. Uma rollback `half-write` aparece, por exemplo, quando o metadado passa a ser gravado antes da nota.

Os cenários `solo-*` rodam uma ação do usuário sem concorrência, seguida da sincronização final. Nenhum finding cobre o que aparece neles.

## Rodar

```bash
npx --yes tsx@4.23.13 .agents/skills/formal-verify-notes-sync-web/check.ts
```

- A versão do tsx é a mesma do `package-lock.json`. Não precisa de `npm ci`: o código coberto só importa tipos de pacotes.
- Node 24. São 22 cenários e 27.705 ordens, em 8 a 9 s de CPU (user mais sys, três medições num MacBook Pro M1 Pro em 23/11/2026). Com a máquina carregada, o relógio ficou entre 14 e 15 s.
- `--trace` imprime o contraexemplo de cada finding conhecido e todos os resultados vistos. `--only <cenário>` roda um cenário só.
- Saída 0: todos os cenários como esperado, inclusive F1 e F2 reproduzindo nas formas registradas. Saída 1: algum resultado inesperado, com ou sem código desatualizado. Saída 2: o harness quebrou. Saída 3: todos os cenários como esperado, mas o código coberto mudou desde `sync-commit`; siga "Quando o código coberto muda".

## Ler o resultado

- `ok <cenário>: N ordens`: todas as N ordens foram percorridas e o resultado bate com o registrado.
- `FALHA` com `VIOLAÇÃO NOVA <assinatura> [<forma>]`: uma propriedade quebrou e nenhum finding do cenário cobre essa assinatura nessa forma. Sem `[<forma>]`, o bug não depende de outra aba misturar o par, mesmo que a assinatura seja a de F1. Vem a ordem com menos trocas de ator, passo a passo. `A` e `B` são abas do mesmo navegador, `D` é outro aparelho e `Q` é a sincronização final sem concorrência. `n@v2` é a nota `n` na versão 2, e versão maior é mais nova. Exemplo de passo: `A  idb.listNotes → [n@v1]`. A linha `✗` termina com a forma em palavras.
- `não alcançou "<resultado>"`: o cenário deixou de exercitar o que prometia, por exemplo nenhum conflito `remote-deleted`. O código mudou o caminho, ou o cenário foi mal montado. Não apague o `reaches`; descubra qual dos dois.
- `F1 (...) não reproduz mais`: um finding registrado sumiu em todas as suas formas. Se a mudança o corrigiu de propósito, tire-o de `KNOWN_FINDINGS` em `check.ts` e desta página. Se não era para corrigir, o cenário provavelmente deixou de alcançar o caminho.
- `DESATUALIZADO  código coberto mudou desde <commit>`, no topo e no fim da saída: algum arquivo do registro de cobertura mudou. Siga "Quando o código coberto muda" antes de confiar no `ok`.

Bug real ou erro de modelagem? Confira cada passo do contraexemplo:

1. `sync`, `resolve` e as funções `remember*` rodam o código real, então o passo é o que o código faz.
2. Suspeite do harness só nos trechos imitados: o glue de `notes-chat.tsx`, o outro aparelho, o servidor em memória e a forma calculada por `shapeOf`. Compare com as linhas citadas acima e com os passos `idb.*` do contraexemplo. Se o harness divergiu do código, corrija o harness, não o produto, e rode de novo.
3. Confirme que a ordem é possível no navegador. Dois passos `idb.*` de atores diferentes podem se alternar porque cada função de `local-notes.ts` tem sua própria transação. Dois passos `remote.*` podem se alternar porque são requests independentes.

Um contraexemplo que passa nos três é bug real. Reporte a sequência de passos. Não enfraqueça a propriedade, não acrescente uma forma a um finding nem tire o cenário para ficar verde.

## Findings atuais

Os dois foram confirmados no código real sob o harness. No navegador, a janela para cada um é estreita. Eles têm a mesma causa. A nota fica no object store `notes` e o metadado de sincronização no `note-sync`, e cada leitura e cada gravação abre sua própria transação (`src/lib/local-notes.ts:70` e `:108` para as leituras, `:86` e `:147` para as gravações). `syncNotes` dispara as duas leituras juntas num `Promise.all` (`src/lib/notes-sync.ts:381-384`) e trata o par como consistente. Quando outra aba grava entre essas transações, o par fica misturado.

### F1: a sincronização devolve ao servidor uma versão mais antiga

Contraexemplo de `sync-vs-edit`, forma `torn-read`, com a nota sincronizada em v1 e duas abas abertas no mesmo jogo:

1. Aba A abre a nota e `syncNotes` lê o store `notes`: `n@v1`.
2. Na aba B o usuário salva a edição v2: `remote.update` com CAS em v1 dá certo, e `rememberConfirmedNote` grava `n@v2` e o metadado com base v2.
3. Aba A lê o store `note-sync`: base v2. O servidor devolve `n@v2`.
4. Para a aba A, a nota local (v1) difere da base (v2) e o servidor não mudou, o que parece uma edição local pendente (`src/lib/notes-sync.ts:324-330`).
5. Aba A chama `remote.update(n@v1, esperado v2)`. O CAS passa, porque o servidor está mesmo em v2, e o servidor volta para v1, inclusive o `updated_at`.

A edição v2 some do servidor e dos outros aparelhos. Ela continua no IndexedDB e volta ao servidor na próxima sincronização deste navegador, como mostra a sincronização final `Q` do contraexemplo. Inferido do código, fora desta checagem: se antes disso a aba A, que ainda mostra v1, salvar uma edição por cima, o CAS passa e v2 se perde de vez.

Janela no navegador: as duas transações da aba B, uma depois da outra, precisam caber entre as duas transações de leitura da aba A, que nascem quase juntas. São milissegundos, mais prováveis com a aba A ocupada ou em segundo plano.

O mesmo finding aparece sem edição nenhuma neste navegador. Em `sync-vs-sync-vs-device-edit` (`torn-read`), a aba B baixa uma edição do celular entre as duas leituras da aba A, e a aba A desfaz a edição até a próxima sincronização. Em `remote-only-sync-vs-sync-vs-device-edit` (`torn-write`), as duas abas baixam a nota ao mesmo tempo, cada uma numa versão, e gravam nota e metadado intercalados; a sincronização seguinte desfaz a edição. Em `resolve-use-remote-vs-sync` (`torn-read`), o usuário escolhe "Usar versão do servidor" numa aba enquanto a outra sincroniza, e a versão que ele descartou volta ao servidor.

### F2: a sincronização recria uma nota recém-apagada

Contraexemplo de `sync-vs-create-then-remove`, forma `torn-read`:

1. Aba A começa a sincronizar e lê o store `note-sync`, ainda sem metadado para `m`.
2. Na aba B o usuário cria `m` (insert e cache) e logo a apaga (delete com CAS e `rememberConfirmedDeletion`, que marca `accepted-remote-deletion`).
3. Aba A lê o store `notes`, onde `m` continua para esconder a exclusão, e o servidor, que não tem `m`.
4. Sem metadado, para a aba A `m` é uma nota legada que nunca subiu (`src/lib/notes-sync.ts:279-283`), e ela faz `remote.insert(m)`.

Forma `half-write` do mesmo cenário: a aba A lê os dois stores entre o `saveNote` e o `saveNoteSyncMetadata` do create da aba B, e vê `m` sem metadado. A aba B apaga `m` antes do `remote.list` da aba A, e a aba A recria a nota.

A nota apagada volta ao servidor e a sincronização seguinte a confirma. Janela no navegador: nas duas formas, o delete da aba B, que no app vem de um clique do usuário depois do create, precisa chegar ao servidor antes do `remote.list` da aba A. Na prática é teórico, salvo uma aba A parada no meio da sincronização.

Direção provável de correção, não verificada: ler e gravar nota e metadado na mesma transação IndexedDB, com os dois object stores juntos, para que `syncNotes` nunca veja um par misturado. Quem corrigir ajusta `World.local` (passo 3 abaixo), roda esta checagem e espera "não reproduz mais" para F1 e F2.

## Quando o código coberto muda

1. Rode a checagem antes e depois da mudança. Enquanto a mudança não está aceita, a saída 3 é esperada.
2. Mudou `submit()` ou `remove()` em `notes-chat.tsx`: atualize `edit`, `create` ou `removeNote` em `harness.ts` para seguir as linhas novas.
3. Mudou `NotesLocalStore`, `NotesRemoteStore` ou `local-notes.ts`: ajuste `World.local` e `World.remote` para que cada passo continue sendo exatamente uma transação ou um request. Uma função que passe a fazer duas transações vira dois passos. Uma que junte nota e metadado numa transação vira um passo só.
4. Mudou a ordem ou o número de gravações IndexedDB de uma operação, por exemplo em `rememberConfirmedNote`: revise `shapeOf` e as formas de cada finding. Uma forma só entra num finding depois que você leu um contraexemplo dela e confirmou que a causa é a mesma.
5. Uma migration mexeu em `game_notes` (trigger em `updated_at`, outra chave, exclusão lógica): ajuste o servidor em `World.remote`.
6. Mudança intencional de comportamento: crie um cenário em `check.ts` cujo `reaches` prove que ele passa pelo caminho novo.
7. Aceite: revise `git diff <sync-commit> -- <arquivos cobertos>`, confirme que harness e cenários descrevem o código e só então mova `sync-commit` abaixo para o commit que contém a mudança. O hash só existe depois do commit, então mova-o num commit seguinte que mexe só neste SKILL.md. A saída volta a 0.

## Adicionar um cenário

Em `SCENARIOS`, no `check.ts`: `name`, `summary`, `setup` (com `seedSynced`, `seedLocal`, `seedServer`, `seedConflict` ou `seedUnsyncedEdit`), `actors`, `reaches` e `knownFindings`. `reaches` lista o que alguma ordem precisa produzir: um resultado de ator, como `A:n:conflict/remote-deleted` ou `B:edit:saved`, ou `passo <linha do trace>` para um caminho que o resultado não distingue, como `passo A  remote.get(n) → —`. Para uma ação sem concorrência, use `solo(...)`. Um cenário com três atores custa de 5 a 11 mil ordens e de 2 a 3,5 s de CPU; com dois, até 4.200. Mais atores deixam a checagem cara demais para rodar a cada mudança.

## Limites

- Um usuário, um jogo, uma ou duas notas, até três atores por cenário, cada um com uma ação (ou criar e apagar).
- Sem falhas de rede ou de IndexedDB. Os caminhos de erro e de retry ficam com `tests/web/notes-migration.test.ts`. A edição local que não subiu (`seedUnsyncedEdit`) é semeada; o upload que falhou não roda.
- `remote.list` em uma página só (até 500 notas por jogo). Paginação concorrente não é modelada.
- O glue de `notes-chat.tsx` é imitado. O React (estado, `generationRef`, `runOptimistic`) não roda.
- O outro aparelho é uma escrita atômica com CAS. A fila de notas do app mobile não é verificada aqui.
- `NoLostLocalEdit` olha só o `saveNote` da sincronização automática. Uma versão local escondida por um `accepted-remote-deletion` que o usuário não escolheu passa sem alarme.
- `shapeOf` pareia as gravações de cada ator em ordem, o que supõe uma operação por ator (`createThenRemove` é a exceção, e sua segunda operação só grava metadado).
- Fora do escopo: snapshots de ciclo (`cycle_note_snapshots`), RLS e modo demo.

## Registro de cobertura

`check.ts` lê este bloco e sai com 3 quando algum arquivo listado, ou SQL que mencione a tabela, mudou desde `sync-commit`.

```text
sync-commit: c3117bb59571a82d6e791977fde03c97fad839f1
covered: src/lib/notes-sync.ts           syncNotes, syncOne, resolveNoteConflict (as quatro resoluções), rememberConfirmedNote, rememberConfirmedDeletion; semântica de createSupabaseNotesRemote imitada
covered: src/lib/local-notes.ts          loadNotes, saveNote, loadNoteSyncMetadata, getNoteSyncMetadata, saveNoteSyncMetadata (uma transação cada)
covered: src/components/notes-chat.tsx   submit() linhas 130-142 e remove() linhas 173-187, imitados em harness.ts
covered: packages/data/src/notes.ts      hipótese do outro aparelho: update e delete com CAS em updated_at
covered-table: game_notes                chave primária id, updated_at sem trigger
```
