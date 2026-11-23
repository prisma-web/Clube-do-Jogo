# Votação rápida

Logo depois do login, uma janela mostra um por um os jogos adicionados recentemente que o membro ainda não votou. Ele escolhe `Não`, `Neutro` ou `Jogaria` e passa ao próximo.

## Sub-features

- `deck-open`: a janela abre sozinha depois do login e quando o app volta ao primeiro plano, se houver jogo recente sem voto.
- `deck-vote`: cada botão grava a escolha e avança para o próximo jogo (`<jogo>, jogo n de N`).
- `deck-close`: `Fechar votação rápida` fecha a janela sem votar.
- `deck-details`: `Ver detalhes de <jogo>` abre o detalhe do jogo.

## How to get to it (user POV)

- Entre no modo demonstração. A janela `Qual jogo você quer no clube?` abre por cima de `Jogo do mês`, começando em `Cocoon, jogo 1 de 5`.

## Driving it with verify-mobile

Preconditions:

- `verify-mobile doctor --run-id <id> --udid <UDID>` termina com `doctor: ok`.

- **Votar Não.** Rode `verify-mobile drive --run-id <id> --udid <UDID> --agent-device <cmd> .agents/skills/verify-clube-do-jogo-mobile/flows/demo-quick-vote.yaml`. O fluxo entra no demo, espera a janela, confere `Cocoon, jogo 1 de 5` e toca `Votar não em Cocoon`. A janela avança para `Celeste, jogo 2 de 5` e o botão de Cocoon some.
- **Prova.** Ficam em `drive-demo-quick-vote/` os screenshots `deck-antes-do-voto.png` e `deck-depois-do-voto.png`, e o `result.env` com `STATUS=passed`.

## Gotchas

- O voto dado no deck não pede motivo. O `Não` do cartão no Ranking pede.
- A segunda visão do voto (o cartão de Cocoon no Ranking) não foi verificada: com toques do agent-device, a tela principal não responde depois que a janela fecha (observação reproduzida no SKILL.md). Por isso a prova cobre a ação e o avanço do deck, e o voto gravado fica sem confirmação por outra tela.
- Os ids dos jogos e a ordem vêm de `packages/domain/src/demo.ts`. Uma mudança nos dados demo muda os rótulos.
