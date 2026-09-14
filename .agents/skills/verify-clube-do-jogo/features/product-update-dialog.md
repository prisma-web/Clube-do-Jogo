# Diálogo de novidades

## Sub-features

- Abrir automaticamente na primeira sessão de um usuário logado que ainda não viu a versão atual.
- Não reabrir sozinho depois que o usuário chega ao último passo (marcado em `localStorage`/storage local por versão).
- Reabrir manualmente a qualquer momento a partir das preferências.
- Navegar por passos com imagens, sem perder o passo ao rolar.
- Abrir direto em um passo específico por parâmetro de URL no web (`?novidades=atual&passo=N`).

## How to get to it (user POV)

No web, o diálogo abre sozinho ao entrar logado pela primeira vez após uma versão nova (controlado por `NEXT_PUBLIC_AUTO_OPEN_PRODUCT_UPDATE`); para reabrir manualmente, use a URL com `?novidades=atual` ou o evento disparado por `openCurrentProductUpdate()` a partir do menu do usuário. No Expo, a folha equivalente é `ProductUpdateSheet` (`apps/mobile/src/features/product-updates/ProductUpdateSheet.tsx`), aberta por `ProductUpdateGate`; a reabertura manual fica em `Configurações` → `Preferências` → `Novidades da V1.1` (`apps/mobile/src/features/settings/PreferencesPanel.tsx`). O mobile agora tem sua própria escotilha, `EXPO_PUBLIC_AUTO_OPEN_PRODUCT_UPDATE` (mesma semântica de `!== 'false'` do lado web), do PR #33 (`pstack/expo-35-product-update-flag`); antes desse PR o mobile não tinha como suprimir a abertura automática e a verificação mobile deste diálogo ficou bloqueada por essa assimetria — registre isso ao planejar a próxima feature com abertura automática, para que ela já nasça com escotilha nas duas plataformas.

## Driving it with Playwright

Não há subcomando dedicado; dirija com uma sessão demo autenticada nova (sem a chave `productUpdateStorageKey` no `localStorage`) e confirme que o diálogo abre sozinho. Para forçar a abertura, navegue com `?novidades=atual` na URL da rota autenticada. Avance pelos passos pelo botão de navegação visível e confirme que fechar no último passo grava a chave de storage e não reabre em uma nova navegação da mesma sessão.

## Driving it with Maestro

Nenhum fluxo em `apps/mobile/.maestro/` abre `ProductUpdateSheet` ou toca em `Novidades da V1.1` hoje; `login-rewards.yaml` cobre a folha de recompensas de tema (`reward-celebration`), que é um diálogo diferente disparado no mesmo login. Um novo yaml precisaria: subir o ambiente mobile com `EXPO_PUBLIC_AUTO_OPEN_PRODUCT_UPDATE=false` para suprimir a abertura automática e evitar concorrência com outro diálogo do mesmo login, logar com uma conta de fixture, e então navegar até `Configurações` → `Preferências` → `Novidades da V1.1` para provar a reabertura manual como funcionalidade própria — a escotilha suprime só a abertura automática, a reabertura manual continua funcionando com a variável em `'false'`. Alternativamente, para provar especificamente a abertura automática, logue sem a escotilha (variável ausente ou qualquer valor diferente de `'false'`) com uma conta de fixture que ainda não confirmou a versão atual.

## Gotchas

- `AUTO_OPEN_PRODUCT_UPDATE` é lido de `NEXT_PUBLIC_AUTO_OPEN_PRODUCT_UPDATE` na web e de `EXPO_PUBLIC_AUTO_OPEN_PRODUCT_UPDATE` no Expo; o helper `launch` desta skill já força o valor web para `false`. A condução web `launch --port 3102` desta skill nunca abre o diálogo sozinho por padrão. Para provar a abertura automática, use `?novidades=atual` em vez de depender do valor padrão da variável.
- A escotilha mobile (`EXPO_PUBLIC_AUTO_OPEN_PRODUCT_UPDATE=false`) suprime **só** a abertura automática; a reabertura manual por `Configurações` → `Preferências` → `Novidades da V1.1` continua funcionando com a variável nesse valor. Não assuma que a variável desativa o recurso inteiro — um fluxo correto pode suprimir a abertura automática no início e ainda assim exercitar a reabertura manual na mesma sessão.
- A chave de storage é por `update.id`; trocar o id de uma versão nova reabre o diálogo mesmo para quem já viu a versão anterior. Isso é o comportamento esperado, não um bug de regressão.
- O diálogo não deve ser confundido com `reward-celebration` (tema concedido no login); são componentes e propósitos diferentes que podem aparecer na mesma sessão de login.
- O pré-carregamento de imagens dos passos (`document.createElement('img')`) só roda com o diálogo aberto; um teste que force `open=true` sem passar pelo fluxo real de abertura não prova esse pré-carregamento.
