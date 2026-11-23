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
| [Ranking e voto](./ranking-vote.md) | aba `Ranking` | `flows/demo-ranking-vote.yaml` | falha: tela travada depois da Votação rápida |
| [Progresso com confirmação](./progress-confirmation.md) | aba `Jogo do mês` | manual | bloqueada pelo mesmo defeito |
| [Anotações privadas](./private-notes.md) | `Jogo do mês` → `Notas` | manual (`notes-draft.yaml` precisa de fixture) | bloqueada pelo mesmo defeito |
| [Histórico de ciclos](./cycle-history.md) | seletor `Alterar ciclo` | manual (`history.yaml` precisa de fixture) | bloqueada pelo mesmo defeito |
| [Novidades](./product-update.md) | `Perfil` → `Abrir configurações` | manual | bloqueada pelo mesmo defeito |

O defeito está descrito no SKILL.md, em "Defeito aberto". Todas as receitas manuais passam pela `Votação rápida` depois do login. Quando o defeito for corrigido, rode `demo-ranking-vote.yaml` primeiro: ele é o teste de regressão.

Ficam fora do demo, como `not-run` até existir fixture local: login e cadastro reais, callback `clubedojogo://auth/callback`, restauração de sessão, push, descoberta e mídia pela API e o RLS de toda mutação.
