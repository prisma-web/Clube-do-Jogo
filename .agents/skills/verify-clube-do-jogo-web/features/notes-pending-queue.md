# Anotações otimistas

O membro escreve anotações privadas sobre um jogo e as vê na lista na hora, antes da confirmação do servidor, sem duplicar quando ela chega.

## Sub-features

- Escrever, editar e excluir uma anotação privada por jogo.
- Mostrar a anotação enviada antes da confirmação do servidor, mesclada por id sem duplicar a linha confirmada.

## How to get to it (user POV)

Abra o detalhe de um jogo (ou `Jogo do mês`) e use o chat de anotações. A mensagem aparece na lista assim que enviada.

## Driving it with Playwright

Preconditions: run demo saudável pelo `doctor`.

- **Enviar.** No chat de anotações do detalhe do jogo, digite um texto único e envie. A linha aparece imediatamente.
- **Sem duplicata.** Espere a rede assentar. O texto aparece uma única vez na lista.

## Gotchas

- O modo demo usa IndexedDB local e não prova sincronização real nem RLS.
- Use um texto único por run para que a contagem de ocorrências seja uma asserção válida.
