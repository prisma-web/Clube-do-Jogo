# Ranking e voto

## Sub-features

- Abrir o jogo do mês e entrar em Ranking.
- Escolher `Jogaria` ou `Não` em um jogo elegível.
- Ao escolher `Não`, selecionar um motivo e confirmar.
- Ver a escolha e o motivo no próprio cartão.
- Consultar ciclos históricos como leitura somente.

## How to get to it (user POV)

Abra o Clube do Jogo, entre em `Ranking` na navegação principal e localize `Cocoon`. No cartão, toque em `Não`, selecione `Não consigo rodar` e toque em `Confirmar Não`. Abra a contagem da escolha negativa e confirme o motivo visível `Não consigo rodar`. Para um ciclo encerrado, escolha outro mês no seletor e confirme que os controles ficam desabilitados.

## Driving it with Playwright

```sh
./.agents/skills/verify-clube-do-jogo/scripts/verify-clube-do-jogo drive ranking --run-id <id>
```

O helper começa em `/jogo-do-mes`, fecha a novidade opcional, usa o link `Ranking`, escopa o cartão pelo texto `Cocoon`, dirige os botões acessíveis, abre a lista de participantes da escolha negativa e registra screenshots e snapshots ARIA antes e depois. A asserção de efeito é o texto `Não consigo rodar` dentro dessa lista.

## Gotchas

- O demo começa com escolhas de outros membros; `Cocoon` é usado porque o `demo-user` começa sem escolha nesse cartão.
- A escolha negativa abre um diálogo e não deve ser simulada por mutação de estado.
- O voto do mês é o ciclo seguinte ao mês selecionado; não atribua o voto a um ciclo histórico.
- A operação demo é em memória e não prova RLS ou persistência real.
- O web smoke desta skill usa 3102/3103, nunca a porta 3101 do root.
