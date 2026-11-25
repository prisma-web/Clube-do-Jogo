---
name: formal-verify-pending-notes-mobile
description: Verifica com TLA+ que uma anotação privada enviada no app mobile não some do AsyncStorage antes de o servidor aceitá-la. Use ao mudar useNotesPendingQueue ou enqueueDraftWrite (apps/mobile/src/state/discussion-queries.ts), notes-queue.ts, PrivateNotes.tsx, qualquer tela que monte PrivateNotes, ou create/update de notas em packages/data/src/notes.ts.
---

# Verificação formal da fila de anotações pendentes no mobile

A tela de anotações promete: "Anotações escritas sem conexão ficam guardadas neste aparelho e são enviadas automaticamente assim que a conexão voltar ou o app for reaberto." Quem cumpre essa promessa é `useNotesPendingQueue` em `apps/mobile/src/state/discussion-queries.ts`. Cada envio entra numa fila em memória, o `queueRef`. A cada mudança, o hook regrava a fila inteira no AsyncStorage, numa chave por usuário e jogo, a `pendingNotesKey`.

**Propriedade `NoLostNote`.** Depois que um envio chegou ao AsyncStorage, o texto continua lá até o servidor aceitá-lo ou até o usuário descartá-lo num conflito, com **Usar versão do servidor**, **Editar versão do servidor** ou **Aceitar exclusão**.

**Dano quando quebra.** O usuário toca em enviar, vê "enviando…", e a anotação desaparece do aparelho sem nunca chegar ao servidor.

**Propriedade `NoLostRetry`.** Um gatilho de envio (reconexão, foco, **Sincronizar novamente**) que chega com a nota ainda em voo não se perde. Quando esse envio termina com a nota ainda na fila e sem conflito, a nota sai de novo no mesmo passo.

**Dano quando quebra.** A rede volta, mas o envio antigo, iniciado numa rede que sumiu, só falha depois. A nota fica parada em "enviando…" ou em falha até o próximo evento, embora a tela prometa o envio "assim que a conexão voltar".

Os testes em `tests/mobile/notes-queue.test.ts` cobrem as funções puras da fila. Eles não alcançam a ordem dos eventos, que é onde a fila quebra. Telas montam e desmontam, respostas de rede chegam atrasadas, gravações do AsyncStorage ficam pendentes, e o sistema pode matar o app no meio. O modelo em `model/PendingNotes.tla` cobre todas as ordens desses eventos dentro dos limites abaixo.

## Quando usar

Rode a verificação antes de commitar um diff que toque um arquivo do registro de cobertura, no fim deste arquivo. Rode também quando um diff criar ou remover um lugar que monte `PrivateNotes`, porque cada tela montada é uma instância a mais no modelo. O mobile divide o código em `apps/mobile/src`, com estado e componentes, e `apps/mobile/app`, com as telas do Expo Router. Procure sempre nos dois diretórios:

```sh
grep -rn "PrivateNotes\|useNotesPendingQueue" apps/mobile/src apps/mobile/app
```

## Rodar

Rode da raiz do repo:

```sh
.agents/skills/formal-verify-pending-notes-mobile/scripts/check.sh
```

O script precisa de Java 11 ou mais novo (e de `python3` no `--deep`), e de rede na primeira vez. Ele baixa o TLC, o `tla2tools.jar` v1.7.4, confere o sha256 e o guarda em `.cache/` dentro desta skill, que o git ignora. A execução leva uns 40 s e faz oito checagens. Cada uma tem um resultado registrado:

| Checagem | Config | Registrado |
|---|---|---|
| `base` | `model/PendingNotes.cfg` | passa, só sob as suposições de "Escopo e limites" (uma tela de anotações por jogo, saída sem envio aguardando). Não é garantia sobre o app: o F1 viola as duas. |
| `finding-F1-two-screens` | `model/TwoScreens.cfg` | viola `NoLostNote`, achado F1 |
| `finding-F1-remount-in-flight` | `model/RemountInFlight.cfg` | viola `NoLostNote`, achado F1 |
| `mutant-drop-on-conflict` | base com o conflito descartando a entrada | viola |
| `mutant-no-load-wait` | base com a carga sem esperar `draftWrites.get(key)` | viola |
| `mutant-unserialized-writes` | base com as gravações chegando fora de ordem | viola |
| `mutant-use-local-drops` | base com **Usar minha versão** tirando a entrada da fila e deixando só o envio em voo | viola |
| `mutant-no-rerun` | base com o código anterior a `createFlushGate`: o gatilho que encontra um envio em voo é ignorado | viola `NoLostRetry` |

