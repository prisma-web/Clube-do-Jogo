# Filtros e agrupamento da biblioteca

## Sub-features

- Filtrar rapidamente por chip: `Todos`, `Comecei`, `Finalizados`, `Não iniciados`, `Favoritos`.
- Refinar por `Filtros`: nos meus consoles, até 12 horas, com nota, agrupar por status.
- Ordenar por atualização, título, duração ou nota, crescente ou decrescente.
- Buscar por texto dentro da própria biblioteca.
- Persistir cada preferência de filtro/ordenação entre sessões.

## How to get to it (user POV)

No web, entre em `Meus Jogos`. Use a fileira de chips para um filtro rápido, o campo de busca para texto livre, o botão `Filtros` para as opções adicionais (consoles, duração, nota, `Agrupar por status`) e `Ordenar` para o modo de ordenação. No Expo, a aba `Meus Jogos` reproduz os mesmos chips, o botão `Filtros` e o seletor de ordenação, usando a mesma lógica compartilhada `selectLibraryGames`.

## Driving it with Playwright

Não há subcomando dedicado; dirija manualmente a partir de `getByRole('link', { name: 'Meus Jogos' })`. Os chips ficam por texto visível (`Todos`, `Comecei`, `Finalizados`, `Não iniciados`, `Favoritos`); abra `Filtros` e alterne os checkboxes `Nos meus consoles`, `Até 12 horas`, `Com nota` e `Agrupar por status`; abra `Ordenar` para o menu Radix em portal. Confirme o efeito pela contagem `<n> jogos` e, quando `Agrupar por status` estiver ativo, pelos cabeçalhos de seção (`Não iniciado`, `Comecei`, `Finalizado`).

## Driving it with Maestro

Nenhum fluxo em `apps/mobile/.maestro/` toca hoje nos controles `Filtros`/`Agrupar por status` da aba `Meus Jogos` (arquivo `apps/mobile/app/(app)/(tabs)/seus-jogos.tsx`); só `club.yaml` passa pela troca de status sem exercitar filtro ou agrupamento. Um novo yaml precisaria abrir essa aba, alternar `Agrupar por status` no `Sheet` de filtros e confirmar as seções por título de status.

## Gotchas

- `selectLibraryGames` (`@clube-do-jogo/domain`) é a lógica compartilhada entre web e Expo; um teste de contrato quebrado ali afeta as duas plataformas ao mesmo tempo.
- As chaves de persistência divergem por plataforma (`library:*` no web via `usePersistentState`, `clube-do-jogo:mobile:library-*` no Expo); não presuma que o estado é compartilhado entre as duas superfícies.
- O menu de ordenação web é um `DropdownMenu.Content` em portal; dirija por papel/texto, nunca por posição de pixel.
- O demo popula a biblioteca em memória; não prova filtros contra volumes reais de dados.
