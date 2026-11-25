#!/usr/bin/env bash

set -euo pipefail

EMBEDDED_PG_PACKAGE="@embedded-postgres/linux-x64@17.6.0-beta.15"
PG_META_REPO="https://github.com/supabase/postgres-meta"
PG_META_TAG="v0.96.6"
PG_SOCKET_PORT="55439"

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

DB_URL="postgresql://postgres@localhost:$PG_SOCKET_PORT/postgres?host=$(node -p 'encodeURIComponent(process.argv[1])' "$SOCK")"
node -e '
  const [url, sock] = process.argv.slice(1); const u = new URL(url);
  if (u.hostname !== "localhost" || u.searchParams.get("host") !== sock) process.exit(1);
' "$DB_URL" "$SOCK" || { echo "A conexão não aponta para o socket local; abortando." >&2; exit 1; }

PSQL=(psql -X -q -v ON_ERROR_STOP=1 -h "$SOCK" -p "$PG_SOCKET_PORT" -U postgres -d postgres)

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

RESULT="$GENERATED"

if [[ "$MODE" == "check" ]]; then
  if diff "$OUT" "$RESULT" >/dev/null; then
    echo "database.types.ts está atualizado."
  else
    echo "database.types.ts difere do SQL do repositório. Rode $0." >&2
    exit 1
  fi
else
  cp "$RESULT" "$OUT"
  echo "> Gravado $OUT"
fi