As seis primeiras linhas violam `NoLostNote`. Todas as configs checam os dois invariantes.

Os mutantes provam que a propriedade ainda consegue falhar. Se um mutante passar, o modelo ficou fraco demais, e um `base` verde não prova nada.

| Saída | Significado |
|---|---|
| `0` | Todas as checagens bateram com o registro. |
| `1` | Uma checagem diferiu, na linha `DIFERE`. A saída completa do TLC fica em `.cache/<checagem>.out`. |
| `2` | O TLC bateu com o registro, mas um arquivo coberto mudou desde o sync commit. |
| `64` | Argumento inválido. |

Java ausente ou sync commit inexistente também saem com `1`. Antes de tratar um `1` como divergência, confira se a saída tem a linha `DIFERE`. O drift só compara texto: `--reviewed` sem ler o diff e ajustar o modelo não prova nada.

Na saída `2`, leia `git diff <sync> -- <arquivos>`. Se o diff tocar algo que o mapa abaixo descreve, ajuste o modelo primeiro. Depois rode de novo com `--reviewed`.

## `--deep`

`--deep` roda as oito checagens com `MaxRevs = 3` e `VIEW ReducedView`, e acrescenta a checagem `view-sound`. Rode antes de mover o sync commit. Num Ryzen de 32 threads, em `11b67b4`, leva uns 6 min: o `base` profundo tem 26 milhões de estados distintos e leva 266 s. Sem o `VIEW`, o mesmo `base` passou de 273 milhões em 30 min e não terminou. Os oito resultados registrados valem também no `--deep`.

O `VIEW` (`ReducedView`, no fim de `model/PendingNotes.tla`) faz o TLC contar como um estado só dois estados que diferem apenas em dados que nenhuma ação lê de novo e que nenhum invariante olha. O `Next` não muda. A tabela diz o que o `VIEW` esquece e por que isso não muda nenhum futuro.

| Esquece | Por quê |
|---|---|
| `mem`, `conflict`, `rerun` e `trigd` de um hook `Inert`: morto, ou desmontado sem envio em voo | Só `Apply` lê `mem`, e quem chama `Apply` são as respostas e as ações da tela montada. Um hook inerte não tem nenhuma das duas. |
| `loaded` fora de `mounted`, e `loadWait` depois de `LoadRead` | `Touchable`, `LoadRead` e `FlushAll` só leem com o hook montado. `loadWait` só conta até `LoadRead`. |
| `conflict[l][n]` de hook desmontado sem envio de `n` em voo | Só a resposta e o `Settle` de `n` leem esse valor, e nenhum envio novo começa num hook desmontado. |
| a `entry` de um envio que o servidor já respondeu (`ok`, `changed`, `deleted`), e esse envio inteiro num hook morto | `Respond*` só leem a fase, e um hook morto não responde. O envio `sent` de um hook morto fica, porque `Reach` ainda grava no servidor. |
| o `exp` de uma entrada `update` que nunca mais pode ser igual a `server[n]`, trocado por `Stale` | Só `Reach` lê `exp`, e só o compara com `server[n]`. `Futures(n)` cobre todo valor que `server[n]` ainda pode assumir: o atual, `Foreign` enquanto houver edição externa, as revs ainda não criadas e a rev de toda entrada viva de `n`. Fora disso, `Reach` rejeita com o valor original e com `Stale`. É aqui que mora a maior parte do ganho, porque `ResolveUseLocal` escolhe `exp` livre. |
| `serverHad` e `discarded`, a não ser em `durable \ Safe` e nas revs ainda vivas | `NoLostNote` só depende de `durable \ Safe` e de `stored`. Uma rev fora de `stored`, de `chain` e da `mem` de um hook ativo nunca mais entra em `durable`. |

`view-sound` testa essa tabela. Ele explora o `base` rápido duas vezes, uma só com `SYMMETRY` e outra com `SYMMETRY` e `VIEW`. Nas duas, `model/ViewSound.tla` imprime a visão de cada estado alcançado, e `scripts/orbits.py` a reduz à órbita pela troca de tempos de vida. Os dois conjuntos têm de ser iguais. Se o `VIEW` juntasse dois estados com futuros diferentes, a exploração com `VIEW` deixaria de alcançar alguma visão. Em `11b67b4` são 634.917 órbitas nas duas.

