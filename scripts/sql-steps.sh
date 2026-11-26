# shellcheck shell=bash

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

sql_step_seed() {
  case "$1" in
    cycle-2026-07)
      cat <<'SQL'
INSERT INTO public.games (id, title, duration_hours)
VALUES ('00000000-0000-4000-a000-0000000000f1', 'Fixture local de geração de tipos', 1)
ON CONFLICT DO NOTHING;
INSERT INTO public.club_months (month, game_id, status, started_at)
VALUES ('2026-07', '00000000-0000-4000-a000-0000000000f1', 'active', now());
SQL
      ;;
    cycle-2026-08)
      cat <<'SQL'
UPDATE public.club_months SET status = 'closed', closed_at = now() WHERE month = '2026-07';
INSERT INTO public.club_months (month, game_id, status, started_at)
VALUES ('2026-08', '00000000-0000-4000-a000-0000000000f1', 'active', now());
SQL
      ;;
    *) echo "Seed desconhecido: $1" >&2; return 1 ;;
  esac
}

apply_sql_steps() {
  local root="$1" step
  shift
  for step in "${SQL_STEPS[@]}"; do
    echo "> $step"
    if [[ "$step" == seed:* ]]; then
      sql_step_seed "${step#seed:}" | "$@"
    else
      "$@" < "$root/$step"
    fi
  done
}
