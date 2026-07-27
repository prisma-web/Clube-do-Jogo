-- Converte as notas de 0-100 para 0-10, em passos de 0,5 no aplicativo.
-- Execute depois de migration_detailed_ratings.sql.

BEGIN;

UPDATE public.game_progress
SET rating = rating / 10
WHERE rating IS NOT NULL;

UPDATE public.cycle_progress_snapshots
SET rating = rating / 10
WHERE rating IS NOT NULL;

UPDATE public.game_progress
SET rating_details = (
  SELECT jsonb_object_agg(
    key,
    CASE WHEN jsonb_typeof(value) = 'number' THEN to_jsonb((value #>> '{}')::NUMERIC / 10) ELSE value END
  )
  FROM jsonb_each(rating_details)
)
WHERE rating_details IS NOT NULL;

UPDATE public.cycle_progress_snapshots
SET rating_details = (
  SELECT jsonb_object_agg(
    key,
    CASE WHEN jsonb_typeof(value) = 'number' THEN to_jsonb((value #>> '{}')::NUMERIC / 10) ELSE value END
  )
  FROM jsonb_each(rating_details)
)
WHERE rating_details IS NOT NULL;

ALTER TABLE public.game_progress DROP CONSTRAINT IF EXISTS game_progress_rating_range_check;
ALTER TABLE public.game_progress
  ADD CONSTRAINT game_progress_rating_range_check CHECK (rating IS NULL OR rating BETWEEN 0 AND 10);

ALTER TABLE public.cycle_progress_snapshots DROP CONSTRAINT IF EXISTS cycle_progress_snapshots_rating_range_check;
ALTER TABLE public.cycle_progress_snapshots
  ADD CONSTRAINT cycle_progress_snapshots_rating_range_check CHECK (rating IS NULL OR rating BETWEEN 0 AND 10);

COMMIT;
