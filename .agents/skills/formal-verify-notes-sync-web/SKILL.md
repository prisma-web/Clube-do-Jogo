---
name: formal-verify-notes-sync-web
description: Verificação exaustiva de todas as ordens de execução da sincronização de anotações do web (src/lib/notes-sync.ts, src/lib/local-notes.ts e o glue de src/components/notes-chat.tsx) entre abas do mesmo navegador, outro aparelho e o Supabase. Use antes de mudar esses arquivos, a tabela game_notes ou a resolução de conflitos de notas, e para saber se os findings F1 e F2 ainda reproduzem.
---

# Verificação formal: sincronização de anotações (web)

Use a partir da raiz do checkout. A fonte fica em `.agents/skills/formal-verify-notes-sync-web`; Claude Code a encontra pelo symlink `.claude/skills/formal-verify-notes-sync-web`. Nada toca o IndexedDB de um navegador nem o Supabase: tudo roda em memória.

## O que é verificado

Propriedade principal, `NoSilentRollback`: a sincronização automática (`syncNotes`) nunca troca, no servidor, uma versão de nota por outra mais antiga, nem recria uma nota que foi apagada. Só o usuário pode fazer isso, ao resolver um conflito, e só contra a versão do servidor que o conflito mostrou.

Dano quando ela quebra: uma edição que o usuário salvou, nesta aba, em outra aba ou no celular, some do servidor para todos os aparelhos, ou uma nota apagada volta.

Propriedade secundária, `QuietSyncConverges`: depois que as ações concorrentes terminam, uma sincronização sem concorrência deixa navegador e servidor na mesma versão, ou mostra um conflito. Ela pega quebras que deixam a nota local divergente com status `synced`.

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

## Rodar

```bash
npx --yes tsx@4.23.13 .agents/skills/formal-verify-notes-sync-web/check.ts
```

- A versão do tsx é a mesma do `package-lock.json`. Não precisa de `npm ci`: o código coberto só importa tipos de pacotes.
- Node 24. São 12 cenários e cerca de 26.800 ordens, em uns 9 s de CPU. Numa máquina carregada o relógio passa de 25 s.
- `--trace` imprime o contraexemplo de cada finding conhecido e todos os resultados vistos. `--only <cenário>` roda um cenário só.
- Saída 0: todos os cenários como esperado, inclusive F1 e F2 ainda reproduzindo. Saída 1: algum resultado inesperado. Saída 2: o harness quebrou.

## Ler o resultado

- `ok <cenário>: N ordens`: todas as N ordens foram percorridas e o resultado bate com o registrado.
- `FALHA` com `VIOLAÇÃO NOVA <assinatura>`: uma propriedade quebrou onde não havia finding registrado. Vem a ordem com menos trocas de ator, passo a passo. `A` e `B` são abas do mesmo navegador, `D` é outro aparelho e `Q` é a sincronização final sem concorrência. `n@v2` é a nota `n` na versão 2, e versão maior é mais nova. Exemplo de passo: `A  idb.listNotes → [n@v1]`.
- `não alcançou "<resultado>"`: o cenário deixou de exercitar o que prometia, por exemplo nenhum conflito `remote-deleted`. O código mudou o caminho, ou o cenário foi mal montado. Não apague o `reaches`; descubra qual dos dois.
- `<assinatura> não reproduz mais`: um finding registrado sumiu. Se a mudança o corrigiu de propósito, tire-o de `knownFindings` em `check.ts` e desta página. Se não era para corrigir, o cenário provavelmente deixou de alcançar o caminho.
- `ATENÇÃO código coberto mudou desde <commit>`: algum arquivo do registro de cobertura mudou. Siga "Quando o código coberto muda" antes de confiar no `ok`.

Bug real ou erro de modelagem? Confira cada passo do contraexemplo:

1. `sync`, `resolve` e as funções `remember*` rodam o código real, então o passo é o que o código faz.
2. Suspeite do harness só nos trechos imitados: o glue de `notes-chat.tsx`, o outro aparelho e o servidor em memória. Compare com as linhas citadas acima. Se o glue divergiu do componente, corrija o harness, não o produto, e rode de novo.
3. Confirme que a ordem é possível no navegador. Dois passos `idb.*` de atores diferentes podem se alternar porque cada função de `local-notes.ts` tem sua própria transação. Dois passos `remote.*` podem se alternar porque são requests independentes.

Um contraexemplo que passa nos três é bug real. Reporte a sequência de passos. Não enfraqueça a propriedade nem tire o cenário para ficar verde.

## Findings atuais

Os dois têm a mesma causa. A nota fica no object store `notes` e o metadado de sincronização no `note-sync`, e cada leitura e gravação abre uma transação separada (`src/lib/local-notes.ts:70-160`). `syncNotes` lê os dois em paralelo (`src/lib/notes-sync.ts:381-384`) e trata o par como consistente. Quando outra aba lê ou grava entre as duas transações, o par fica misturado.

### F1: a sincronização devolve ao servidor uma versão mais antiga

Contraexemplo de `sync-vs-edit`, com a nota sincronizada em v1 e duas abas abertas no mesmo jogo:

1. Aba A abre a nota e `syncNotes` lê o store `notes`: `n@v1`.
2. Na aba B o usuário salva a edição v2: `remote.update` com CAS em v1 dá certo, e `rememberConfirmedNote` grava `n@v2` e o metadado com base v2.
3. Aba A lê o store `note-sync`: base v2. O servidor devolve `n@v2`.
4. Para a aba A, a nota local (v1) difere da base (v2) e o servidor não mudou, o que parece uma edição local pendente (`src/lib/notes-sync.ts:324-330`).
5. Aba A chama `remote.update(n@v1, esperado v2)`. O CAS passa, porque o servidor está mesmo em v2, e o servidor volta para v1, inclusive o `updated_at`.

