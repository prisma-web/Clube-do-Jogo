-- Tracks the one outstanding "three new games" notification per member and cycle.
-- This is additive and does not modify existing votes or delivery records.
CREATE TABLE IF NOT EXISTS public.vote_threshold_notification_states (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vote_month TEXT NOT NULL CHECK (vote_month ~ '^\\d{4}-(0[1-9]|1[0-2])$'),
  notification_open BOOLEAN NOT NULL DEFAULT FALSE,
  notification_sequence INTEGER NOT NULL DEFAULT 0 CHECK (notification_sequence >= 0),
  notified_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, vote_month)
);

CREATE INDEX IF NOT EXISTS vote_threshold_notification_states_open_idx
  ON public.vote_threshold_notification_states(vote_month)
  WHERE notification_open;

ALTER TABLE public.vote_threshold_notification_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vote_threshold_notification_states FROM anon, authenticated;
GRANT ALL ON public.vote_threshold_notification_states TO service_role;

CREATE OR REPLACE FUNCTION public.claim_vote_threshold_notifications(
  target_vote_month TEXT,
  source_user_id UUID
)
RETURNS TABLE (recipient_user_id UUID, notification_sequence INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF target_vote_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'invalid vote month' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  INSERT INTO public.vote_threshold_notification_states AS state (
    user_id,
    vote_month,
    notification_open,
    notification_sequence,
    notified_at,
    opened_at,
    updated_at
  )
  SELECT
    profile.id,
    target_vote_month,
    TRUE,
    1,
    NOW(),
    NULL,
    NOW()
  FROM public.profiles AS profile
  WHERE profile.id <> source_user_id
    AND (
      SELECT COUNT(DISTINCT candidate.game_id)
      FROM public.votes AS candidate
      WHERE candidate.vote_month = target_vote_month
        AND NOT EXISTS (
          SELECT 1
          FROM public.votes AS recipient_vote
          WHERE recipient_vote.vote_month = target_vote_month
            AND recipient_vote.game_id = candidate.game_id
            AND recipient_vote.user_id = profile.id
        )
    ) >= 3
  ON CONFLICT (user_id, vote_month) DO UPDATE
    SET notification_open = TRUE,
        notification_sequence = state.notification_sequence + 1,
        notified_at = NOW(),
        opened_at = NULL,
        updated_at = NOW()
    WHERE state.notification_open = FALSE
  RETURNING state.user_id, state.notification_sequence;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_vote_threshold_notification(target_vote_month TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  UPDATE public.vote_threshold_notification_states
  SET opened_at = COALESCE(opened_at, NOW()), updated_at = NOW()
  WHERE user_id = current_user_id
    AND vote_month = target_vote_month
    AND notification_open;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_vote_threshold_notification(target_vote_month TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  UPDATE public.vote_threshold_notification_states AS state
  SET notification_open = FALSE, opened_at = NULL, updated_at = NOW()
  WHERE state.user_id = current_user_id
    AND state.vote_month = target_vote_month
    AND state.notification_open
    AND state.opened_at IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.votes AS vote
      WHERE vote.user_id = current_user_id
        AND vote.vote_month = target_vote_month
        AND vote.created_at >= state.opened_at
    );
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_vote_threshold_notifications(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_vote_threshold_notification(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_vote_threshold_notification(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_vote_threshold_notifications(TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.open_vote_threshold_notification(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_vote_threshold_notification(TEXT) TO authenticated;