Uma variável nova no modelo precisa entrar em `ReducedView`, senão o `VIEW` a ignora. Uma ação nova que leia algo da tabela invalida a linha correspondente. `view-sound` pega a maior parte desses erros, mas só no `base` rápido.

## Ler um resultado

Leia toda saída do TLC com a skill `/statechart` do pstack. Ela conta uma violação como o caminho mais curto até ela, em palavras. Quando a checagem passa, ela desenha como o sistema se move entre estados. Entregue a ela `model/PendingNotes.tla`, a config da checagem e o `.out`.

Para separar um bug real de um erro de modelagem, percorra o trace passo a passo. Para cada ação, ache o código no mapa abaixo.

- Todo passo pode acontecer no app. É um bug real. Registre-o como achado, com o trace nas palavras do código, como o F1. Não enfraqueça `NoLostNote`. Não acrescente ao modelo uma guarda que o código não tem. Não mude código de produto sem alguém pedir.
- Algum passo não pode acontecer no app, porque a UI bloqueia, o código ordena diferente ou o servidor responde diferente. É um erro de modelagem. Corrija a ação no modelo, com um comentário que aponte o código que justifica a correção. Rode de novo, mutantes incluídos.

Um `DIFERE ... veio error` é um erro de parse ou de `TypeOK` no modelo. Ele não diz nada sobre o app.

## Achado F1: duas instâncias do hook apagam a fila uma da outra

O F1 está aberto em `c3117bb` e continua aberto em `11b67b4`. As checagens `finding-F1-*` falham de propósito enquanto o código não mudar.

Cada `PrivateNotes` montado tem o próprio `useNotesPendingQueue`, com o próprio `queueRef`. Todas as instâncias gravam a fila inteira na mesma chave do AsyncStorage. Uma instância que não viu um envio feito na outra regrava uma cópia velha por cima. O `flushOne` de uma tela já desmontada também grava, porque a closure ainda guarda `queueRef` e `applyQueue`.

O caminho 1 tem duas telas montadas. Ele vem de `TwoScreens.cfg`, tem 11 estados e não fecha o app.

1. Na aba Jogo do mês, na sub-aba Anotações, sem conexão, o usuário envia a anotação A. `submitCreate` grava `[A]`, e `flushOne(A)` fica aguardando a rede.
2. O usuário toca no cartaz do jogo. `router.push` abre `jogos/[id]` por cima da aba, que continua montada. O novo `PrivateNotes` espera a gravação de `[A]` e carrega `[A]`.
3. Em `jogos/[id]`, o usuário envia B. A fila vai para `[A, B]`, que chega ao AsyncStorage.
4. O `flushOne(A)` da aba falha. `applyQueue(markAttempt(queueRef.current, A))` grava a cópia da aba, que é `[A]`.
5. O AsyncStorage passa a conter só `[A]`. B existe apenas na memória de `jogos/[id]`, marcada como "enviando…".

Se o app for fechado neste ponto, B some. Sem fechar o app, o `flushOne(B)` de `jogos/[id]` ainda regrava `[A, B]` quando falhar, então a perda nesse ponto é uma janela. Ela fica permanente quando a resposta de A, na aba, chega depois da de B e `jogos/[id]` desmonta antes de outro flush: a aba grava a cópia dela sem B, e nenhuma instância montada envia B. A revisão reproduziu esse caso no modelo, sem crash, com um invariante extra numa cópia de rascunho.

O caminho 2 tem uma tela só. Ele vem de `RemountInFlight.cfg` e tem 12 estados. O usuário envia A, sai da tela antes de a resposta chegar, reabre a tela e envia B. A resposta atrasada de A roda no hook desmontado e grava `[A]` por cima de `[A, B]`.

Uma correção precisa de uma única fila por chave, compartilhada pelas instâncias, ou de um ler-modificar-gravar dentro da cadeia de `enqueueDraftWrite`. Depois de uma correção, mude o modelo para dizer o que o código novo faz. Se `TwoScreens.cfg` e `RemountInFlight.cfg` passarem, troque o resultado registrado delas para "passa" no script e na tabela acima. Marque o F1 como corrigido, com o commit.

## Mapa do modelo para o código

Uma ação do modelo é um passo indivisível, o trecho síncrono de JS entre dois `await`.