A edição v2 some do servidor e dos outros aparelhos. Ela continua no IndexedDB e volta quando este navegador sincronizar o jogo de novo. Se antes disso alguém salvar por cima de v1, por exemplo a própria aba A, que mostra v1, o CAS passa e v2 se perde de vez. Isso foi confirmado no código real com um cenário avulso: em 2 de 238 ordens, a edição v2 confirmada termina fora do servidor e do IndexedDB.

O mesmo finding aparece sem edição nenhuma neste navegador. Em `sync-vs-sync-vs-device-edit`, duas abas sincronizam enquanto o celular edita, e a aba A desfaz a edição do celular até a próxima sincronização. Em `remote-only-sync-vs-sync-vs-device-edit`, as duas abas gravam nota e metadado intercalados, e é a sincronização seguinte que desfaz a edição. Em `resolve-use-remote-vs-sync`, o usuário escolhe "Usar versão do servidor" numa aba enquanto a outra sincroniza, e a versão que ele descartou volta ao servidor.

### F2: a sincronização recria uma nota recém-apagada

Contraexemplo de `sync-vs-create-then-remove`:

1. Aba A começa a sincronizar e lê o store `note-sync`, ainda sem metadado para `m`.
2. Na aba B o usuário cria `m` (insert e cache) e logo a apaga (delete com CAS e `rememberConfirmedDeletion`, que marca `accepted-remote-deletion`).
3. Aba A lê o store `notes`, onde `m` continua para esconder a exclusão, e o servidor, que não tem `m`.
4. Sem metadado, para a aba A `m` é uma nota legada que nunca subiu (`src/lib/notes-sync.ts:279-283`), e ela faz `remote.insert(m)`.

A nota apagada volta ao servidor e a sincronização seguinte a confirma. A janela é estreita, porque o create e o delete da aba B precisam caber entre as duas leituras locais da aba A.

Direção provável de correção, não verificada: ler e gravar nota e metadado na mesma transação IndexedDB, com os dois object stores juntos, para que `syncNotes` nunca veja um par misturado. Quem corrigir roda esta checagem e espera "não reproduz mais" para F1 e F2.

## Quando o código coberto muda

1. Rode a checagem antes e depois da mudança.
2. Mudou `submit()` ou `remove()` em `notes-chat.tsx`: atualize `edit`, `create` ou `removeNote` em `harness.ts` para seguir as linhas novas.
3. Mudou `NotesLocalStore`, `NotesRemoteStore` ou `local-notes.ts`: ajuste `World.local` e `World.remote` para que cada passo continue sendo exatamente uma transação ou um request. Uma função que passe a fazer duas transações vira dois passos. Uma que junte nota e metadado numa transação vira um passo só.
4. Uma migration mexeu em `game_notes` (trigger em `updated_at`, outra chave, exclusão lógica): ajuste o servidor em `World.remote`.
5. Mudança intencional de comportamento: crie um cenário em `check.ts` cujo `reaches` prove que ele passa pelo caminho novo.
6. Só depois de confirmar que harness e cenários descrevem o código do commit atual, mova `sync-commit` abaixo para esse commit, no mesmo commit da mudança.

## Adicionar um cenário

Em `SCENARIOS`, no `check.ts`: `name`, `summary`, `setup` (com `seedSynced`, `seedLocal`, `seedServer` ou `seedConflict`), `actors`, `reaches` (resultados que o cenário precisa produzir em alguma ordem, como `A:n:conflict/remote-deleted` ou `B:edit:saved`) e `knownFindings`. Três atores custam cerca de 10 mil ordens e 5 s de CPU. Mais que isso deixa a checagem cara demais para rodar a cada mudança.

## Limites

- Um usuário, um jogo, uma ou duas notas, até três atores por cenário, cada um com uma ação (ou criar e apagar).
- Sem falhas de rede ou de IndexedDB. Os caminhos de erro e de retry ficam com `tests/web/notes-migration.test.ts`.
- `remote.list` em uma página só (até 500 notas por jogo). Paginação concorrente não é modelada.
- O glue de `notes-chat.tsx` é imitado. O React (estado, `generationRef`, `runOptimistic`) não roda.
- O outro aparelho é uma escrita atômica com CAS. A fila de notas do app mobile não é verificada aqui.
- Fora do escopo: perda de uma versão que só existe no IndexedDB (nota legada editada offline), snapshots de ciclo (`cycle_note_snapshots`), RLS e modo demo.

## Registro de cobertura

`check.ts` lê este bloco e avisa quando algum arquivo listado, ou SQL que mencione a tabela, mudou desde `sync-commit`.

```text
sync-commit: c3117bb59571a82d6e791977fde03c97fad839f1
covered: src/lib/notes-sync.ts           syncNotes, syncOne, resolveNoteConflict, rememberConfirmedNote, rememberConfirmedDeletion; semântica de createSupabaseNotesRemote imitada
covered: src/lib/local-notes.ts          loadNotes, saveNote, loadNoteSyncMetadata, getNoteSyncMetadata, saveNoteSyncMetadata (uma transação cada)
covered: src/components/notes-chat.tsx   submit() linhas 130-142 e remove() linhas 173-187, imitados em harness.ts
covered: packages/data/src/notes.ts      hipótese do outro aparelho: update e delete com CAS em updated_at
covered-table: game_notes                chave primária id, updated_at sem trigger
```
