-- Avaliacao do clube em escala de 0 a 100, com criterios detalhados opcionais.
-- Execute uma vez no SQL Editor do Supabase antes de publicar esta versao.

BEGIN;

ALTER TABLE public.game_progress
  ADD COLUMN IF NOT EXISTS rating_mode TEXT NOT NULL DEFAULT 'simple',
  ADD COLUMN IF NOT EXISTS rating_details JSONB;

ALTER TABLE public.cycle_progress_snapshots
  ADD COLUMN IF NOT EXISTS rating_mode TEXT NOT NULL DEFAULT 'simple',
  ADD COLUMN IF NOT EXISTS rating_details JSONB;

ALTER TABLE public.game_progress DROP CONSTRAINT IF EXISTS game_progress_rating_check;
ALTER TABLE public.game_progress DROP CONSTRAINT IF EXISTS game_progress_rating_range_check;
ALTER TABLE public.game_progress
  ALTER COLUMN rating TYPE NUMERIC(5,2)
  USING CASE WHEN rating BETWEEN 1 AND 10 THEN rating * 10 ELSE rating END;
ALTER TABLE public.game_progress
  ADD CONSTRAINT game_progress_rating_range_check CHECK (rating IS NULL OR rating BETWEEN 0 AND 100);

ALTER TABLE public.cycle_progress_snapshots DROP CONSTRAINT IF EXISTS cycle_progress_snapshots_rating_check;
ALTER TABLE public.cycle_progress_snapshots DROP CONSTRAINT IF EXISTS cycle_progress_snapshots_rating_range_check;
ALTER TABLE public.cycle_progress_snapshots
  ALTER COLUMN rating TYPE NUMERIC(5,2)
  USING CASE WHEN rating BETWEEN 1 AND 10 THEN rating * 10 ELSE rating END;
ALTER TABLE public.cycle_progress_snapshots
  ADD CONSTRAINT cycle_progress_snapshots_rating_range_check CHECK (rating IS NULL OR rating BETWEEN 0 AND 100);

ALTER TABLE public.game_progress DROP CONSTRAINT IF EXISTS game_progress_rating_mode_check;
ALTER TABLE public.game_progress
  ADD CONSTRAINT game_progress_rating_mode_check CHECK (rating_mode IN ('simple', 'detailed'));
ALTER TABLE public.cycle_progress_snapshots DROP CONSTRAINT IF EXISTS cycle_progress_snapshots_rating_mode_check;
ALTER TABLE public.cycle_progress_snapshots
  ADD CONSTRAINT cycle_progress_snapshots_rating_mode_check CHECK (rating_mode IN ('simple', 'detailed'));

CREATE OR REPLACE FUNCTION public.freeze_cycle_game_state(snapshot_cycle TEXT, snapshot_game_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.cycle_progress_snapshots (
    cycle_month, game_id, user_id, status, rating, rating_mode, rating_details, started_at, finished_at
  )
  SELECT
    snapshot_cycle,
    snapshot_game_id,
    profile.id,
    COALESCE(progress.status, 'not_started'),
    progress.rating,
    COALESCE(progress.rating_mode, 'simple'),
    progress.rating_details,
    progress.started_at,
    progress.finished_at
  FROM public.profiles profile
  LEFT JOIN public.game_progress progress
    ON progress.user_id = profile.id AND progress.game_id = snapshot_game_id
  ON CONFLICT (cycle_month, game_id, user_id) DO NOTHING;

  INSERT INTO public.cycle_note_snapshots (
    cycle_month, note_id, user_id, game_id, body, image_data_url, created_at, updated_at
  )
  SELECT
    snapshot_cycle, note.id, note.user_id, note.game_id, note.body,
    note.image_data_url, note.created_at, note.updated_at
  FROM public.game_notes note
  WHERE note.game_id = snapshot_game_id
  ON CONFLICT (cycle_month, note_id) DO NOTHING;
END;
$$;

COMMIT;
