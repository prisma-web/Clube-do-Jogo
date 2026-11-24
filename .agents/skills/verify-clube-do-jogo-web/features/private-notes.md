# Anotações privadas

O membro escreve anotações privadas sobre um jogo no chat de anotações e as edita ou exclui depois.

## Sub-features

- Escrever uma anotação (texto e imagem opcional).
- Editar e excluir pelo menu `Opções da anotação`.
- No modo demo, guardar localmente (IndexedDB, `src/lib/local-notes.ts`); com sessão, sincronizar por `src/lib/notes-sync.ts`.

## How to get to it (user POV)

Abra o detalhe de um jogo (`/jogos/<id>`) ou `Jogo do mês` e use o chat de anotações.

## Driving it with Playwright

Preconditions: run demo saudável pelo `doctor`.

- **Enviar.** Preencha o campo com placeholder `Anote uma ideia…` com um texto único e clique `Salvar anotação`. O texto aparece uma única vez na lista.
- **Editar.** Abra `Opções da anotação` da linha, escolha `Editar`, troque o texto e salve. Só o texto novo aparece.
- **Excluir.** `Opções da anotação` → `Excluir`. O texto some da lista.
- **Persistência local.** Recarregue a página. A anotação continua lá.

## Gotchas

- O modo demo não prova sincronização com o servidor nem RLS; isso exige o Supabase local autenticado.
- Use um texto único por run para que a contagem de ocorrências seja uma asserção válida.
