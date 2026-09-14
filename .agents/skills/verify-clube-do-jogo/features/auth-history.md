# Login e histórico

## Sub-features

- Entrar e criar conta com Supabase.
- Receber callback PKCE em `clubedojogo://auth/callback`.
- Restaurar sessão após foreground do app.
- Consultar ciclos anteriores em modo somente leitura.
- Rejeitar links de recuperação expirados sem corromper a sessão.

## How to get to it (user POV)

No web, use o callback permitido pelo ambiente e depois entre em `Ranking`. No dev client Expo, deixe o Metro acessível quando o fluxo precisar carregar o bundle ou interagir com a UI ativa. Para a prova nativa Release, instale o bundle local conforme [docs/mobile-release.md](../../../../docs/mobile-release.md), mantenha o app sem acesso ao Metro e abra o app frio pelo callback `clubedojogo://auth/callback`; registre somente esquema, host, caminho e forma redigida dos parâmetros, nunca o código ou tokens. Depois confirme a sessão e a restauração ao voltar do background. No seletor de ciclo, escolha um mês anterior e confirme que progresso e voto aparecem como históricos e desabilitados. Para um link inválido, confirme a mensagem de expiração e retorne à sessão.

## Driving it with Maestro

```sh
maestro --device emulator-5580 test apps/mobile/.maestro/login.yaml
maestro --device emulator-5580 test apps/mobile/.maestro/history.yaml
maestro --device emulator-5580 test apps/mobile/.maestro/auth-link-recovery.yaml
```

No iOS, preserve seletores de aba como `Jogo do mês(, tab, 1 of 5)?` e `Ranking(, tab, 2 of 5)?`, com `index: 0`. Passe `-e TEST_EMAIL=... -e TEST_PASSWORD=...` somente com fixtures do Supabase local dedicado. Registre o status real da lane no recibo, incluindo `not-run` e o motivo quando ela não for executada.

## Gotchas

- A URL do callback precisa ser `clubedojogo://auth/callback`. Metro alcançável é requisito quando o dev client precisa carregar o bundle; foreground é requisito apenas do fluxo que depende da UI ativa. O bundle Release contém o JavaScript e pode ser aberto frio.
- Testes reais aceitam exclusivamente `http://127.0.0.1:55421` e o projeto `clube-expo-local`; qualquer URL pública é erro.
- Não faça logout global nem reutilize o simulador ou emulador que outra sessão está dirigindo.
- iOS pode inserir `, tab, n of 5` no texto; use a regex documentada.
- O Doctor só passa com o gate estrito de `scripts/mobile-dependency-gate.mjs`; não trate o texto 20/21 ou o código zero isoladamente como aprovação. Neste commit, 21/21 com código 0 não é uma aceitação implementada pelo gate.
