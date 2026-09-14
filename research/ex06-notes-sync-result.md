# EX06 — resultado da sincronização segura de notas

## Resultado

A carga web deixou de fazer `upsert` de todas as notas locais no mount. O novo
motor reconcilia cada ID usando conteúdo completo e um baseline confirmado,
persiste estado separado no IndexedDB e só atualiza o remoto por compare-and-set
de `updated_at`. A mesma proteção condicional foi aplicada a edição e exclusão
normais da tela.

O IndexedDB passou da versão 2 para a 3 de modo aditivo. O store `notes` e seus
objetos permanecem intactos; o novo store `note-sync` guarda hash, baseline,
estado, erro e snapshot remoto de conflito. Exclusões remotas confirmadas nunca
causam remoção automática da cópia legada: a nota é ocultada após a escolha do
usuário, mas continua recuperável localmente.

`src/lib/notes-sync.ts` expõe:

- `syncNotes`, com resultado por registro, resumo e as duas versões do conflito;
- `resolveNoteConflict`, com escolhas explícitas e verificação de versão antes
  de escrever;
- `createSupabaseNotesRemote`, sempre filtrado por usuário e jogo e paginado;
- `rememberConfirmedNote` e `rememberConfirmedDeletion` para manter o baseline
  coerente após operações normais da UI.

O contrato de apresentação e resolução está em
`contracts/ex06-notes-sync.md`. `notes-chat` já mantém `syncResult`, mostra um
indicador textual mínimo para erro/conflito e publica contadores em data
attributes. A apresentação completa das versões e botões de resolução ficou
deliberadamente fora desta fatia para a integração visual coordenada.

## Evidência executada

Comandos concluídos com sucesso:

```text
./node_modules/.bin/playwright test --config tests/web/notes-migration.config.ts --reporter=line
8 passed (653ms)

./node_modules/.bin/tsc -p tsconfig.web.json --noEmit
exit 0

./node_modules/.bin/eslint src/lib/local-notes.ts src/lib/notes-sync.ts \
  src/components/notes-chat.tsx tests/web/notes-migration.test.ts \
  tests/web/notes-migration.config.ts
exit 0

git diff --check
exit 0
```

Os testes cobrem:

1. upgrade real do IndexedDB v2 em Chromium, preservando ID, corpo, imagem e
   timestamps e adicionando o store de metadados;
2. envio parcial com uma nota confirmada e outra em erro, seguido de retry sem
   duplicar a confirmada;
3. resposta de rede perdida depois do commit remoto, reconciliada por leitura;
4. versões diferentes sem baseline, preservadas até `use-local` explícito;
5. mudança somente remota e conflito quando local e remoto mudam;
6. edição local por compare-and-set e rejeição de resolução já obsoleta;
7. exclusão remota sem ressurreição, com cópia local mantida depois de aceitar;
8. bootstrap de nova sessão, isolamento de outra conta e fallback offline.

O `npm run test:web` padrão foi tentado, mas o servidor configurado usa
Turbopack e recusou o symlink de `node_modules` apontando para o worktree EX02,
como já previsto para este ambiente. O config dedicado não inicia a aplicação e
executa o algoritmo e o IndexedDB real no Chromium. Nenhum build foi alegado.

## Limites e pendências

- Não houve chamada ao Supabase remoto, service role, migration, reset ou
  alteração de dados de produção. RLS owner foi verificada aqui pela construção
  das queries e por testes de isolamento em adaptadores, não por uma lane live.
- Lanes web/mobile, screenshots, vídeo e perf continuam pendentes da integração
  EX06 completa. Snapshots históricos não foram escritos nem alterados.
- Sem um baseline produzido pela versão nova, uma nota local sem linha remota é
  indistinguível de uma nota que nunca foi enviada. Por isso a primeira execução
  a envia, como exige a migração. Se ela havia sido sincronizada e apagada antes
  de qualquer execução desta versão, não existe tombstone histórico capaz de
  provar a exclusão. Depois do primeiro baseline confirmado, toda exclusão é
  detectada e nunca ressuscitada automaticamente.
- Se a gravação do marcador local falhar depois de uma exclusão remota já
  confirmada, `notes-chat` tenta remover somente aquela cópia cacheada para
  impedir ressurreição. Esse é o único fallback que abre mão da recuperação
  local, e ocorre após confirmação remota e falha do próprio IndexedDB.
