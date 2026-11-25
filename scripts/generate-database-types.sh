#!/usr/bin/env bash
#
# Gera packages/data/src/database.types.ts a partir do SQL versionado no
# repositório, aplicado a um Postgres descartável criado por este script.
#
# Seguro por construção:
# - Não aceita URL, host, porta nem credencial. Não lê variáveis PG*, DATABASE_URL
#   nem SUPABASE_* (todas são removidas do ambiente antes de qualquer comando).
# - O Postgres é iniciado aqui, num diretório temporário, com
#   listen_addresses='' (sem TCP): só existe um socket Unix dentro desse diretório.
# - O psql e o postgres-meta só recebem esse socket; o script aborta se a
#   conexão montada apontar para qualquer outro lugar.
# - Tudo o que é criado (cluster, socket, downloads) fica no diretório temporário
#   e é apagado ao sair, com ou sem erro.
#
# Requisitos: bash, node/npm, git, psql (cliente, qualquer versão >= 14) e acesso
# ao registro npm e ao GitHub para baixar as versões fixadas abaixo.
#
# Uso: scripts/generate-database-types.sh [--check]
#   --check  não grava; compara a saída com o arquivo atual e sai com 1 se diferir.

set -euo pipefail

# Versões fixadas. O postgres-meta é o mesmo que a Supabase CLI 2.111.0 usa
# em `supabase gen types typescript`.
EMBEDDED_PG_PACKAGE="@embedded-postgres/linux-x64@17.6.0-beta.15"
PG_META_REPO="https://github.com/supabase/postgres-meta"
PG_META_TAG="v0.96.6"
PG_SOCKET_PORT="55439" # só nomeia o socket Unix; não há escuta TCP.

# Ordem de aplicação. Ver o cabeçalho de database.types.ts para a justificativa.
# Entradas "seed:<nome>" inserem dados fictícios mínimos exigidos pelas
# verificações (DO $$ ... RAISE) de migrations que só gravam dados.
SQL_STEPS=(
  schema.sql
  migration_remove_vote_month.sql
  migration_add_completed_games.sql
  migration_add_game_rating_release_year.sql
  migration_add_igdb_id.sql
  migration_monthly_club.sql
  migration_add_game_taxonomy.sql
  migration_add_user_platforms.sql
  migration_admin_cycles_game_data.sql
  migration_rewards.sql
  seed:cycle-2026-07
  migration_reward_ori.sql
  migration_detailed_ratings.sql
  migration_timeline_realtime.sql
  migration_rating_scale_0_to_10.sql
  migration_push_notifications.sql
  migration_preferences_favorites.sql
  supabase/migrations/20260801150000_rating_scale_preferences.sql
  seed:cycle-2026-08
  supabase/migrations/20260829160000_cosmic_campfire_reward.sql
  supabase/migrations/20260829164500_reward_eligibility.sql
  migration_push_notification_events.sql
  migration_user_platforms_visibility.sql
  migration_avatar_crop.sql
  supabase/migrations/20260910143000_native_push_delivery.sql
  supabase/migrations/20261027090000_vote_threshold_notifications.sql
  supabase/migrations/20261123120000_votes_update_policy.sql
  supabase/migrations/20261123180000_goty_2026_experience.sql
  supabase/migrations/20261123200000_neutral_vote_choice.sql
)

MODE="write"
case "${1:-}" in
  "") ;;
  --check) MODE="check" ;;
  *) echo "Uso: $0 [--check]" >&2; exit 2 ;;
esac

# Remove qualquer configuração de conexão herdada do ambiente.
while IFS= read -r name; do unset "$name"; done < <(compgen -e | grep -E '^(PG|DATABASE_URL|SUPABASE_|POSTGRES)' || true)

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/packages/data/src/database.types.ts"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/cdj-dbtypes-XXXXXX")"
PGDATA_DIR="$WORK/pgdata"
SOCK="$WORK/sock"
PG_STARTED=0

