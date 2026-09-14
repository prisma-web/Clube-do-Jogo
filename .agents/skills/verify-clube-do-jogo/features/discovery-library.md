# Descoberta e biblioteca

## Sub-features

- Pesquisar jogos por título, gênero ou plataforma.
- Filtrar a descoberta por fonte e atributos disponíveis.
- Abrir o detalhe de um jogo descoberto.
- Adicionar um jogo a `Meus Jogos`.
- Adicionar um jogo à votação do ciclo atual.

## How to get to it (user POV)

Entre em `Todos os jogos`, use o campo de busca e abra `Filtros` para escolher os atributos disponíveis. Abra um cartão para ver os detalhes ou use `Opções de <jogo>` e escolha `Adicionar a Meus Jogos`. Depois entre em `Meus Jogos` para confirmar a biblioteca. O menu de um cartão do ranking também permite guardar o jogo sem sair da votação.

## Driving it with Playwright

Use uma sessão demo independente e seletores de usuário: `getByRole('link', { name: 'Todos os jogos' })`, o campo com placeholder `Buscar jogos, gêneros ou plataformas`, o botão `Filtros`, o menu `Opções de <jogo>` e `Adicionar a Meus Jogos`. Confirme pelo texto `Em Meus Jogos` ou na rota `/seus-jogos`. O contrato de descoberta paginada usa 24 itens por página e preserva source, filtros, sessão e mês na chave.

## Gotchas

- API de descoberta e mídia exige transporte HTTPS/Bearer em ambiente real; o demo não deve chamar IGDB.
- Os menus Radix ficam em portal e precisam ser dirigidos por papel e texto visível.
- Ao repetir a condução, use um checkout novo ou um jogo que ainda não esteja na biblioteca demo.
- Mutações reais obedecem RLS e não aceitam service role no cliente.
- Uma paginação sem `hasMore` não deve disparar outra requisição.
