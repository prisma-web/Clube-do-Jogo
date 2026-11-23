# Feature maps (web)

Caminhos que um membro reconhece na interface web e a condução Playwright correspondente. Cada mapa tem `Sub-features`, `How to get to it (user POV)`, `Driving it with Playwright` e `Gotchas`. O lado Expo/Maestro vive em `verify-clube-do-jogo-mobile`.

Toda condução parte de um run do helper (`launch` → `doctor`) em modo demo, onde o `demo-user` é administrador. Só `club-ranking` tem subcomando (`drive ranking`); as outras são dirigidas à mão, com capturas gravadas no `evidenceDir` do run. Declare commit, run e qualquer `not-run` com motivo.

| Feature | Entrada web | Fluxo principal |
| --- | --- | --- |
| [Ranking e voto](./club-ranking.md) | `/jogo-do-mes` → `Ranking` | Registrar preferência e motivo |
| [Descoberta e biblioteca](./discovery-library.md) | `Todos os jogos` → `Meus Jogos` | Buscar, filtrar e guardar |
| [Perfil e mídia](./profile-media.md) | `Perfil` → detalhe do jogo | Ver identidade e mídia |
| [Login e histórico](./auth-history.md) | tela de login → `/auth/callback` → `Ranking` | Entrar e consultar ciclo |
| [Confirmação de mudança de progresso](./progress-confirmation.md) | `Meus Jogos` → `Opções de <jogo>` | Trocar status com confirmação de efeito |
| [Filtros e agrupamento da biblioteca](./library-filters.md) | `Meus Jogos` → `Filtros`/`Ordenar` | Filtrar, ordenar e agrupar por status |
| [Anotações otimistas](./notes-pending-queue.md) | detalhe do jogo → chat de anotações | Nota aparece antes da confirmação, sem duplicar |
| [Administração do jogo do clube por card](./club-admin-per-card.md) | `Ranking`/detalhe → coroa | Definir, desfazer e refazer o ciclo |
| [Diálogo de novidades](./product-update-dialog.md) | `?novidades=atual` | Ver passos da versão atual |
