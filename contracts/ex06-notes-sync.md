# EX06 — contrato de sincronização das notas web

Este contrato cobre somente a migração segura das notas privadas já guardadas no
IndexedDB. O Supabase continua sendo a fonte compartilhada entre web e mobile;
`cycle_note_snapshots` continua estritamente somente leitura.

## Invariantes

- A identidade de uma nota inclui `id`, `userId` e `gameId`. Registros de outro
  usuário ou jogo são rejeitados, mesmo que o backend devolva dados indevidos.
- O conteúdo comparado inclui corpo, imagem e os timestamps originais. A imagem
  Data URL nunca é removida ou transformada durante a migração.
- Cada confirmação remota é registrada por nota, somente depois de conferir a
  linha devolvida pelo Supabase. Uma falha deixa a cópia IndexedDB recuperável.
- A cópia local não é apagada pela sincronização. Metadados ficam em um object
  store separado e não alteram o objeto `LocalNote` existente.
- Writes usam `insert` para nota inédita e `update` condicionado ao
  `updated_at` remoto conhecido. Não existe upsert cego.
- Uma nota que já teve baseline confirmado e depois desapareceu do servidor não
  é recriada automaticamente. Ela vira conflito `remote-deleted`.
- Repetir a sincronização é idempotente: notas confirmadas iguais não geram
  write, e uma falha em uma nota não impede que as demais sejam confirmadas.

## Estado entregue à tela

`syncNotes(context, stores)` devolve `NotesSyncResult`:

- `notes`: visão segura para exibição (remotas confirmadas, locais pendentes e a
  versão local de conflitos; cópias cuja exclusão remota já foi aceita ficam
  ocultas, mas permanecem no IndexedDB);
- `items`: um estado por ID (`pending`, `synced`, `conflict` ou `error`), com a
  mensagem da última falha quando houver;
- `conflicts`: ambas as versões e as resoluções válidas;
- `summary`: contadores para a apresentação de status;
- `remoteReadError`: falha da listagem remota. Nesse caso nenhuma conclusão
  sobre ausência/deleção remota é tomada e as notas locais continuam visíveis.

Conflitos persistem no IndexedDB e voltam em uma nova sessão até uma decisão do
usuário. A UI chama `resolveNoteConflict(...)` somente após ação explícita:

| Conflito | Escolhas |
| --- | --- |
| `different-without-baseline` | `use-local` ou `use-remote` |
| `both-changed` | `use-local` ou `use-remote` |
| `remote-deleted` | `restore-local` ou `accept-remote-deletion` |

`use-local`/`restore-local` confirmam a linha escrita antes de atualizar o
baseline. `use-remote` relê e confere que a versão remota apresentada ainda é a
atual antes de substituir o cache local. `accept-remote-deletion` mantém o
registro físico local como cópia recuperável, marca a decisão e o oculta da
lista normal. Se o remoto mudou depois que o conflito foi exibido, a resolução
falha sem sobrescrever nada e uma nova sincronização deve atualizar o conflito.

## Integração Supabase

O adaptador web sempre filtra `user_id` e `game_id`, além da proteção RLS. O
`insert` preserva todos os campos. O `update` também filtra o `updated_at`
observado para detectar corrida. A UI pode usar `rememberConfirmedNote` depois
de create/edit normal e `rememberConfirmedDeletion` depois de delete confirmado
para manter o baseline coerente sem remover a cópia IndexedDB.
