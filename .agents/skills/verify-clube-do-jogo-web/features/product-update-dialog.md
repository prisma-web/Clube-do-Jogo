# Diálogo de novidades

Um diálogo em passos apresenta as novidades da versão atual, abre sozinho uma vez por versão e pode ser reaberto.

## Sub-features

- Abrir automaticamente na primeira sessão de um usuário logado que ainda não viu a versão atual.
- Não reabrir sozinho depois que o usuário chega ao último passo (chave por versão no `localStorage`).
- Reabrir manualmente a partir do menu do usuário.
- Navegar por passos com imagens, sem perder o passo ao rolar.
- Abrir direto em um passo por URL (`?novidades=atual&passo=N`).

## How to get to it (user POV)

O diálogo abre sozinho ao entrar logado pela primeira vez após uma versão nova. Para reabrir, use o item de novidades no menu do usuário ou a URL com `?novidades=atual`.

## Driving it with Playwright

Preconditions: run demo saudável pelo `doctor`, contexto de browser novo (sem `localStorage`).

- **Abrir por URL.** Navegue para `/jogo-do-mes?novidades=atual`. O diálogo abre no primeiro passo.
- **Passo direto.** Navegue com `?novidades=atual&passo=2`. O diálogo abre no passo 2.
- **Concluir.** Avance pelos passos até o último e feche. Uma nova navegação na mesma sessão não reabre o diálogo.

## Gotchas

- O `launch` força `NEXT_PUBLIC_AUTO_OPEN_PRODUCT_UPDATE=false`, então o diálogo nunca abre sozinho num run do helper; a abertura automática fica `not-run` e a prova usa `?novidades=atual`. Só o valor exato `'false'` desliga a abertura automática.
- A chave de storage é por `update.id`; um id novo reabre o diálogo mesmo para quem viu a versão anterior. É o esperado.
- Não confunda com `reward-celebration` (tema concedido no login), que pode aparecer na mesma sessão.
- Fechar: botão `Fechar novidades` ou `Agora não`.
