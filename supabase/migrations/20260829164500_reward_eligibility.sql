ALTER TABLE public.club_rewards
  ADD COLUMN IF NOT EXISTS eligibility TEXT NOT NULL DEFAULT 'finished';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'club_rewards_eligibility_check'
      AND conrelid = 'public.club_rewards'::regclass
  ) THEN
    ALTER TABLE public.club_rewards
      ADD CONSTRAINT club_rewards_eligibility_check
      CHECK (eligibility IN ('finished', 'all_members'));
  END IF;
END;
$$;

UPDATE public.club_rewards
SET
  eligibility = 'all_members',
  description = 'Uma fogueira sob um sistema solar inquieto, concedida a todos os membros ao fim do ciclo.'
WHERE code = '2026-08-theme-cosmic-campfire';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.club_rewards
    WHERE code = '2026-08-theme-cosmic-campfire'
      AND club_month = '2026-08'
      AND theme_id = 'cosmic-campfire'
      AND eligibility = 'all_members'
  ) THEN
    RAISE EXCEPTION 'A recompensa Fogueira Cósmica não pôde ser configurada para todos os membros';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_cycle_reward_grants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'active' AND NEW.status = 'closed' THEN
    INSERT INTO public.user_reward_grants (
      reward_id,
      user_id
    )
    SELECT
      reward.id,
      eligible_user.user_id
    FROM public.club_rewards reward
    CROSS JOIN LATERAL (
      SELECT profile.id AS user_id
      FROM public.profiles profile
      WHERE reward.eligibility = 'all_members'

      UNION ALL

      SELECT snapshot.user_id
      FROM public.cycle_progress_snapshots snapshot
      WHERE reward.eligibility = 'finished'
        AND snapshot.cycle_month = reward.club_month
        AND snapshot.game_id = NEW.game_id
        AND snapshot.status = 'finished'
    ) eligible_user
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
