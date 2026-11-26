# Diálogo de novidades

Um diálogo em passos apresenta as novidades das versões publicadas depois da última que o membro fechou, lidas do histórico do release mais recente no GitHub (asset `product-updates.json`, ou `product-update.json` num release anterior a ele). Abre sozinho quando há versão nova e pode ser reaberto. Sem esses assets, ou com o GitHub fora, não há diálogo nem botão em Configurações.

## Sub-features

- Abrir automaticamente na primeira sessão de um usuário logado que ainda não viu a versão atual.
- Não reabrir sozinho depois de fechado (chave `clube-do-jogo:product-update:vX.Y.Z:completed` no `localStorage`).
- Quem pulou versões vê todas desde a última fechada, da mais nova para a mais antiga, em páginas de até 10 notas. No último passo de uma página, `Mais N novidades …` abre a seguinte. Sem nenhuma chave, só a versão atual.
- Reabrir manualmente em `Configurações` → `Preferências` → `Novidades da vX.Y.Z`.
- Navegar por passos com imagens, sem perder o passo ao rolar.
- Abrir direto em um passo por URL (`?novidades=atual&passo=N`).

## How to get to it (user POV)

O diálogo abre sozinho ao entrar logado pela primeira vez após uma versão nova. Para reabrir, use `Configurações` → `Preferências` → `Novidades da vX.Y.Z` (`Ver novamente`) ou a URL com `?novidades=atual`.

## Driving it with Playwright

Preconditions: run demo saudável pelo `doctor`, contexto de browser novo (sem `localStorage`).

- **Abrir por URL.** Navegue para `/jogo-do-mes?novidades=atual`. O diálogo abre no primeiro passo.
- **Passo direto.** Navegue com `?novidades=atual&passo=2`. O diálogo abre no passo 2.
- **Concluir.** Avance pelos passos até o último e feche. Uma nova navegação na mesma sessão não reabre o diálogo.

## Gotchas

- O `launch` força `NEXT_PUBLIC_AUTO_OPEN_PRODUCT_UPDATE=false`, então o diálogo nunca abre sozinho num run do helper; a abertura automática fica `not-run` e a prova usa `?novidades=atual`. Só o valor exato `'false'` desliga a abertura automática.
- O navegador pede `/api/product-update` depois de montar a página, e essa rota baixa o arquivo do GitHub. Para dirigir o diálogo sem um release com notas, rode o dev server com `NODE_OPTIONS="--import $PWD/tests/web/fixtures/github-release-stub.mjs"`, que responde aos downloads de `github.com/prisma-web/Clube-do-Jogo/releases/` com os arquivos de `tests/web/fixtures/releases/` (mesmo caminho da URL); é o que `npm run test:web` faz. `GITHUB_RELEASES_FIXTURES=<pasta>` troca a pasta, por exemplo por um histórico gerado com `scripts/release-notes.mjs assemble <tag> --released <tags> --history-out <pasta>/latest/download/product-updates.json`. Para ver o caso sem notas, bloqueie `/api/product-update` no navegador (`page.route`).
- A chave de storage é por versão; uma versão nova reabre o diálogo mesmo para quem viu a anterior. É o esperado.
- Não confunda com `reward-celebration` (tema concedido no login), que pode aparecer na mesma sessão.
- Fechar: botão `Fechar novidades`. `Agora não` é da `reward-celebration`, não deste diálogo.
