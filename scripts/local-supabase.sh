#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/sql-steps.sh
source "$ROOT/scripts/sql-steps.sh"

CLI=(npx -y supabase@3.4.0)
PROJECT_ID="cdj-local-fixture"
API_PORT=55421
WORKDIR="${CDJ_LOCAL_SUPABASE_DIR:-$ROOT/.local-supabase}"
DB_CONTAINER="supabase_db_$PROJECT_ID"
PASSWORD="fixture-local-123"
USERS=(
  "ana@example.com|Ana Fixture|admin"
  "bruno@example.com|Bruno Fixture|member"
  "carla@example.com|Carla Fixture|member"
)

write_config() {
  mkdir -p "$WORKDIR/supabase"
  cat > "$WORKDIR/supabase/config.jsonc" <<JSON
{
  "project_id": "$PROJECT_ID",
  "api": { "port": $API_PORT },
  "db": {
    "port": 55422,
    "shadow_port": 55420,
    "major_version": 17,
    "pooler": { "enabled": false, "port": 55429 },
    "migrations": { "enabled": false },
    "seed": { "enabled": false }
  },
  "realtime": { "enabled": true },
  "studio": { "enabled": false, "port": 55423 },
  "local_smtp": { "enabled": false, "port": 55424 },
  "storage": { "enabled": false },
  "edge_runtime": { "enabled": false, "inspector_port": 55483 },
  "analytics": { "enabled": false, "port": 55427 },
  "auth": {
    "site_url": "http://127.0.0.1:3000",
    "email": { "enable_confirmations": false }
  }
}
JSON
}

cli() { "${CLI[@]}" --workdir "$WORKDIR" "$@"; }

db_psql() { docker exec -i -e PGOPTIONS="-c client_min_messages=warning" "$DB_CONTAINER" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

status_value() {
  local value
  value="$(cli status -o env 2>/dev/null | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p")"
  [[ -n "$value" ]] || { echo "supabase status sem $1; o projeto está de pé?" >&2; exit 1; }
  printf '%s' "$value"
}

api_url() {
  local url
  url="$(status_value API_URL)"
  [[ "$url" == "http://127.0.0.1:$API_PORT" ]] || { echo "API_URL inesperada ($url); abortando." >&2; exit 1; }
  printf '%s' "$url"
}

already_applied() {
  [[ "$(db_psql -tA -c "SELECT to_regclass('public.goty_events') IS NOT NULL")" == "t" ]]
}

create_users() {
  local url key entry email name role
  url="$(api_url)"
  key="$(status_value SERVICE_ROLE_KEY)"
  for entry in "${USERS[@]}"; do
    IFS='|' read -r email name role <<<"$entry"
    curl -fsS -o /dev/null "$url/auth/v1/admin/users" \
      -H "apikey: $key" -H "Authorization: Bearer $key" -H 'Content-Type: application/json' \
      --data "{\"email\":\"$email\",\"password\":\"$PASSWORD\",\"email_confirm\":true,\"user_metadata\":{\"name\":\"$name\"}}"
    db_psql -c "UPDATE public.user_roles SET role = '$role' FROM public.profiles p WHERE p.id = user_roles.user_id AND p.email = '$email'"
  done
}

seed_club() {
  db_psql <<'SQL'
INSERT INTO public.games (id, title, duration_hours, average_rating, release_year, description) VALUES
  ('00000000-0000-4000-a000-000000000101', 'Fixture: Jogo do Mês', 12, 85, 2017, 'Jogo do ciclo ativo da fixture local.'),
  ('00000000-0000-4000-a000-000000000102', 'Fixture: Candidato Curto', 6, 80, 2020, 'Candidato curto para votação.'),
  ('00000000-0000-4000-a000-000000000103', 'Fixture: Candidato Médio', 14, 90, 2019, 'Candidato médio para votação.'),
  ('00000000-0000-4000-a000-000000000104', 'Fixture: Candidato Longo', 40, 75, 2015, NULL),
  ('00000000-0000-4000-a000-000000000105', 'Fixture: Candidato Extra', 18, 70, 2022, 'Mais um candidato.');

UPDATE public.club_months SET status = 'closed', closed_at = now() WHERE status = 'active';
INSERT INTO public.club_months (month, game_id, status, started_at)
VALUES (to_char(now() AT TIME ZONE 'America/Fortaleza', 'YYYY-MM'), '00000000-0000-4000-a000-000000000101', 'active', now());

-- A votação do ciclo ativo é para o mês seguinte; o ranking só lista jogos com voto.
INSERT INTO public.votes (user_id, game_id, vote_month, choice)
SELECT p.id, v.game_id::uuid, to_char((now() AT TIME ZONE 'America/Fortaleza') + interval '1 month', 'YYYY-MM'), v.choice
FROM (VALUES
  ('bruno@example.com', '00000000-0000-4000-a000-000000000102', 'would_play'),
  ('carla@example.com', '00000000-0000-4000-a000-000000000102', 'would_play'),
  ('bruno@example.com', '00000000-0000-4000-a000-000000000103', 'would_play'),
  ('carla@example.com', '00000000-0000-4000-a000-000000000104', 'neutral'),
  ('bruno@example.com', '00000000-0000-4000-a000-000000000105', 'would_play')
) AS v(email, game_id, choice)
JOIN public.profiles p ON p.email = v.email;

-- Recompensas que as migrations concedem a todos abririam um modal por cima de cada tela.
UPDATE public.user_reward_grants SET seen_at = now() WHERE seen_at IS NULL;
SQL
}

case "${1:-}" in
  up)
    write_config
    cli start
    if already_applied; then
      echo "> SQL já aplicado neste banco local; nada a fazer. Use 'down' e 'up' para recomeçar."
    else
      apply_sql_steps "$ROOT" db_psql
      echo "> seed: usuários e ciclo ativo"
      create_users
      seed_club
    fi
    echo "> Pronto em $(api_url). Usuários (senha $PASSWORD):"
    printf '  %s\n' "${USERS[@]}"
    ;;
  env)
    url="$(api_url)"
    anon="$(status_value ANON_KEY)"
    echo "NEXT_PUBLIC_SUPABASE_URL=$url"
    echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=$anon"
    echo "SUPABASE_SERVICE_ROLE_KEY=$(status_value SERVICE_ROLE_KEY)"
    echo "EXPO_PUBLIC_SUPABASE_URL=$url"
    echo "EXPO_PUBLIC_SUPABASE_ANON_KEY=$anon"
    ;;
  psql)
    shift
    db_psql "$@"
    ;;
  down)
    write_config
    cli stop --no-backup
    ;;
  *)
    echo "Uso: $0 up|env|psql|down" >&2
    exit 2
    ;;
esac
