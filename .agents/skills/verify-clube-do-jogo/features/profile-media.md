# Perfil e mídia

## Sub-features

- Abrir o próprio perfil e conferir nome, avatar e bio.
- Editar campos permitidos do perfil sem perder os demais.
- Consultar plataformas associadas ao usuário.
- Abrir galeria, trailer e personagens de um jogo.
- Exibir o crop do avatar com a mesma matemática entre web e Expo.

## How to get to it (user POV)

Abra `Perfil`, entre em editar, altere o nome ou a URL de avatar e salve. Volte ao perfil e confirme a atualização. Em `Todos os jogos`, abra um cartão, depois procure a galeria, o trailer e os personagens no detalhe. A imagem de avatar aceita URL de imagem IGDB ou outro URL já suportado pelo produto; esta superfície não cria um fluxo de upload/storage.

## Driving it with Playwright

Navegue por `getByRole('link', { name: 'Perfil' })`, abra a ação de edição e confirme o estado salvo por texto visível. Para mídia, use `getByRole('link', { name: /Capa de/ })` e verifique os blocos de galeria, trailer e personagens quando a resposta da API estiver disponível. Em ambiente demo, marque itens ausentes como `not-run` em vez de inventar conteúdo remoto.

## Gotchas

- Atualização de perfil deve preservar bio, preferências e outros campos não editados.
- O cliente injeta o transporte API e não deve inventar upload para Storage.
- Dados reais dependem de Bearer, RLS e APIs de descoberta/mídia permitidas.
- O crop do avatar é contrato compartilhado; qualquer mudança precisa ser conferida na web e no Expo.
- Não encerre a sessão global para testar refresh de perfil.
