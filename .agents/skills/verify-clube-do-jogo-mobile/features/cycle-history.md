# Histórico de ciclos

O membro escolhe um mês anterior e vê o jogo daquele ciclo em modo leitura, com progresso e voto desabilitados.

## Sub-features

- `history-open`: o seletor lista os ciclos disponíveis.
- `history-readonly`: um ciclo anterior mostra `Ciclo encerrado, somente leitura` e desabilita os status.
- `history-return`: voltar ao mês atual reabilita os controles.

## How to get to it (user POV)

- Toque no botão `Alterar ciclo, atual <Mês de Ano>` no topo de `Jogo do mês` ou de `Ranking`.
- Escolha `Selecionar <Mês de Ano>`.

## Driving it with agent-device

Preconditions:

- Doctor ok, modo demonstração ativo e `Votação rápida` fechada. Esta receita não foi verificada: com toques do agent-device, a tela principal não responde depois desse fechamento (observação reproduzida no SKILL.md, ainda sem toque humano). O demo tem três meses: o atual e os dois anteriores.

- **Abrir o seletor.** Rode `<agent-device> snapshot -i` e toque a ref `Alterar ciclo, atual ...`. A lista de meses aparece.
- **Mês anterior.** Toque `Selecionar <mês anterior>`. O aviso `Ciclo encerrado, somente leitura` aparece e `Comecei` fica desabilitado.
- **Voltar.** Selecione o mês atual de novo. Os status voltam a aceitar toque.
- **Prova.** Faça um screenshot no ciclo encerrado e outro no ciclo atual.

## Gotchas

- `apps/mobile/.maestro/history.yaml` fixa `Setembro de 2026` e `Agosto de 2026` com `Outer Wilds` e `Celeste`, que são dados da fixture. Em demo os meses mudam com a data.
- O mês escolhido fica salvo (`SELECTED_MONTH_KEY`). Volte ao atual no fim, ou use `clearState`.
