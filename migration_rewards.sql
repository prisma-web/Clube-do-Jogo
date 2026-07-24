-- Clube do Jogo: recompensas cosméticas por conclusão do ciclo.
-- Execute depois de migration_admin_cycles_game_data.sql.

-- Cada recompensa pertence à instância mensal do clube, não ao jogo global.
-- O catálogo é preenchido programaticamente por migrations junto da versão
-- que contém o cosmético. Não existe escrita de recompensas pela aplicação.
CREATE TABLE IF NOT EXISTS public.club_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_month TEXT NOT NULL REFERENCES public.club_months(month) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9][a-z0-9._-]+$'),
  kind TEXT NOT NULL CHECK (kind IN ('theme')),
  name TEXT NOT NULL CHECK (CHAR_LENGTH(TRIM(name)) BETWEEN 1 AND 80),
  description TEXT CHECK (description IS NULL OR CHAR_LENGTH(TRIM(description)) BETWEEN 1 AND 280),
  theme_id TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (kind <> 'theme' OR (theme_id IS NOT NULL AND CHAR_LENGTH(TRIM(theme_id)) > 0)),
  UNIQUE (club_month, kind, theme_id)
);

CREATE TABLE IF NOT EXISTS public.user_reward_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_id UUID NOT NULL REFERENCES public.club_rewards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  seen_at TIMESTAMPTZ,
  UNIQUE (reward_id, user_id)
);

CREATE INDEX IF NOT EXISTS club_rewards_month_idx
ON public.club_rewards(club_month);
CREATE INDEX IF NOT EXISTS user_reward_grants_user_idx
ON public.user_reward_grants(user_id, granted_at DESC);

-- Usa exclusivamente o snapshot capturado na transação de encerramento. Uma
-- finalização alterada depois do encontro não concede nem remove recompensa.
CREATE OR REPLACE FUNCTION public.sync_cycle_reward_grants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'active' AND NEW.status = 'closed' THEN
    INSERT INTO public.user_reward_grants (reward_id, user_id)
    SELECT reward.id, snapshot.user_id
    FROM public.club_rewards reward
    JOIN public.cycle_progress_snapshots snapshot
      ON snapshot.cycle_month = reward.club_month
     AND snapshot.game_id = NEW.game_id
     AND snapshot.status = 'finished'
    WHERE reward.club_month = NEW.month
    ON CONFLICT (reward_id, user_id) DO NOTHING;
  ELSIF OLD.status = 'closed' AND NEW.status = 'active' THEN
    DELETE FROM public.user_reward_grants grant_row
    USING public.club_rewards reward
    WHERE grant_row.reward_id = reward.id
      AND reward.club_month = NEW.month;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_rewards_after_cycle_status_change ON public.club_months;
CREATE TRIGGER sync_rewards_after_cycle_status_change
AFTER UPDATE OF status ON public.club_months
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.sync_cycle_reward_grants();

CREATE OR REPLACE FUNCTION public.acknowledge_reward_grant(target_grant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_reward_grants
  SET seen_at = COALESCE(seen_at, NOW())
  WHERE id = target_grant_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recompensa não encontrada';
  END IF;
END;
$$;

ALTER TABLE public.club_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reward_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Recompensas do clube visiveis para autenticados" ON public.club_rewards;
CREATE POLICY "Recompensas do clube visiveis para autenticados" ON public.club_rewards
FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Concessoes proprias visiveis ao usuario" ON public.user_reward_grants;
CREATE POLICY "Concessoes proprias visiveis ao usuario" ON public.user_reward_grants
FOR SELECT USING (auth.uid() = user_id);

REVOKE ALL ON public.club_rewards FROM anon;
REVOKE ALL ON public.user_reward_grants FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.club_rewards FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_reward_grants FROM authenticated;
GRANT SELECT ON public.club_rewards TO authenticated;
GRANT SELECT ON public.user_reward_grants TO authenticated;

-- Inclui concessões no resumo destrutivo já exibido ao desfazer um ciclo.
CREATE OR REPLACE FUNCTION public.get_club_game_undo_preview(change_event_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN NOT public.is_admin(auth.uid()) THEN
    (SELECT jsonb_build_object('error', 'unauthorized'))
  ELSE jsonb_build_object(
    'event_id', event.id,
    'cycle_month', event.cycle_month,
    'action', event.action,
    'comments', (SELECT COUNT(*) FROM public.club_comments WHERE club_month = event.cycle_month),
    'reactions', (SELECT COUNT(*) FROM public.comment_reactions WHERE club_month = event.cycle_month),
    'votes', (SELECT COUNT(*) FROM public.votes WHERE vote_month = TO_CHAR(TO_DATE(event.cycle_month || '-01', 'YYYY-MM-DD') + INTERVAL '1 month', 'YYYY-MM')),
    'ranking_rows', (SELECT COUNT(*) FROM public.ranking_snapshots WHERE voting_month = TO_CHAR(TO_DATE(event.cycle_month || '-01', 'YYYY-MM-DD') - INTERVAL '1 month', 'YYYY-MM')),
    'progress_snapshots', (SELECT COUNT(*) FROM public.cycle_progress_snapshots WHERE cycle_month = TO_CHAR(TO_DATE(event.cycle_month || '-01', 'YYYY-MM-DD') - INTERVAL '1 month', 'YYYY-MM')),
    'note_snapshots', (SELECT COUNT(*) FROM public.cycle_note_snapshots WHERE cycle_month = TO_CHAR(TO_DATE(event.cycle_month || '-01', 'YYYY-MM-DD') - INTERVAL '1 month', 'YYYY-MM')),
    'reward_grants', (
      SELECT COUNT(*)
      FROM public.user_reward_grants grant_row
      JOIN public.club_rewards reward ON reward.id = grant_row.reward_id
      WHERE reward.club_month = TO_CHAR(TO_DATE(event.cycle_month || '-01', 'YYYY-MM-DD') - INTERVAL '1 month', 'YYYY-MM')
    )
  ) END
  FROM public.club_cycle_events event
  WHERE event.id = change_event_id AND event.reverted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.sync_cycle_reward_grants() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.acknowledge_reward_grant(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acknowledge_reward_grant(UUID) TO authenticated;

-- Permite que uma pessoa conectada veja o modal no instante em que o admin
-- encerra o ciclo. O bloco é idempotente e também funciona sem Realtime.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'user_reward_grants'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_reward_grants;
  END IF;
END;
$$;

-- Exemplo para a migration que acompanhará um tema novo:
--
-- INSERT INTO public.club_rewards (
--   club_month, code, kind, name, description, theme_id
-- ) VALUES (
--   '2026-08',
--   '2026-08-theme-exemplo',
--   'theme',
--   'Tema do jogo de agosto',
--   'Concedido a quem finalizou o jogo do clube neste ciclo.',
--   'id-do-tema-em-src-lib-themes'
-- )
-- ON CONFLICT (code) DO NOTHING;
