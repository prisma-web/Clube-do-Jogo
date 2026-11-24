# Descoberta e biblioteca

O membro procura jogos, abre o detalhe e guarda um jogo em `Meus Jogos` ou na votação do ciclo.

## Sub-features

- Pesquisar jogos por título, gênero ou plataforma.
- Filtrar a descoberta por fonte e atributos disponíveis.
- Abrir o detalhe de um jogo descoberto.
- Adicionar um jogo a `Meus Jogos`.
- Adicionar um jogo à votação do ciclo atual (`Jogaria no ranking`).

## How to get to it (user POV)

Entre em `Todos os jogos`, use o campo de busca e abra `Filtros` para escolher os atributos disponíveis. Abra um cartão para ver os detalhes ou use `Opções de <jogo>` e escolha `Adicionar a Meus Jogos`. Depois entre em `Meus Jogos` para confirmar a biblioteca. O menu de um cartão do ranking também permite guardar o jogo sem sair da votação.

## Driving it with Playwright

Preconditions: run demo saudável pelo `doctor`.

- **Busca.** `getByRole('link', { name: 'Todos os jogos' })`, depois o campo com placeholder `Buscar jogos, gêneros ou plataformas`. Os cartões filtram pelo texto digitado.
- **Guardar.** Abra `getByRole('button', { name: 'Opções de <jogo>' })` e escolha `Adicionar a Meus Jogos`. Reabrir o menu mostra o item desabilitado `Em Meus Jogos`.
- **Efeito.** Em `/seus-jogos`, o jogo aparece na lista.

## Gotchas

- O demo não chama IGDB; a busca ao vivo de títulos não cacheados exige `IGDB_CLIENT_ID`/`IGDB_CLIENT_SECRET` reais, e sem eles o esperado é o erro de descoberta, não um defeito.
- Os menus Radix ficam em portal e precisam ser dirigidos por papel e texto visível.
- Ao repetir a condução no mesmo run, use um jogo que ainda não esteja na biblioteca demo.
- Uma paginação sem `hasMore` não deve disparar outra requisição.
