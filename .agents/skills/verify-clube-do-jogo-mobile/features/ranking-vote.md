# Ranking e voto

O membro escolhe `Jogaria`, `Neutro` ou `Não` num jogo do ranking. `Não` pede um motivo, e o motivo aparece no próprio cartão.

## Sub-features

- `vote-positive`: `Jogaria` marca o cartão como selecionado.
- `vote-neutral`: `Neutro` grava um voto de 0 ponto que conta como respondido.
- `vote-negative`: `Não` abre `Por que você não jogaria?`, pede o motivo e confirma.
- `vote-toggle`: tocar de novo na escolha selecionada remove o voto.
- `vote-participants`: `Ver quem votou <opção> em <jogo>` lista quem escolheu aquela opção.

## How to get to it (user POV)

- Entre no modo demonstração, feche a `Votação rápida` e toque na aba `Ranking`.
- Role até o cartão `Cocoon`, que começa sem voto do usuário demo.
- O mesmo controle aparece no detalhe do jogo (`Ver detalhes de Cocoon`).

## Driving it with verify-mobile

Preconditions:

- `verify-mobile doctor --run-id <id> --udid <UDID>` termina com `doctor: ok`.

- **Votar Não com motivo.** Rode `verify-mobile drive --run-id <id> --udid <UDID> --agent-device <cmd> .agents/skills/verify-clube-do-jogo-mobile/flows/demo-ranking-vote.yaml`. O fluxo entra no demo, fecha a `Votação rápida`, abre `Ranking`, toca `Não` no cartão `Cocoon`, escolhe `Não consigo rodar` e toca `Confirmar Não`. O texto `Meu motivo: Não consigo rodar` aparece.
- **Remover o voto.** O mesmo fluxo toca `Não` de novo, e `Meu motivo: Não consigo rodar` some.
- **Prova.** Ficam em `drive-demo-ranking-vote/` os screenshots `antes-do-voto`, `depois-do-voto` e `voto-removido`, além do `result.env` com `STATUS=passed`.

## Gotchas

- Hoje esta receita falha: depois que a `Votação rápida` fecha, o toque do agent-device na aba `Ranking` não navega (observação reproduzida no SKILL.md, ainda sem toque humano). O fluxo para ao procurar `Cocoon`. Não contorne o deck por outro caminho para fazer a receita passar.

- O ranking demo já tem votos de outros membros. Use `Cocoon`, que nasce sem escolha do `demo-user`.
- Mire o botão `Não` pela posição relativa ao título do cartão (`below: Cocoon`). Só `Não` casa com o botão de qualquer cartão.
- O voto do mês vale para o ciclo seguinte ao mês selecionado. Um ciclo encerrado desabilita os botões.
- O demo grava em memória. O voto não prova persistência nem RLS.
