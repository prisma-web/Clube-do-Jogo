# Migração mobile

O Next continua sendo a aplicação web e a camada de APIs. O Expo em `apps/mobile` atende Android e iOS. As regras vivem em `packages/domain`, e as operações de dados em `packages/data`; ambos são usados pela web e pelo mobile.

## Executar o Expo

Instale as dependências na raiz com `npm ci`. Copie `apps/mobile/.env.example` para `apps/mobile/.env.local` e informe a URL/chave pública do Supabase e a origem HTTPS da API Next. Sem essas variáveis, o botão de demonstração permite explorar o aplicativo sem uma conta.

```sh
npm run start --workspace @clube-do-jogo/mobile
npm run android --workspace @clube-do-jogo/mobile
# Em um Mac com Xcode:
npm run ios --workspace @clube-do-jogo/mobile
```

Os comandos Android/iOS geram os projetos nativos pelo Expo. `android`, `ios`, `.expo` e `dist` são gerados e não são versionados. O lockfile único fica na raiz. O esquema de callback é `clubedojogo://auth/callback`; a URL precisa estar permitida no projeto Supabase usado pelo ambiente.

O identificador local é `com.clubedojogo.mobile.dev`. Preview e produção exigem `EXPO_APPLICATION_ID` explícito. Os builds são locais, sem EAS. A validação usa AVDs Android e simuladores iOS no `macbook-2` com SimSlim no máximo.

