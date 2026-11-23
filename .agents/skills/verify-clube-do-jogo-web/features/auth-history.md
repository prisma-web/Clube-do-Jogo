# Login e histórico

O membro entra com e-mail e senha e consulta ciclos anteriores em modo somente leitura.

## Sub-features

- Entrar e criar conta com Supabase.
- Concluir o retorno de autenticação em `/auth/callback`.
- Consultar ciclos anteriores em modo somente leitura.

## How to get to it (user POV)

Sem sessão, a tela inicial mostra `Seu e-mail`, `Sua senha` e o botão `Entrar` (ou `Criar conta`). Depois do login, entre em `Ranking`, escolha um mês anterior no seletor de ciclo e confirme que progresso e voto aparecem como históricos e desabilitados.

## Driving it with Playwright

Preconditions: login real exige uma instância fora do helper, apontada para o Supabase local dedicado (`http://127.0.0.1:55421`, projeto `clube-expo-local`) com conta de fixture. O helper só sobe demo, sem tela de login.

- **Login.** Preencha `getByPlaceholder('Seu e-mail')` e `getByPlaceholder('Sua senha')`, clique `getByRole('button', { name: 'Entrar' })`. O nome da fixture aparece no menu da conta.
- **Histórico (demo serve).** Em `Ranking`, troque o mês no seletor de ciclo. Os botões de voto ficam desabilitados.

## Gotchas

- Em um run do helper, login é `not-run`: o demo já entra como `demo-user`.
- Testes reais aceitam só o Supabase local dedicado; qualquer URL pública é erro. Nunca grave código, tokens ou cookies no recibo.
- Não faça logout global.