| Modelo | Código |
|---|---|
| `stored` | O valor do AsyncStorage em `pendingNotesKey(userId, gameId)`. |
| `chain`, `Land` | `draftWrites` e `enqueueDraftWrite`. As gravações da chave saem em ordem, uma por vez. |
| `mem` | O `queueRef.current` de uma instância do hook. |
| `Apply` | `applyQueue`. Troca o `queueRef` e enfileira `setItem(serializeQueue)` ou `removeItem`. |
| `Mount`, `LoadRead` | O efeito de carga. Espera `draftWrites.get(key)`, depois chama `getItem` e `parseQueue`. |
| `Unmount` | Sair da tela ou trocar a sub-aba. Os listeners saem, e o `flushOne` pendente continua. |
| `Touchable` | Só a tela do topo recebe toque, e `busy` bloqueia o composer até a fila carregar. |
| `SubmitCreate` | `submit()` chama `submitCreate`, que chama `flushOne` até o `await`. |
| `SubmitUpdate` | `beginEdit` e depois `submit()` chamam `submitUpdate`. `onLongPress` ignora nota pendente. |
| `ResolveUseRemote` | `resolveUseRemote`: os botões **Usar versão do servidor** e **Editar versão do servidor**, que só aparecem em conflito `changed`. |
| `ResolveUseLocal` | `resolveUseLocal`: **Usar minha versão** (`changed`, vira `update` com `expectedUpdatedAt` = `remote.updatedAt`; o modelo deixa `exp` livre) e **Restaurar minha versão** (`deleted`, vira `create` com o mesmo id). Mesmo id, mesmo texto, depois `flushOne`. |
| `ResolveAcceptDeletion` | `resolveAcceptDeletion`: **Aceitar exclusão**, só em conflito `deleted`. Descarte do usuário, como `ResolveUseRemote`. |
| `ResolveKeepAsNew` | O botão **Manter como nova anotação**. Mesmo texto, id novo, `create`. |
| `FlushAll` | O efeito depois da carga e os listeners de `onlineManager` e `focusManager`, em toda tela montada. Também `retryAll`, o botão **Sincronizar novamente**. Uma nota com envio em voo entra em `rerun`. |
| `Send` | O prefixo síncrono de `flushOne`. Pula a nota em conflito ou fora da fila. Se ela já tem envio em voo, `flushGate.begin` devolve `false`. |
| `rerun`, `RecordTriggers`, `TriggerOn` | `createFlushGate` em `notes-queue.ts`: os gatilhos que chegaram com o envio em voo. `trigd` e `missed` são variáveis fantasmas para `NoLostRetry`. |
| `Settle` | O `finally` de `flushOne`: `flushGate.finish` e, se havia gatilho, `flushOne` de novo, no mesmo passo da resposta. |
| `Reach` | `createNotesClient` em `packages/data/src/notes.ts`. `create` faz insert, e na falha `matchesSavedNote` conta como sucesso. `update` só grava se `updated_at` for igual a `expectedUpdatedAt`. |
| `RespondOk` | O sucesso, `dequeueNote(queueRef.current, noteId)`. A releitura da lista (`refetchNotesAfterWrite`) fica fora do modelo. |
| `RespondConflict` | `NotesConflictError`. Chama `markConflict` e `markAttempt`, e a entrada fica. |
| `RespondFail` | Qualquer outro erro, inclusive a resposta perdida depois de o servidor gravar. Chama `markAttempt`. |
| `Crash` | O sistema mata o app. A memória e as gravações ainda não aplicadas somem. |
| `ForeignEdit`, `ForeignDelete` | Outro aparelho do mesmo usuário edita ou apaga a linha. |
| `Variant` | Existe só para os mutantes. Fica em `"none"` nas configs commitadas. |

## Atualizar o modelo

Siga estes passos quando um diff mudar de propósito algo do mapa.

1. Mude a ação correspondente para dizer o que o código novo faz, com um comentário que aponte o código. Um passo novo entre dois `await` vira uma ação nova.
2. Rode `check.sh --reviewed`. Os cinco mutantes precisam continuar violando. Se a mudança tornar um mutante impossível, troque-o por outro que quebre o código novo, e veja o novo mutante falhar.
3. Se o `base` passar a violar, trate a violação como bug real ou erro de modelagem, como em "Ler um resultado".
4. Rode `check.sh --deep --reviewed`. Se a mudança criou uma variável ou uma leitura nova, revise antes `ReducedView` e a tabela de `--deep`.
5. Confirme que o modelo descreve o código no commit novo. Só então troque o `sync` do registro de cobertura por esse commit e acrescente os arquivos novos.

