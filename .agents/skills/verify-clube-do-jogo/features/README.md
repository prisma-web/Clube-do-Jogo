# Feature maps

Estes mapas descrevem caminhos que um membro consegue reconhecer na interface e a condução correspondente. Cada mapa separa subfeatures, caminho do ponto de vista do usuário, harness e armadilhas conhecidas.

| Feature | Web | Mobile | Fluxo principal |
| --- | --- | --- | --- |
| [Ranking e voto](./club-ranking.md) | `/jogo-do-mes` → `Ranking` | `club.yaml` | Registrar preferência e motivo |
| [Descoberta e biblioteca](./discovery-library.md) | `Todos os jogos` → `Meus Jogos` | `club.yaml` | Buscar, filtrar e guardar |
| [Perfil e mídia](./profile-media.md) | `Perfil` → detalhe do jogo | `club.yaml` | Ver identidade e mídia |
| [Login e histórico](./auth-history.md) | `/auth/callback` → `Ranking` | `login.yaml`, `history.yaml`, `auth-link-recovery.yaml` | Entrar e consultar ciclo |
| [Confirmação de mudança de progresso](./progress-confirmation.md) | `Meus Jogos` → `Opções de <jogo>` | `club.yaml` | Trocar status com confirmação de efeito |
| [Filtros e agrupamento da biblioteca](./library-filters.md) | `Meus Jogos` → `Filtros`/`Ordenar` | sem cobertura Maestro hoje | Filtrar, ordenar e agrupar por status |
| [Fila de anotações pendentes](./notes-pending-queue.md) | detalhe do jogo → chat de anotações | `notes-draft.yaml`, `notes-timeline.yaml` | Rascunho sobrevive ao fechar o app |
| [Administração do jogo do clube por card](./club-admin-per-card.md) | `Ranking`/detalhe → ícone de coroa | `admin-cycle.yaml`, `admin-undo.yaml`, `admin-picker-cancel.yaml` (via Configurações, não por card) | Definir, desfazer e refazer o ciclo |
| [Diálogo de novidades](./product-update-dialog.md) | login → diálogo automático ou `?novidades=atual` | sem cobertura Maestro hoje | Ver passos da versão atual |

Para uma condução repetível, use o helper da skill e os comandos Maestro descritos nos mapas. A execução precisa declarar fixture, commit, device, evidências e qualquer `not-run`.
