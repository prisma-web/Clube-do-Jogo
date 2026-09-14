# Administração do jogo do clube por card

## Sub-features

- Definir um jogo como o jogo do ciclo atual direto do próprio cartão, sem passar por um painel separado.
- Encerrar o ciclo atual e definir o jogo escolhido para o próximo mês.
- Ver a confirmação da decisão e desfazê-la (`Desfazer`) logo em seguida.
- Refazer uma decisão desfeita dentro da janela de 5 minutos, ou continuar desfazendo ciclos anteriores.
- Ver o custo exato do desfazer antes de confirmar (comentários, votos, posições de ranking, progresso, anotações, recompensas do ciclo removido).

## How to get to it (user POV)

Essa ação só aparece para administrador (`isAdmin`) e existe hoje tanto no web quanto no Expo. No web, `Ranking` tem um ícone de coroa por cartão (`Definir <jogo> como jogo do clube`); o detalhe de um jogo (`Todos os jogos` → cartão) tem o mesmo diálogo como botão `Gerenciar jogo do clube`. No Expo, `Ranking` chega lá por dois toques: `Opções de <jogo>` no cartão abre uma folha de ações, e dentro dela, só para admin, `Gerenciar jogo do clube` abre a mesma folha de mudança de ciclo (`apps/mobile/app/(app)/(tabs)/ranking.tsx`); no detalhe do jogo (`apps/mobile/app/(app)/jogos/[id].tsx`) o mesmo botão `Gerenciar jogo do clube` aparece direto na tela, sem sheet intermediária. As duas telas mobile importam `useClubGameAdminAction` de `apps/mobile/src/features/admin` e chamam `clubGameAdmin.openFor(game)`. Em qualquer plataforma, escolha `Definir/Trocar Jogo de <mês>` ou `Definir <jogo> para <próximo mês>`, confirme, e depois use `Desfazer` se precisar reverter.

## Driving it with Playwright

Não há subcomando dedicado; dirija manualmente com uma sessão demo de administrador. Use `aria-label="Definir <jogo> como jogo do clube"` no cartão de `Ranking` ou o botão `Gerenciar jogo do clube` no detalhe (`src/components/club-game-admin-dialog.tsx`). Siga as fases pelo `title` do diálogo: `Definir jogo do clube` → `Confirmar decisão` → `Decisão aplicada`; para desfazer, `Desfazer esta decisão?` → `Decisão desfeita`. Assinale pelo texto de efeito visível em cada fase, nunca por mutação de estado.

## Driving it with Maestro

O código está conectado nas duas telas mobile (`apps/mobile/app/(app)/(tabs)/ranking.tsx` linhas 17, 73, 377-384; `apps/mobile/app/(app)/jogos/[id].tsx` linhas 25, 44, 276-280), mas nenhum fluxo em `apps/mobile/.maestro/` exercita a ação por cartão hoje — isso é uma afirmação sobre cobertura de fluxo, não sobre existência de código. Um yaml novo precisaria: em `Ranking`, tocar `Opções de <jogo>` e depois `Gerenciar jogo do clube`; no detalhe do jogo, tocar `Gerenciar jogo do clube` direto. A cobertura mobile existente para essa decisão passa pelo seletor central em Configurações, não pelo cartão:

```sh
maestro --device <UDID> test apps/mobile/.maestro/admin-cycle.yaml
maestro --device <UDID> test apps/mobile/.maestro/admin-undo.yaml
maestro --device <UDID> test apps/mobile/.maestro/admin-picker-cancel.yaml
```

## Gotchas

- A troca do jogo do ciclo atual apaga os comentários do ciclo; a troca para o próximo mês não apaga nada do ciclo atual.
- `Desfazer` abre uma pré-visualização com contagens exatas (`comments`, `votes`, `ranking_rows`, `progress_snapshots`, `note_snapshots`, `reward_grants`) antes de remover qualquer coisa; não pule essa tela ao provar o fluxo.
- A janela de `Refazer` é 5 minutos e uma nova definição manual cancela a possibilidade de refazer.
- Este recurso só é visível para `isAdmin`; uma sessão sem esse papel não deve nem ver o ícone de coroa, o item `Gerenciar jogo do clube` na folha de ações do cartão, nem o botão no detalhe.
- Não confunda "hook conectado" com "cobertura Maestro": o código por cartão está ligado nas duas telas mobile citadas acima; o que falta é um yaml que o exercite. Procure a implementação em `apps/mobile/src/features/admin/` e o ponto de uso em `apps/mobile/app/`; buscar só em `src/` já produziu um falso "não está conectado" nesta mesma leva.
