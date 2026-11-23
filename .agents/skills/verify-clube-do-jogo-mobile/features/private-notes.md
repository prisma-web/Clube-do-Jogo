# Anotações privadas

O membro escreve uma anotação privada sobre o jogo do mês, edita, apaga, e o rascunho não enviado sobrevive ao fechamento do app.

## Sub-features

- `notes-create`: `Salvar anotação` cria uma linha `note-row-<id>`.
- `notes-draft`: o texto digitado volta depois de fechar e reabrir o app.
- `notes-edit`: segurar a linha e tocar `Editar` troca o texto.
- `notes-delete`: segurar a linha e tocar `Excluir` e depois `Apagar` remove a anotação.

## How to get to it (user POV)

- Na aba `Jogo do mês`, role até `Notas` e toque.
- Digite no campo `private-notes-input` e toque `Salvar anotação`.

## Driving it with agent-device

Preconditions:

- Doctor ok, modo demonstração ativo e `Votação rápida` fechada. Hoje o defeito da tela travada (SKILL.md) bloqueia esta receita depois desse fechamento.

- **Criar.** Toque `Notas`, preencha o campo e salve. Rode `<agent-device> fill <ref do campo> "verificação mobile" --settle` e `<agent-device> press <ref de Salvar anotação> --settle`. Uma linha com `verificação mobile` aparece.
- **Rascunho.** Digite sem salvar e reabra o app com `<agent-device> open com.clubedojogo.mobile.dev --relaunch`. Em demo o relaunch volta ao login, então o rascunho só pode ser provado com fixture Supabase.
- **Apagar.** Rode `<agent-device> longpress <ref da linha> --settle`, toque `Excluir` e depois `Apagar`. A linha some.
- **Prova.** Faça um screenshot com a linha criada e outro depois de apagar.

## Gotchas

- `apps/mobile/.maestro/notes-draft.yaml` usa `stopApp` e `launchApp` para provar o rascunho e depende de sessão restaurada. Em demo ele cai no login e falha.
- Em `apps/mobile/src/features/notes/PrivateNotes.tsx`, a linha e sua ação são irmãs de propósito. Ver o gotcha do Pressable no SKILL.md.
- A fila de envio é por id de anotação, não por jogo. Duas pendências do mesmo jogo convivem.