cleanup() {
  if [[ "$PG_STARTED" == 1 ]]; then
    "$WORK/pg/package/native/bin/pg_ctl" -D "$PGDATA_DIR" -m immediate stop >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

for tool in node npm git psql; do
  command -v "$tool" >/dev/null || { echo "Falta '$tool' no PATH." >&2; exit 1; }
done

echo "> Baixando Postgres embutido ($EMBEDDED_PG_PACKAGE)"
mkdir -p "$WORK/pg" "$SOCK"
(cd "$WORK/pg" && npm pack "$EMBEDDED_PG_PACKAGE" --silent >/dev/null && tar xzf ./*.tgz)
node -e '
  const fs = require("fs"), path = require("path");
  const base = process.argv[1];
  for (const { source, target } of JSON.parse(fs.readFileSync(path.join(base, "native/pg-symlinks.json"), "utf8"))) {
    const t = path.join(base, target);
    if (!fs.existsSync(t)) fs.symlinkSync(path.basename(source), t);
  }' "$WORK/pg/package"
chmod +x "$WORK/pg/package/native/bin/"*
PGBIN="$WORK/pg/package/native/bin"

echo "> Baixando postgres-meta $PG_META_TAG"
git -c advice.detachedHead=false clone -q --depth 1 --branch "$PG_META_TAG" "$PG_META_REPO" "$WORK/pgmeta"
(cd "$WORK/pgmeta" && npm ci --ignore-scripts --no-audit --no-fund --silent >/dev/null && npm run build --silent >/dev/null)

echo "> Iniciando Postgres local (somente socket Unix em $SOCK)"
"$PGBIN/initdb" -D "$PGDATA_DIR" -U postgres --auth=trust --encoding=UTF8 --locale=C >/dev/null
"$PGBIN/pg_ctl" -D "$PGDATA_DIR" -w -l "$WORK/postgres.log" \
  -o "-c listen_addresses='' -c unix_socket_directories='$SOCK' -p $PG_SOCKET_PORT" start >/dev/null
PG_STARTED=1

# O host da URL é localhost (onde nada escuta: não há TCP); o parâmetro host
# faz o node-postgres usar o socket Unix criado acima.
DB_URL="postgresql://postgres@localhost:$PG_SOCKET_PORT/postgres?host=$(node -p 'encodeURIComponent(process.argv[1])' "$SOCK")"
# Defesa extra: a única conexão permitida é o socket criado acima.
node -e '
  const [url, sock] = process.argv.slice(1); const u = new URL(url);
  if (u.hostname !== "localhost" || u.searchParams.get("host") !== sock) process.exit(1);
' "$DB_URL" "$SOCK" || { echo "A conexão não aponta para o socket local; abortando." >&2; exit 1; }

PSQL=(psql -X -q -v ON_ERROR_STOP=1 -h "$SOCK" -p "$PG_SOCKET_PORT" -U postgres -d postgres)

# Stub mínimo do que a Supabase provê fora do schema public. Nada aqui cria
# objetos em public: as extensões vão para o schema extensions, como na Supabase.
"${PSQL[@]}" <<'SQL'
CREATE ROLE anon NOLOGIN NOINHERIT;
CREATE ROLE authenticated NOLOGIN NOINHERIT;
CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
CREATE SCHEMA extensions;
CREATE EXTENSION "uuid-ossp" SCHEMA extensions;
CREATE EXTENSION pgcrypto SCHEMA extensions;
ALTER DATABASE postgres SET search_path = "$user", public, extensions;
CREATE SCHEMA auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb,
  raw_app_meta_data jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '')::text $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
  $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role;
CREATE PUBLICATION supabase_realtime;
SQL

seed() {
  case "$1" in
    cycle-2026-07)
      "${PSQL[@]}" <<'SQL'
INSERT INTO public.games (id, title, duration_hours)
VALUES ('00000000-0000-4000-a000-0000000000f1', 'Fixture local de geração de tipos', 1)
ON CONFLICT DO NOTHING;
INSERT INTO public.club_months (month, game_id, status, started_at)
VALUES ('2026-07', '00000000-0000-4000-a000-0000000000f1', 'active', now());
SQL
      ;;
    cycle-2026-08)
      "${PSQL[@]}" <<'SQL'
UPDATE public.club_months SET status = 'closed', closed_at = now() WHERE month = '2026-07';
INSERT INTO public.club_months (month, game_id, status, started_at)
VALUES ('2026-08', '00000000-0000-4000-a000-0000000000f1', 'active', now());
SQL
      ;;
    *) echo "Seed desconhecido: $1" >&2; exit 1 ;;
  esac
}

for step in "${SQL_STEPS[@]}"; do
  if [[ "$step" == seed:* ]]; then
    echo "> seed ${step#seed:}"
    seed "${step#seed:}"
  else
    echo "> $step"
    "${PSQL[@]}" -f "$ROOT/$step"
  fi
done

echo "> Gerando tipos (schema public)"
GENERATED="$WORK/generated.ts"
# Reproduz getTypeOutput() de src/server/server.ts do postgres-meta sem subir o
# servidor HTTP (que carrega o profiler nativo do Sentry, ausente em Node novos).
cat > "$WORK/pgmeta/gen-types.mjs" <<'JS'
import { PostgresMeta } from './dist/lib/index.js'
import { apply } from './dist/server/templates/typescript.js'
const included = ['public']
const pgMeta = new PostgresMeta({ max: 1, connectionString: process.env.CDJ_DB_URL })
const results = await Promise.all([
  pgMeta.schemas.list(),
  pgMeta.tables.list({ includedSchemas: included, includeColumns: false }),
  pgMeta.foreignTables.list({ includedSchemas: included, includeColumns: false }),
  pgMeta.views.list({ includedSchemas: included, includeColumns: false }),
  pgMeta.materializedViews.list({ includedSchemas: included, includeColumns: false }),
  pgMeta.columns.list({ includedSchemas: included }),
  pgMeta.relationships.list(),
  pgMeta.functions.list({ includedSchemas: included }),
  pgMeta.types.list({ includeTableTypes: true, includeArrayTypes: true, includeSystemSchemas: true }),
])
await pgMeta.end()
for (const { error } of results) if (error) throw new Error(error.message)
const [schemas, tables, foreignTables, views, materializedViews, columns, relationships, functions, types] =
  results.map((r) => r.data)
process.stdout.write(await apply({
  schemas: schemas.filter(({ name }) => included.includes(name)),
  tables, foreignTables, views, materializedViews, columns, relationships,
  functions: functions.filter(({ return_type }) => !['trigger', 'event_trigger'].includes(return_type)),
  types,
  detectOneToOneRelationships: true,
  postgrestVersion: undefined,
}))
JS
(cd "$WORK/pgmeta" && CDJ_DB_URL="$DB_URL" node gen-types.mjs) > "$GENERATED"
grep -q 'export type Database' "$GENERATED" || { echo "Saída do postgres-meta inválida" >&2; cat "$GENERATED" >&2; exit 1; }

STEPS_LIST="$(printf ' *   %s\n' "${SQL_STEPS[@]}")"
RESULT="$WORK/database.types.ts"
{
  cat <<EOF
/**
 * Tipos do banco do Clube do Jogo (schema public), no formato de
 * \`supabase gen types typescript\`.
 *
 * ARQUIVO GERADO. Não edite à mão: rode \`scripts/generate-database-types.sh\`.
 *
 * Origem: derivado SOMENTE do SQL versionado neste repositório, aplicado a um
 * Postgres 17 descartável e local (socket Unix, sem TCP), e lido pelo
 * postgres-meta $PG_META_TAG (o mesmo da Supabase CLI 2.111.0).
 * NÃO foi introspectado do projeto Supabase de produção. Se a produção tiver
 * recebido SQL que não está no repositório, este arquivo não reflete isso.
 *
 * Gerado em: $(date +%Y-%m-%d)
 *
 * Arquivos aplicados, nesta ordem (seed:* são dados fictícios mínimos para que
 * as migrations de recompensa, que só gravam dados, passem nas próprias checagens):
$STEPS_LIST
 *
 * Antes deles, um stub mínimo da Supabase: roles anon/authenticated/service_role,
 * schema auth (auth.users, auth.uid(), auth.role(), auth.jwt()), extensões
 * uuid-ossp e pgcrypto no schema extensions e a publicação supabase_realtime.
 * O stub não cria nada em public.
 *
 * Para regenerar: scripts/generate-database-types.sh
 * Para conferir sem gravar: scripts/generate-database-types.sh --check
 * (requer node, npm, git e psql; baixa as versões fixadas no script.)
 */

EOF
  cat "$GENERATED"
} > "$RESULT"

if [[ "$MODE" == "check" ]]; then
  # Ignora a linha da data ao comparar.
  if diff <(grep -v '^ \* Gerado em:' "$OUT") <(grep -v '^ \* Gerado em:' "$RESULT") >/dev/null; then
    echo "database.types.ts está atualizado."
  else
    echo "database.types.ts difere do SQL do repositório. Rode $0." >&2
    exit 1
  fi
else
  cp "$RESULT" "$OUT"
  echo "> Gravado $OUT"
fi
