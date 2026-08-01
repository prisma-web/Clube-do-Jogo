-- Preferências mensais substituem o voto binário. Registros antigos equivalem
-- a “Jogaria”, o que mantém todo o histórico utilizável após a migração.
ALTER TABLE public.votes
  ADD COLUMN IF NOT EXISTS choice TEXT NOT NULL DEFAULT 'would_play',
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS reason_text TEXT;

-- A opção antiga “Sem condições” passa a “Não consigo rodar”.
UPDATE public.votes
SET choice = 'would_not_play', reason = 'cannot_run', reason_text = NULL
WHERE choice = 'unavailable';

ALTER TABLE public.votes DROP CONSTRAINT IF EXISTS votes_choice_check;
ALTER TABLE public.votes ADD CONSTRAINT votes_choice_check
  CHECK (choice IN ('would_play', 'would_not_play'));
ALTER TABLE public.votes DROP CONSTRAINT IF EXISTS votes_reason_check;
ALTER TABLE public.votes ADD CONSTRAINT votes_reason_check
  CHECK (reason IS NULL OR reason IN ('played_before', 'cannot_run', 'too_expensive', 'other'));
ALTER TABLE public.votes DROP CONSTRAINT IF EXISTS votes_reason_text_length_check;
ALTER TABLE public.votes ADD CONSTRAINT votes_reason_text_length_check
  CHECK (reason_text IS NULL OR char_length(reason_text) <= 150);

CREATE INDEX IF NOT EXISTS votes_month_choice_idx
  ON public.votes(vote_month, choice, game_id);

-- Favoritos são públicos no perfil, mas somente o dono pode alterá-los.
CREATE TABLE IF NOT EXISTS public.favorite_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, game_id)
);

ALTER TABLE public.favorite_games ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Favoritos visiveis para autenticados" ON public.favorite_games;
CREATE POLICY "Favoritos visiveis para autenticados" ON public.favorite_games
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Criar favorito proprio" ON public.favorite_games;
CREATE POLICY "Criar favorito proprio" ON public.favorite_games
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Excluir favorito proprio" ON public.favorite_games;
CREATE POLICY "Excluir favorito proprio" ON public.favorite_games
  FOR DELETE USING (auth.uid() = user_id);

-- O snapshot conserva os dois cálculos. Assim a troca de fórmula não exige
-- reescrever dados históricos nem apagar a implementação original.
ALTER TABLE public.ranking_snapshots
  ADD COLUMN IF NOT EXISTS would_play_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS would_not_play_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unavailable_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS would_play_user_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS would_not_play_user_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS unavailable_user_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS legacy_total_points NUMERIC;

-- Pontuações iguais compartilham a mesma colocação. A restrição antiga
-- obrigava uma posição exclusiva por jogo e impedia representar empates.
ALTER TABLE public.ranking_snapshots
  DROP CONSTRAINT IF EXISTS ranking_snapshots_voting_month_position_key;
CREATE INDEX IF NOT EXISTS ranking_snapshots_month_position_idx
  ON public.ranking_snapshots(voting_month, position);

UPDATE public.ranking_snapshots
SET would_play_count = vote_count,
    would_play_user_ids = voter_ids,
    legacy_total_points = COALESCE(legacy_total_points, total_points)
WHERE would_play_count = 0 AND vote_count > 0;

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
      0::INTEGER AS unavailable_count,
      COALESCE(ARRAY_AGG(DISTINCT v.user_id) FILTER (WHERE v.choice = 'would_play'), ARRAY[]::UUID[]) AS would_play_user_ids,
      COALESCE(ARRAY_AGG(DISTINCT v.user_id) FILTER (WHERE v.choice = 'would_not_play'), ARRAY[]::UUID[]) AS would_not_play_user_ids,
      ARRAY[]::UUID[] AS unavailable_user_ids
    FROM public.votes v
    WHERE v.vote_month = target_cycle
    GROUP BY v.game_id
  ), scores AS (
    SELECT
      pc.*,
      g.title,
      COALESCE(progress.completed_count, 0)::INTEGER AS completed_count,
      COALESCE(progress.user_ids, ARRAY[]::UUID[]) AS completed_user_ids,
      CASE WHEN g.duration_hours < 8 THEN 1 WHEN g.duration_hours <= 15 THEN 3 WHEN g.duration_hours <= 20 THEN 2 ELSE 1 END AS playtime_points,
      COALESCE(g.average_rating, 50) / 100.0 AS rating_multiplier,
      (pc.would_play_count - pc.would_not_play_count)::NUMERIC AS total_points,
      (
        pc.vote_count * 2 *
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
    SELECT *, DENSE_RANK() OVER (
      ORDER BY total_points DESC
    )::INTEGER AS position
    FROM scores
  )
  INSERT INTO public.ranking_snapshots (
    voting_month, target_month, game_id, position, vote_count, completed_count,
    voter_ids, completed_user_ids, playtime_points, rating_multiplier, total_points,
    would_play_count, would_not_play_count, unavailable_count,
    would_play_user_ids, would_not_play_user_ids, unavailable_user_ids,
    legacy_total_points
  )
  SELECT
    voting_cycle, target_cycle, game_id, position, vote_count, completed_count,
    voter_ids, completed_user_ids, playtime_points, rating_multiplier,
    ROUND(total_points, 1), would_play_count, would_not_play_count,
    unavailable_count, would_play_user_ids, would_not_play_user_ids,
    unavailable_user_ids, ROUND(legacy_total_points::NUMERIC, 1)
  FROM positioned
  ON CONFLICT (voting_month, game_id) DO NOTHING;
END;
$$;