## Escopo e limites

As configs cobrem uma chave de usuário e jogo, com estes limites:

- dois tempos de vida do hook, `Lifetimes = {a, b}`, que bastam para uma remontagem ou para um reinício depois de crash;
- até 3 ids de nota;
- 2 envios no modo rápido e 3 no `--deep`;
- até 3 gravações pendentes ao mesmo tempo;
- 1 crash;
- 1 edição ou remoção feita por outro aparelho.

Falhas de rede e respostas perdidas não têm limite. O `base` supõe uma tela de anotações por jogo de cada vez, e que o usuário só sai dela sem envio aguardando. O F1 mostra que o app real viola as duas suposições.

O modelo deixa de fora:

- A passagem do rascunho para a fila. `submit()` chama `submitCreate`, que grava na chave da fila, e depois `clearDraft`, que remove a chave do rascunho. As duas chaves têm cadeias independentes. Se a cadeia da fila estiver ocupada, a remoção do rascunho pode chegar antes da gravação da fila, e um crash nessa janela perde o texto. Esta análise vem da leitura do código e não foi verificada. A janela dura uma ida e volta ao AsyncStorage.
- A recarga do efeito de carga com o hook montado. O efeito (`discussion-queries.ts:696-720`) depende de `context`, um `useMemo` sobre o `state` do provider (`app-provider.tsx:360`). Qualquer `setState` do provider, como `refresh` ou hidratação de sessão, reroda `getItem` e sobrescreve `queueRef` com o composer ainda habilitado. Um envio feito durante essa ida e volta ao AsyncStorage some da memória. A revisão acrescentou uma ação `Reload` numa cópia de rascunho e o `base` passou a violar `NoLostNote`. É um candidato a achado, ainda não modelado no commit.
- A troca de sessão ou de usuário, com `sessionEpoch` e `isSessionCurrent`. O modelo fixa um usuário logado.
- `parseQueue` com dado corrompido, `generation` e `lastError`. Os testes unitários cobrem esses pontos, e o modelo os abstrai.
- O que a lista mostra, em `mergePendingIntoList`, a ordem e as duplicatas no servidor, e o apagar nota, em `useDeleteNote`. Também a releitura depois de um envio aceito (`notes-refresh.ts`), que os testes de `tests/mobile/notes-sync-reconnect.test.ts` cobrem com o `QueryClient` real.
- O transporte. Um envio pendurado para sempre (o OkHttp do Android sem timeout nem ping, corrigido por `apps/mobile/plugins/withNetworkTimeouts.js`) aparece no modelo como um `Reach`/`Respond*` que demora. `NoLostRetry` só garante que, quando ele termina, um gatilho recebido no meio não se perde.
- O cache offline de notas já sincronizadas (`notes-offline-cache.ts`, `use-notes-offline-cache.ts`). É outra chave do AsyncStorage, só com dados do servidor, e nunca alimenta a fila.
- O AsyncStorage nativo além de uma regra. Ele aplica as gravações na ordem em que o JS as emite.

## Registro de cobertura

`check.sh` lê o bloco abaixo. A linha `sync` é o commit em que o modelo foi confirmado contra o código. As outras linhas listam os arquivos cobertos e o que cada um contribui.

```coverage
sync 11b67b4500e3498d71d867e34de45ab14d5093fc
apps/mobile/src/state/discussion-queries.ts useNotesPendingQueue, enqueueDraftWrite, draftWrites, pendingNotesKey, flushOne com flushGate
apps/mobile/src/state/notes-queue.ts enqueue, dequeue, markAttempt, markConflict, clearConflict, serializeQueue, parseQueue, createFlushGate
apps/mobile/src/features/notes/PrivateNotes.tsx PrivateNotes key, NotesEditor busy, submit, onLongPress e botão de menu, ConflictCard, Sincronizar novamente
apps/mobile/app/(app)/(tabs)/jogo-do-mes.tsx PrivateNotes na sub-aba Anotações, cartaz que abre jogos/[id]
apps/mobile/app/(app)/jogos/[id].tsx PrivateNotes em "Minhas anotações"
apps/mobile/app/(app)/_layout.tsx Stack em que jogos/[id] empilha sobre (tabs), que continua montado
apps/mobile/src/state/app-provider.tsx context useMemo que reroda o efeito de carga (fora do modelo, ver Escopo)
packages/data/src/notes.ts createNotesClient create com matchesSavedNote, update com expectedUpdatedAt
```
