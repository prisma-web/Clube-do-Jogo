# Progresso com confirmação

O membro troca o status do jogo do mês entre `Não iniciado`, `Comecei` e `Finalizado`. Antes de aplicar, uma folha mostra o efeito sobre datas e nota.

## Sub-features

- `progress-start`: `Comecei` registra a data de início.
- `progress-finish`: `Finalizado` registra a data de fim.
- `progress-reset`: voltar a `Não iniciado` apaga datas e avaliação, e a folha avisa antes.
- `progress-cancel`: `Cancelar` fecha a folha sem mudar nada.

## How to get to it (user POV)

- Entre no modo demonstração. A aba `Jogo do mês` abre na seção `Meu progresso`.
- Toque num dos três status. A folha `Marcar como <status>` abre com `Cancelar` e `Confirmar`.

## Driving it with agent-device

Preconditions:

- Doctor ok, app aberto com `<agent-device> open com.clubedojogo.mobile.dev --relaunch`, modo demonstração ativo e `Votação rápida` fechada. Esta receita não foi verificada: com toques do agent-device, a tela principal não responde depois desse fechamento (observação reproduzida no SKILL.md, ainda sem toque humano).

- **Abrir a confirmação.** Toque `Comecei`. Rode `<agent-device> snapshot -i` e depois `<agent-device> press <ref de Comecei> --settle`. A folha `Marcar como Comecei` aparece.
- **Cancelar.** Rode `<agent-device> press <ref de Cancelar> --settle`. A folha fecha e `Comecei` continua não selecionado.
- **Confirmar.** Repita e toque `Confirmar`. `Comecei` fica selecionado.
- **Reverter.** Toque `Não iniciado` e confirme. A folha avisa que datas e nota serão apagadas, e o status volta.
- **Prova.** Rode `<agent-device> screenshot evidence/verify-clube-do-jogo-mobile/<id>/progresso-comecei.png` com a folha aberta e outra vez depois de confirmar.

## Gotchas

- `club.yaml` de `apps/mobile/.maestro/` toca `Comecei` e espera `selected: true` sem tocar `Confirmar`. Ele não passa pela folha de confirmação e espera a fixture com `Outer Wilds`.
- O texto do efeito é compartilhado com a web (`src/components/progress-confirmation-dialog.tsx` e `apps/mobile/src/components/ProgressConfirmSheet.tsx`). Uma mudança precisa aparecer nos dois.
- Um ciclo encerrado desabilita os três status.
