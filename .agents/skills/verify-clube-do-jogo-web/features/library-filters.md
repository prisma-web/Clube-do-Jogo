# Filtros e agrupamento da biblioteca

O membro filtra, busca, ordena e agrupa os jogos de `Meus Jogos`, e as escolhas persistem.

## Sub-features

- Filtrar rapidamente por chip: `Todos`, `Comecei`, `Finalizados`, `Não iniciados`, `Favoritos`.
- Refinar por `Filtros`: nos meus consoles, até 12 horas, com nota, agrupar por status.
- Ordenar por atualização, título, duração ou nota, crescente ou decrescente.
- Buscar por texto dentro da própria biblioteca.
- Persistir cada preferência de filtro/ordenação entre sessões.

## How to get to it (user POV)

Entre em `Meus Jogos`. Use os chips para um filtro rápido, o campo de busca para texto livre, `Filtros` para consoles, duração, nota e `Agrupar por status`, e `Ordenar` para a ordenação.

## Driving it with Playwright

Preconditions: run demo saudável pelo `doctor`.

- **Chip.** `getByRole('link', { name: 'Meus Jogos' })`, depois clique o chip por texto (`Comecei`). A contagem `<n> jogos` muda.
- **Agrupar.** Abra `Filtros` e marque `Agrupar por status`. Aparecem os cabeçalhos `Não iniciado`, `Comecei`, `Finalizado`.
- **Ordenar.** Abra `Ordenar` (menu Radix em portal) e escolha um modo. A ordem dos cartões muda.
- **Persistência.** Recarregue a página. Chip, filtros e ordenação voltam como estavam.

## Gotchas

- A lógica é `selectLibraryGames` (`@clube-do-jogo/domain`), compartilhada com o Expo; um teste de contrato quebrado ali afeta as duas plataformas.
- A persistência web usa chaves `library:*` no `localStorage` via `usePersistentState`.
- O menu de ordenação é um `DropdownMenu.Content` em portal; dirija por papel e texto, nunca por posição.
- O demo popula a biblioteca em memória; não prova filtros contra volumes reais.
