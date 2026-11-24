# Mapa de features do mobile

Este mapa é a fonte de verdade para verificar o que um membro faz no app Expo. Leia o índice e use o arquivo da feature como receita.

## Pré-condições de base

- Rode `verify-mobile launch` no commit que quer provar. O build é Release, em modo demo, sem Supabase e com `EXPO_PUBLIC_AUTO_OPEN_PRODUCT_UPDATE=false`.
- Instale o `.app` no aparelho que o `device_open` devolveu e passe pelo `verify-mobile doctor`.
- Comece cada receita com `launchApp: clearState: true` e `Entrar no modo demonstração`, e trate a `Votação rápida` que abre em seguida. Os dados demo saem de `packages/domain/src/demo.ts`, e os meses são relativos à data de hoje.
- Nunca dirija um aparelho que outra sessão esteja usando.

## Convenções de condução

- Prefira o texto visível e o `accessibilityLabel` a coordenadas.
- Abas no iOS usam a regex `'<Nome>(, tab, n of 5)?'` com `index: 0`.
- Toda mutação é desfeita no próprio fluxo, ou fica isolada pelo `clearState` da próxima execução.
- Rode fluxos pelo `verify-mobile drive`, que dá lock e recibo.

## Prova e skips

- Capture a ação e o estado resultante, não só a tela final.
- Uma feature que exige fixture Supabase entra como `not-run` com esse motivo. Não a declare provada pelo demo.
- Não reporte uma entrada não exercitada como provada por outra.

## Features

| Feature | Entrada | Fluxo da skill | Estado em 23/11/2026 |
| --- | --- | --- | --- |
| [Votação rápida](./quick-vote.md) | abre sozinha depois do login | `flows/demo-quick-vote.yaml` | passa em demo |
| [Ranking e voto](./ranking-vote.md) | aba `Ranking` | `flows/demo-ranking-vote.yaml` | falha: toques sem efeito depois da Votação rápida (observação reproduzida só com agent-device) |
| [Progresso com confirmação](./progress-confirmation.md) | aba `Jogo do mês` | manual | não verificada: a receita passa pela mesma tela |
| [Anotações privadas](./private-notes.md) | `Jogo do mês` → `Notas` | manual (`notes-draft.yaml` precisa de fixture) | não verificada: a receita passa pela mesma tela |
| [Histórico de ciclos](./cycle-history.md) | seletor `Alterar ciclo` | manual (`history.yaml` precisa de fixture) | não verificada: a receita passa pela mesma tela |
| [Novidades](./product-update.md) | `Perfil` → `Abrir configurações` | manual | não verificada: a receita passa pela mesma tela |

A observação está no SKILL.md, em "Observação reproduzida": com toques do agent-device, a tela principal não responde depois que a `Votação rápida` fecha, e o UIKit registra um segundo `Modal` recusado no login. Falta o controle com toque humano, outro iOS, Android e Maestro direto. Todas as receitas manuais passam pela `Votação rápida` depois do login, então ficam não verificadas, não reprovadas. Quando houver correção ou controle, rode `demo-ranking-vote.yaml` primeiro: ele é o teste de regressão.

Ficam fora do demo, como `not-run` até existir fixture local: login e cadastro reais, callback `clubedojogo://auth/callback`, restauração de sessão, push, descoberta e mídia pela API e o RLS de toda mutação.
