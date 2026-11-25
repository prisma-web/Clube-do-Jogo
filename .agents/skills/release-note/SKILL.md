---
name: release-note
description: Escreve a nota de novidade (updates/notes/<slug>.json) que todo PR precisa, ou decide pela label sem-novidade. Use ao preparar ou atualizar um PR, ou quando o check release-note falhar.
---

# Nota de novidade

Cada nota em `updates/notes/` vira um passo das Novidades que o membro vê no site e no app. Quando uma tag `vX.Y.Z` é publicada, `scripts/release-notes.mjs assemble` junta as notas **adicionadas** desde o último release publicado, na ordem dos commits, e anexa o `product-update.json` ao release. O site mostra as do release mais recente; o app Android, as da versão instalada. Os dois baixam o arquivo direto do release, sem a API do GitHub.

Editar uma nota já publicada não a mostra de novo. Renomear também não: com o conteúdo igual ou quase igual (`git mv`), o git vê uma renomeação e a nota segue como já anunciada. Reescrever a nota inteira sob outro nome conta como nota nova.

O check `release-note` roda em todo PR. Ele passa quando o PR adiciona pelo menos uma nota nova e válida, ou quando tem a label `sem-novidade`. Editar ou renomear uma nota que já existe não conta como nota nova. Com ou sem a label, o check valida toda nota que o PR toca, pelo `.json` ou pelo `.webp`, inclusive quando o PR apaga ou renomeia a captura. Apagar uma nota inteira, o `.json` e o `.webp`, é permitido. Apagar só o `.json` e deixar o `.webp` falha.

## 1. Nota ou `sem-novidade`

A pergunta é: o membro percebe a mudança usando o site ou o app?

- **Nota**: tela, fluxo, texto, regra de votação ou ranking, tema, notificação, desempenho que se sente, correção de um bug que o membro via.
- **`sem-novidade`**: CI, build, testes, refatoração, docs, skills, migração sem efeito visível, ajuste interno de admin que ninguém mais vê. Coloque a label no PR e pare aqui. O PR que criou este fluxo é um exemplo.

Uma nota por mudança que o membro percebe. Um PR com duas mudanças independentes adiciona duas notas. Duas notas do mesmo commit saem em ordem alfabética do slug.

## 2. Escrever `updates/notes/<slug>.json`

O slug é kebab-case (`ranking-empates`) e nomeia a mudança, não o PR. Formato:

```json
{
  "eyebrow": "RANKING",
  "title": "O ranking entrou na fila de balanceamento",
  "body": "A votação ficou mais direta: escolha entre Jogaria e Não. Jogos com a mesma quantidade de pontos dividem a mesma colocação.",
  "highlights": ["“Não” agora permite informar o motivo.", "Mesma pontuação, mesma posição."],
  "image": { "file": "ranking-empates.webp", "alt": "Página do ranking com dois jogos empatados.", "width": 860, "height": 500, "position": "top" },
  "android": { "body": "Texto que substitui o body só no app Android." }
}
```

- `eyebrow`, `title`, `body` são obrigatórios e não vazios. `eyebrow` é a área do app, em MAIÚSCULAS, curta: `RANKING`, `MEUS JOGOS`, `PROGRESSO E ANOTAÇÕES`.
- `highlights` é opcional: de um a três detalhes concretos, uma frase cada.
- Visual: `image` com a captura real, ou `artwork` (`overview` ou `performance`) quando não há tela para mostrar. Nunca os dois. Sem nenhum, o passo usa `overview`.
- `image.file` é sempre `<slug>.webp`. `width` e `height` são os pixels reais do arquivo. `position` (`top`, `center`, `bottom`) escolhe a parte da captura que fica visível quando o quadro corta.
- `android` só quando o caminho no app é diferente do site (por exemplo, "toque na engrenagem no Perfil" em vez de "toque no avatar do cabeçalho"). Ele substitui `body` e/ou `highlights` no app.
- Qualquer outra chave invalida a nota.

**Tom.** Fale com o membro, em segunda pessoa, em português do Brasil. O `title` é uma frase com personalidade, não o nome da feature: "Todo jogo merece alguns minutos no palco", "Seu app, suas regras", "Segure para conhecer a torcida". O `body` diz o que mudou e onde encontrar, em duas ou três frases, sem jargão técnico, nome de componente ou número de PR: "Pressione e segure uma reação já existente para ver quem reagiu e descobrir qual emoji cada pessoa escolheu." O `alt` descreve o que a captura mostra.

## 3. Capturar a tela

A captura é da tela real em modo demo, nunca um mock:

- Site: suba e dirija a instância com a skill `verify-clube-do-jogo-web` e grave o PNG da tela da mudança.
- App: use a skill `verify-clube-do-jogo-mobile` e capture com o comando `agent-device ... screenshot <caminho>`.

Recorte a região da mudança em paisagem, perto de 860x500, como as capturas antigas. O app desenha a imagem na proporção dela, então uma tela inteira de celular em retrato fica alta demais. Converta para WebP com até 860 px de largura (`-crop x y largura altura` antes de `-resize` recorta) e confira o tamanho real:

```sh
cwebp -q 80 -resize 860 0 captura.png -o updates/notes/<slug>.webp
webpinfo updates/notes/<slug>.webp | grep -E 'Width|Height'
```

O arquivo precisa ter no máximo 300 KB. Copie `Width` e `Height` para `image.width` e `image.height`.

## 4. Validar

Com Node 22.14 ou mais novo (o script importa o parser TypeScript de `packages/domain` sem build e, antes do Node 22.18, se relança com `--experimental-strip-types`), commite a nota e rode:

```sh
node scripts/release-notes.mjs check origin/master HEAD
```

A nota está pronta quando o comando imprime `✓ updates/notes/<slug>.json` e termina com código 0. Cada erro diz o arquivo, o campo e o valor esperado.
