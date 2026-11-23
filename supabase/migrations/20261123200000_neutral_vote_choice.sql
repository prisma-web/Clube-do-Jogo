-- Makes "Neutro" a stored vote choice. A neutral row means the member
-- answered the game; it scores zero and never counts as a legacy vote.
-- Additive and idempotent: no existing vote or snapshot row is rewritten.

BEGIN;

ALTER TABLE public.votes DROP CONSTRAINT IF EXISTS votes_choice_check;
ALTER TABLE public.votes ADD CONSTRAINT votes_choice_check
  CHECK (choice IN ('would_play', 'neutral', 'would_not_play'));

-- No neutral row can exist before this migration, so the check cannot fail on current data.
ALTER TABLE public.votes DROP CONSTRAINT IF EXISTS votes_neutral_reason_check;
ALTER TABLE public.votes ADD CONSTRAINT votes_neutral_reason_check
  CHECK (choice <> 'neutral' OR (reason IS NULL AND reason_text IS NULL));

ALTER TABLE public.ranking_snapshots
  ADD COLUMN IF NOT EXISTS neutral_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS neutral_user_ids UUID[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.freeze_cycle_ranking(voting_cycle TEXT, target_cycle TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH preference_counts AS (
    SELECT
      v.game_id,
      COUNT(*)::INTEGER AS vote_count,
      ARRAY_AGG(DISTINCT v.user_id) AS voter_ids,
      COUNT(*) FILTER (WHERE v.choice = 'would_play')::INTEGER AS would_play_count,
      COUNT(*) FILTER (WHERE v.choice = 'would_not_play')::INTEGER AS would_not_play_count,
      COUNT(*) FILTER (WHERE v.choice = 'neutral')::INTEGER AS neutral_count,
      0::INTEGER AS unavailable_count,
      COALESCE(ARRAY_AGG(DISTINCT v.user_id) FILTER (WHERE v.choice = 'would_play'), ARRAY[]::UUID[]) AS would_play_user_ids,
      COALESCE(ARRAY_AGG(DISTINCT v.user_id) FILTER (WHERE v.choice = 'would_not_play'), ARRAY[]::UUID[]) AS would_not_play_user_ids,
      COALESCE(ARRAY_AGG(DISTINCT v.user_id) FILTER (WHERE v.choice = 'neutral'), ARRAY[]::UUID[]) AS neutral_user_ids,
      ARRAY[]::UUID[] AS unavailable_user_ids
    FROM public.votes v
    WHERE v.vote_month = target_cycle
    GROUP BY v.game_id
  ), scores AS (
    SELECT
      pc.*,
      COALESCE(progress.completed_count, 0)::INTEGER AS completed_count,
      COALESCE(progress.user_ids, ARRAY[]::UUID[]) AS completed_user_ids,
      CASE WHEN g.duration_hours < 8 THEN 1 WHEN g.duration_hours <= 15 THEN 3 WHEN g.duration_hours <= 20 THEN 2 ELSE 1 END AS playtime_points,
      COALESCE(g.average_rating, 50) / 100.0 AS rating_multiplier,
      (pc.would_play_count - pc.would_not_play_count)::NUMERIC AS total_points,
      (
        (pc.would_play_count + pc.would_not_play_count) * 2 *
        CASE WHEN g.duration_hours < 8 THEN 1 WHEN g.duration_hours <= 15 THEN 3 WHEN g.duration_hours <= 20 THEN 2 ELSE 1 END *
        COALESCE(g.average_rating, 50) / 100.0
      ) / GREATEST(COALESCE(progress.completed_count, 0) * 2, 1) AS legacy_total_points
    FROM preference_counts pc
    JOIN public.games g ON g.id = pc.game_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS completed_count, ARRAY_AGG(gp.user_id) AS user_ids
      FROM public.game_progress gp
      WHERE gp.game_id = pc.game_id AND gp.status = 'finished'
    ) progress ON TRUE
  ), positioned AS (
    SELECT *, DENSE_RANK() OVER (ORDER BY total_points DESC)::INTEGER AS position
    FROM scores
  )
  INSERT INTO public.ranking_snapshots (
    voting_month, target_month, game_id, position, vote_count, completed_count,
    voter_ids, completed_user_ids, playtime_points, rating_multiplier, total_points,
    would_play_count, would_not_play_count, unavailable_count,
    would_play_user_ids, would_not_play_user_ids, unavailable_user_ids,
    legacy_total_points, neutral_count, neutral_user_ids
  )
  SELECT
    voting_cycle, target_cycle, game_id, position, vote_count, completed_count,
    voter_ids, completed_user_ids, playtime_points, rating_multiplier,
    ROUND(total_points, 1), would_play_count, would_not_play_count,
    unavailable_count, would_play_user_ids, would_not_play_user_ids,
    unavailable_user_ids, ROUND(legacy_total_points::NUMERIC, 1),
    neutral_count, neutral_user_ids
  FROM positioned
  ON CONFLICT (voting_month, game_id) DO NOTHING;
END;
$$;

COMMIT;
