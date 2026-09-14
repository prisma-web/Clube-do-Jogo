# Fila de anotações pendentes

## Sub-features

- Escrever, editar e excluir uma anotação privada por jogo.
- Manter um rascunho não enviado ao fechar e reabrir o app.
- Mostrar a anotação enviada antes da confirmação do servidor, mesclada por id sem duplicar a linha confirmada.
- Reter a última tentativa e o último erro quando o envio falha, sem perder o rascunho.
- Resolver um conflito quando o servidor já tem outra versão da mesma anotação.

## How to get to it (user POV)

No web, abra o detalhe de um jogo e use o chat de anotações (`src/components/notes-chat.tsx`); a mensagem aparece na lista assim que enviada, antes de qualquer confirmação remota. No Expo, abra `Jogo do Mês` → `Notas` (`apps/mobile/src/features/notes/PrivateNotes.tsx`), digite no campo com `id: private-notes-input` e toque `Salvar anotação`. Se o app for fechado com um rascunho não enviado, reabrir e voltar a `Notas` restaura o texto digitado.

## Driving it with Maestro

```sh
maestro --device <UDID> test apps/mobile/.maestro/notes-draft.yaml
maestro --device <UDID> test apps/mobile/.maestro/notes-timeline.yaml
```

`notes-draft.yaml` escreve um rascunho, força o app a fechar e reabrir (`stopApp`/`launchApp`), confirma que o texto sobrevive, salva, edita por `longPressOn` → `Editar`, e por fim exclui por `longPressOn` → `Excluir` → `Apagar`. `notes-timeline.yaml` encadeia um comentário público na Timeline com uma anotação privada na mesma sessão, confirmando `note-row-.*` pelo texto salvo.

## Driving it with Playwright

Não há subcomando dedicado; dirija manualmente a partir do detalhe de um jogo com o chat de anotações visível. Envie o texto, confirme que a linha aparece antes de qualquer round-trip de rede (mesclagem local) e, ao repetir a ação, confirme que a linha não duplica quando a confirmação remota chega.

## Gotchas

- A fila mobile (`apps/mobile/src/state/notes-queue.ts`) é por id de anotação, não por jogo: duas anotações do mesmo jogo podem ficar pendentes ao mesmo tempo sem se sobrescrever. Um teste que assuma "uma pendência por jogo" está testando um modelo antigo.
- `mergePendingIntoList` mescla por id explicitamente para não duplicar a linha quando a confirmação do servidor chega depois da otimista; não simule esse merge manualmente em um teste, chame a função.
- Um conflito `deleted` nunca carrega um valor remoto (tipo discriminado por `kind`); não acesse `.remote` nesse ramo.
- O modo demo usa IndexedDB local e não prova sincronização real nem RLS.
- `stopApp`/`launchApp` dentro de um fluxo Maestro é a única forma documentada de provar que o rascunho sobrevive ao fechamento do app; pular esse passo não prova a persistência.
