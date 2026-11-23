# Ranking e voto

O membro registra no Ranking se jogaria cada jogo elegível do próximo ciclo e, ao recusar, diz por quê.

## Sub-features

- Abrir o jogo do mês e entrar em Ranking.
- Escolher `Jogaria`, `Neutro` ou `Não` em um jogo elegível. `Neutro` grava um voto de 0 ponto que conta como respondido.
- Ao escolher `Não`, selecionar um motivo e confirmar.
- Ver a escolha e o motivo no próprio cartão.
- Consultar ciclos históricos como leitura somente.

## How to get to it (user POV)

Abra o Clube do Jogo, entre em `Ranking` na navegação principal e localize `Cocoon`. No cartão, toque em `Não`, selecione `Não consigo rodar` e toque em `Confirmar Não`. Abra a contagem da escolha negativa e confirme o motivo visível `Não consigo rodar`. Para um ciclo encerrado, escolha outro mês no seletor e confirme que os controles ficam desabilitados.

## Driving it with Playwright

```sh
./.agents/skills/verify-clube-do-jogo-web/scripts/verify-clube-do-jogo-web drive ranking --run-id <id>
```

O helper começa em `/jogo-do-mes`, fecha a novidade opcional, usa o link `Ranking`, escopa o cartão `article.ranking-card` pelo texto `Cocoon`, dirige os botões acessíveis, abre a lista `Escolhas do clube` da escolha negativa e registra screenshots e snapshots ARIA antes e depois. A asserção de efeito é o texto `Não consigo rodar` dentro dessa lista e o botão `data-choice="would_not_play"` com `aria-pressed="true"`.

## Gotchas

- O demo começa com escolhas de outros membros; `Cocoon` é usado porque o `demo-user` começa sem escolha nesse cartão. Cada run precisa de um launch novo: o estado demo vive no processo.
- A escolha negativa abre um diálogo e não deve ser simulada por mutação de estado.
- Tocar de novo na escolha selecionada, inclusive `Neutro`, remove o voto.
- O voto do mês é o ciclo seguinte ao mês selecionado; não atribua o voto a um ciclo histórico.
- A operação demo é em memória e não prova RLS ou persistência real.
