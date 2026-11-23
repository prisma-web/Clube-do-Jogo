# Administração do jogo do clube por card

O administrador define o jogo do ciclo direto do cartão ou do detalhe do jogo e pode desfazer e refazer a decisão.

## Sub-features

- Definir um jogo como o jogo do ciclo atual direto do próprio cartão.
- Encerrar o ciclo atual e definir o jogo escolhido para o próximo mês.
- Ver a confirmação da decisão e desfazê-la (`Desfazer`) logo em seguida.
- Refazer uma decisão desfeita dentro da janela de 5 minutos, ou continuar desfazendo ciclos anteriores.
- Ver o custo exato do desfazer antes de confirmar (comentários, votos, posições de ranking, progresso, anotações, recompensas do ciclo removido).

## How to get to it (user POV)

Só para administrador. Em `Ranking`, cada cartão tem o ícone de coroa `Definir <jogo> como jogo do clube`; no detalhe do jogo (`Todos os jogos` → cartão), o botão `Gerenciar jogo do clube` abre o mesmo diálogo. Escolha `Definir/Trocar Jogo de <mês>` ou `Definir <jogo> para <próximo mês>`, confirme e use `Desfazer` se precisar reverter.

## Driving it with Playwright

Preconditions: run demo saudável pelo `doctor`; o `demo-user` é admin.

- **Abrir.** Clique `getByRole('button', { name: 'Definir <jogo> como jogo do clube' })` em `Ranking`. Abre o diálogo `Definir jogo do clube`.
- **Aplicar.** Escolha a opção, siga `Confirmar decisão` até `Decisão aplicada`. O jogo do clube muda em `/jogo-do-mes`.
- **Desfazer.** Clique `Desfazer`. A tela `Desfazer esta decisão?` mostra as contagens; confirme até `Decisão desfeita`.

Assinale pelo título de cada fase e pelo efeito visível, nunca por mutação de estado.

## Gotchas

- Trocar o jogo do ciclo atual apaga os comentários do ciclo; definir o próximo mês não apaga nada do atual.
- O desfazer mostra contagens exatas (`comments`, `votes`, `ranking_rows`, `progress_snapshots`, `note_snapshots`, `reward_grants`) antes de remover; não pule essa tela ao provar o fluxo.
- A janela de `Refazer` é 5 minutos e uma nova definição manual cancela o refazer.
- Uma sessão sem papel admin não deve ver a coroa nem `Gerenciar jogo do clube`; provar isso exige login real (ver `auth-history.md`).