O Expo usa React 19.2.3, conforme o SDK 57, e a web mantém React 19.2.4. A resolução por autolinking mantém somente a cópia do mobile em cada bundle nativo. O Expo Doctor reporta essas duas instalações no disco (20/21 checks), embora a exportação inclua somente uma cópia de React por bundle; o aviso permanece visível. Esse uso segue o [autolinking do Expo](https://docs.expo.dev/modules/autolinking/#working-around-duplicates). `expo-router` também é uma dependência de desenvolvimento da raiz porque a geração de rotas tipadas do CLI precisa resolver esse pacote a partir do CLI instalado na raiz.

## Destino da prova de conceito

| Arquivo | Destino |
| --- | --- |
| src/mobile/main.tsx | Removido. O bootstrap nativo fica em apps/mobile/app/_layout.tsx. |
| src/mobile/routes.ts | Removido. As rotas são arquivos do Expo Router em apps/mobile/app. |
| src/mobile/navigation.tsx | Removido. A navegação nativa usa o Expo Router. |
| src/mobile/image.tsx | Removido. O Expo usa expo-image nas telas nativas. |
| src/mobile/mobile.css | Removido. Tokens e StyleSheet nativos ficam em apps/mobile/src/theme. |
| src/lib/navigation.tsx | Removido. Os consumidores web voltaram a importar next/link e next/navigation. |
| src/components/platform-image.tsx | Removido. O único consumidor voltou a importar next/image. |
| src/lib/mobile-cors.ts | Removido. A camada era exclusiva da casca Capacitor e não participa do fetch nativo do Expo. |
| src/proxy.ts | Removido. O Next volta ao fluxo padrão de APIs; autenticação Bearer permanece em src/lib/supabase/bearer.ts. |

O adaptador web de apiFetch mantém o fetch same-origin. O transporte nativo em `apps/mobile/src/platform/api.ts` usa a sessão por Bearer nas rotas `/api` da origem configurada. `src/lib/supabase/bearer.ts` autentica essas chamadas; o servidor valida o usuário e o banco continua aplicando RLS.

## Domínio compartilhado

@clube-do-jogo/domain exporta os tipos existentes, ranking, transições de progresso, datas, conversões de nota e o demo. O subpath @clube-do-jogo/domain/demo expõe demoProfiles, demoGames, demoRanking, demoProgress, demoComments e demoMonths. demoRanking recebe a fórmula como argumento opcional e nunca lê variáveis de ambiente.

src/lib/types.ts, src/lib/ranking.ts, src/lib/progress.ts, src/lib/utils.ts e src/lib/demo-data.ts permanecem como fachadas de compatibilidade para a web. ACTIVE_RANKING_FORMULA só existe na fachada web e é injetada no demo e nos cálculos dos consumidores.

## Verificação

npm run test:domain executa as regras de empate, fórmula legacy, mês seguinte, transições de progresso, virada de ano e conversões de nota. npm run test:web executa o smoke test Playwright em modo demo, sem credenciais ou escritas no Supabase.

`npm run typecheck --workspace @clube-do-jogo/mobile` verifica o mobile; `npm run export --workspace @clube-do-jogo/mobile` gera os bundles Android/iOS. Os fluxos Maestro em `apps/mobile/.maestro` exercitam login, progresso e voto com o aplicativo de desenvolvimento instalado e o ambiente local preparado. As credenciais são passadas por `-e TEST_EMAIL=... -e TEST_PASSWORD=...`.

`tests/data/local-contracts.test.ts` exige opt-in e recusa URLs fora do Supabase local dedicado em `127.0.0.1:55421`. Ele valida sessão, voto, progresso, permissões por conta e privacidade de notas; sem configuração, informa os testes ignorados. Não deve ser apontado para produção.

## Estado da implementação

O aplicativo inclui sessão, jogo do mês, ranking, votos, avaliações, descoberta, biblioteca, perfis, mídia, conversas, anotações privadas, administração, temas, recompensas e integração de push. Os testes em builds de desenvolvimento não encerram a verificação de paridade e desempenho em release nos AVDs e simuladores iOS dedicados. Aparelhos físicos e EAS estão fora do escopo atual. A configuração de builds e reversão locais está em [mobile-release.md](./mobile-release.md).

## Reuso e paridade

Execute `npm run mobile:reuse` para obter os imports e reexports diretos dos pacotes compartilhados. O inventário inclui tipos e conta uma fachada web uma vez; não mede percentual de UI compartilhada nem detecta duplicação semântica. No estado atual, `domain` tem 10 arquivos consumidores diretos na web e 39 no mobile; `data` tem 1 fachada web e 11 consumidores nativos.

A web e o mobile usam a mesma ordenação de ranking, transição de progresso, conversão de notas, datas, registro de temas e modelo de dados. A fachada web encaminha cinco operações de leitura ao `DataClient` usado pelo mobile. Outras mutações e efeitos da web continuam nos consumidores existentes. Os componentes DOM, navegação Next, CSS e efeitos de áudio web não são componentes React Native reutilizáveis; o mobile preserva seus próprios adaptadores.

| Área | Web | Mobile e limite de verificação |
| --- | --- | --- |
| Sessão e links | Cookie, callback web e APIs Next. | Sessão persistida e Bearer; callback válido e leitores de tela ainda exigem evidência nativa. |
| Clube e ranking | Regras compartilhadas e snapshots existentes. | Votos, histórico e progresso implementados; matriz completa e performance pendentes. |
| Descoberta e biblioteca | APIs IGDB existentes. | Lista, filtros e avaliação; ambiente local sem IGDB não comprova busca externa. |
| Perfil e mídia | Galeria, recorte e preferências existentes. | Perfil, galeria, trailers e recorte; desempenho e acessibilidade pendentes. |
| Conversas e notas | Migração preserva notas antigas locais. | Persistência remota e rascunhos privados por conta; fluxos centrais testados em desenvolvimento. |
| Administração | Visibilidade por papel e RPCs existentes. | Papéis, catálogo e ciclos; avanço, undo e preservação de dados testados localmente. |
| Temas e recompensas | Paletas e assets existentes. | Seis temas, cenas, movimento reduzido e áudio opcional; revisão visual final e performance pendentes. |
| Notificações | Web Push existente. | Instalações e fila durável; entrega APNs/FCM ainda não comprovada. |

O workflow `workspaces.yml` executa contratos, build e smoke web, exportação mobile e Expo Doctor. Ele não recebe credenciais de produção. Os testes locais que exigem Supabase autenticado continuam opt-in; os logs identificam as omissões. O aviso de versões React distintas no Doctor permanece visível e impede tratar essa etapa como aprovada.

## Simulador iOS

Use o UDID dedicado e aplique a redução máxima do SimSlim antes de testar. Confira `simslim status` e `verify` no Mac que hospeda o simulador. Uma exceção precisa corresponder ao recurso necessário para o cenário.

Ao construir diretamente com `xcodebuild`, preserve a assinatura local para o simulador. O build testado com `CODE_SIGNING_ALLOWED=NO` fez a leitura de Keychain do Expo Notifications falhar com `-34018`. Recompilar com `CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-` corrigiu essa falha, mantendo o SimSlim com todas as categorias reduzidas. Isso não configura assinatura para distribuição.

## Assets dos temas

`node scripts/generate-mobile-audio.mjs` gera os WAVs locais a partir das frequências e envelopes usados na web. `node scripts/migrate-native-theme.mjs --check` identifica consumidores que ainda dependem de cores estáticas; sem `--check`, aplica a conversão para os hooks de paleta. Os arquivos de imagem continuam compartilhados com `public/themes`.

O áudio é opt-in. Somente o tema Fogueira Cósmica usa a trilha e os sinais. Preferências são locais e separadas por conta; a lista de temas desbloqueados vem das recompensas confirmadas pelo servidor.
