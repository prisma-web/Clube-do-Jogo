# Confirmação de mudança de progresso

Antes de trocar o status de um jogo, o membro vê exatamente o que a troca apaga ou registra.

## Sub-features

- Trocar o status de um jogo entre `Não iniciado`, `Comecei` e `Finalizado`.
- Ver o efeito colateral exato antes de aplicar: quais datas e avaliação serão apagadas, preservadas ou registradas.
- Cancelar a troca sem aplicar nada.
- Refletir o novo status no cartão de origem imediatamente após confirmar.

## How to get to it (user POV)

Entre em `Meus Jogos`, abra `Opções de <jogo>` no cartão e escolha o próximo status. Um diálogo `Marcar como <status>` mostra a consequência; `Confirmar` aplica e `Cancelar` descarta.

## Driving it with Playwright

Preconditions: run demo saudável pelo `doctor`.

- **Abrir.** `getByRole('link', { name: 'Meus Jogos' })`, abra `Opções de <jogo>` e escolha o status alvo. Aparece o diálogo `Marcar como <status>` com o texto de efeito.
- **Cancelar.** `Cancelar` fecha o diálogo e o cartão mantém o status anterior.
- **Confirmar.** Repita e clique `Confirmar`. O rótulo de status do cartão muda.

## Gotchas

- A confirmação só é destrutiva ao voltar para `Não iniciado`: data de início, fim e avaliação são apagadas.
- Um ciclo histórico desabilita a troca de status.
- O demo aplica a mudança em memória; não prova persistência real via `game_progress`.
