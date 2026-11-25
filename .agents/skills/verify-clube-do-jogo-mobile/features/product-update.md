# Novidades

A folha de novidades da versão instalada abre sozinha no primeiro login dessa versão, e o membro pode reabri-la em Configurações. O conteúdo é o `product-update.json` do release `vX.Y.Z` da versão instalada no GitHub, e só o build Android de produção o busca. No build demo desta skill não há folha nem botão.

## Sub-features

- `update-auto`: abre sozinha quando `EXPO_PUBLIC_AUTO_OPEN_PRODUCT_UPDATE` não é exatamente `'false'`.
- `update-reopen`: `Ver novamente as novidades da vX.Y.Z` reabre a folha.
- `update-steps`: os passos avançam sem perder a posição.

## How to get to it (user POV)

- Toque na aba `Perfil` e depois em `Abrir configurações`.
- Role até `Novidades da vX.Y.Z` e toque `Ver novamente`.

## Driving it with agent-device

Preconditions:

- Doctor ok, modo demonstração ativo e `Votação rápida` fechada. Esta receita não foi verificada: com toques do agent-device, a tela principal não responde depois desse fechamento (observação reproduzida no SKILL.md, ainda sem toque humano). O build desta skill fixa a abertura automática em `false`.

- **Reabrir.** Rode `<agent-device> snapshot -i`, toque `Perfil`, toque `Abrir configurações` e role até o alvo. Rode `<agent-device> press <ref de "Ver novamente as novidades da vX.Y.Z"> --settle`. A folha de novidades aparece.
- **Passos.** Avance pelos botões da folha até o último passo e feche.
- **Prova.** Faça um screenshot da folha aberta e outro depois de fechar.

## Gotchas

- O alvo é o rótulo do Pressable, não o texto `Novidades da vX.Y.Z`, que fica dentro da subárvore colapsada.
- Para provar a abertura automática, faça um build sem `EXPO_PUBLIC_AUTO_OPEN_PRODUCT_UPDATE=false`. O helper sempre fixa `false`.
- Não confunda com `reward-celebration`, a folha de recompensa de tema, que também pode surgir no login.
