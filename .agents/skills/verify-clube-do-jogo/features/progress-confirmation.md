# Confirmação de mudança de progresso

## Sub-features

- Trocar o status de um jogo entre `Não iniciado`, `Comecei` e `Finalizado`.
- Ver o efeito colateral exato antes de aplicar: quais datas e avaliação serão apagadas, preservadas ou registradas.
- Cancelar a troca sem aplicar nada.
- Refletir o novo status no cartão de origem imediatamente após confirmar.

## How to get to it (user POV)

No web, entre em `Meus Jogos`, abra `Opções de <jogo>` no cartão e escolha o próximo status (`Comecei`, `Finalizado` ou `Não iniciado`). Um diálogo `Marcar como <status>` mostra a consequência da troca; toque `Confirmar` para aplicar ou `Cancelar` para descartar. No Expo, abra `Jogo do Mês`, aba `Meu progresso`, e toque em um dos três status; a mesma folha de confirmação (`ProgressConfirmSheet`) abre antes de aplicar.

## Driving it with Playwright

Não há subcomando dedicado no helper; dirija manualmente a partir da sessão demo: `getByRole('link', { name: 'Meus Jogos' })`, abra `Opções de <jogo>`, selecione o item do status alvo, aguarde o diálogo com título `Marcar como <status>` (`src/components/progress-confirmation-dialog.tsx`), confirme o texto de efeito colateral visível e clique `Confirmar`. Assinale o resultado pelo rótulo de status atualizado no cartão.

## Driving it with Maestro

`apps/mobile/.maestro/club.yaml` inclui a sequência `Comecei` → `Finalizado` na aba `Jogo do Mês(, tab, 1 of 5)?`. O código-fonte (`apps/mobile/app/(app)/(tabs)/jogo-do-mes.tsx`, função `requestStatus`) abre `ProgressConfirmSheet` antes de persistir. Este ciclo não conduziu o simulador iOS por posse de outro agente; confirme ao vivo, na próxima condução, se a asserção `selected: true` do yaml já reflete o estado após o toque em `Confirmar` da folha, ou se falta um passo explícito nela.

## Gotchas

- A confirmação é destrutiva apenas ao voltar para `Não iniciado`: data de início, fim e avaliação são apagadas.
- Web e Expo compartilham a mesma mensagem de efeito colateral por status; qualquer mudança de texto precisa ser replicada nos dois lugares (`src/components/progress-confirmation-dialog.tsx` e `apps/mobile/src/components/ProgressConfirmSheet.tsx`).
- Um ciclo histórico desabilita a troca de status; não tente aplicar progresso em um mês encerrado.
- O demo aplica a mudança em memória; não prova persistência real via `game_progress`.
