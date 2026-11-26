# Novidades

A folha de novidades abre sozinha no primeiro login de uma versão nova, com as notas de todas as versões publicadas depois da última que o membro fechou, e pode ser reaberta em Configurações. O conteúdo é o `product-updates.json` do release `vX.Y.Z` da versão instalada no GitHub. O build Android de produção o busca no GitHub. Um build de desenvolvimento só o busca se for gerado com `EXPO_PRODUCT_UPDATES_RELEASES_URL=<url>/releases`, que troca `https://github.com/<repo>/releases` por um servidor de teste (veja abaixo). No build demo desta skill não há folha nem botão.

## Sub-features

- `update-auto`: abre sozinha quando `EXPO_PUBLIC_AUTO_OPEN_PRODUCT_UPDATE` não é exatamente `'false'`.
- `update-reopen`: `Ver novamente as novidades da vX.Y.Z` reabre a folha.
- `update-steps`: os passos avançam sem perder a posição, cada um com a versão em que saiu.
- `update-more`: no último passo de uma página, `Mais N novidades …` abre as versões mais antigas.

## How to get to it (user POV)

- Toque na aba `Perfil` e depois em `Abrir configurações`.
- Role até `Novidades da vX.Y.Z` (ou `Novidades da vA à vB`) e toque `Ver novamente`.

## Servidor de teste das Novidades

Gere os arquivos com o histórico real e sirva a pasta:

```sh
mkdir -p /tmp/releases/download/v1.3.6
node scripts/release-notes.mjs assemble v1.3.6 --released "$(gh release list --json tagName,isDraft --jq '[.[]|select(.isDraft|not)|.tagName]|join(",")')" \
  --out /tmp/releases/download/v1.3.6/product-update.json --history-out /tmp/releases/download/v1.3.6/product-updates.json
(cd /tmp && python3 -m http.server 8787 --bind 127.0.0.1)
```

Compile com `APP_VERSION=1.3.6 EXPO_LOCAL_HTTP=1 EXPO_PRODUCT_UPDATES_RELEASES_URL=http://127.0.0.1:8787/releases` e, no emulador, `adb reverse tcp:8787 tcp:8787`. O `EXPO_LOCAL_HTTP=1` libera HTTP sem TLS no Android. Só a variante `development` aceita o endereço.

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
