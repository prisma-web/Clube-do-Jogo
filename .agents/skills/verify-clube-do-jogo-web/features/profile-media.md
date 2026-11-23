# Perfil e mídia

O membro edita o próprio perfil e consulta galeria, trailer e personagens de um jogo.

## Sub-features

- Abrir o próprio perfil e conferir nome, avatar e bio.
- Editar campos permitidos do perfil sem perder os demais.
- Consultar plataformas associadas ao usuário.
- Abrir galeria, trailer e personagens de um jogo.

## How to get to it (user POV)

Abra `Perfil`, entre em editar, altere o nome ou a URL de avatar e salve. Volte ao perfil e confirme a atualização. Em `Todos os jogos`, abra um cartão e procure a galeria, o trailer e os personagens no detalhe. O avatar aceita URL de imagem IGDB ou outro URL já suportado; não há fluxo de upload.

## Driving it with Playwright

Preconditions: run demo saudável pelo `doctor`.

- **Perfil.** `getByRole('link', { name: 'Perfil' })`, abra a ação de edição, altere o nome e salve. O nome novo aparece no perfil e a bio continua igual.
- **Mídia.** No detalhe de um jogo, verifique os blocos de galeria, trailer e personagens quando a API responder.

## Gotchas

- Em demo, mídia remota pode faltar; marque o item como `not-run` em vez de inventar conteúdo.
- Atualização de perfil deve preservar bio, preferências e outros campos não editados.
- Dados reais dependem de Bearer, RLS e das APIs de descoberta/mídia permitidas.
