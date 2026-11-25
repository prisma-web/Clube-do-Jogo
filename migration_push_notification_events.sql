CREATE TABLE IF NOT EXISTS public.push_notification_states (
  state_key TEXT PRIMARY KEY,
  value_uuid UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.push_notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.push_notification_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_notification_deliveries ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_ranking_leader_notification(
  target_vote_month TEXT,
  expected_previous_leader_id UUID,
  new_leader_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stored_leader_id UUID;
  state_exists BOOLEAN;
BEGIN
  SELECT value_uuid INTO stored_leader_id
  FROM public.push_notification_states
  WHERE state_key = 'ranking-leader:' || target_vote_month
  FOR UPDATE;
  state_exists := FOUND;

  IF NOT state_exists THEN
    INSERT INTO public.push_notification_states (state_key, value_uuid)
    VALUES ('ranking-leader:' || target_vote_month, new_leader_id);
    RETURN expected_previous_leader_id IS NOT NULL
      AND expected_previous_leader_id IS DISTINCT FROM new_leader_id
      AND new_leader_id IS NOT NULL;
  END IF;

  IF stored_leader_id IS NOT DISTINCT FROM new_leader_id THEN
    RETURN FALSE;
  END IF;

  UPDATE public.push_notification_states
  SET value_uuid = new_leader_id, updated_at = NOW()
  WHERE state_key = 'ranking-leader:' || target_vote_month;

  RETURN stored_leader_id IS NOT NULL AND new_leader_id IS NOT NULL;
END;
$$;

REVOKE ALL ON public.push_notification_states FROM anon, authenticated;
REVOKE ALL ON public.push_notification_deliveries FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_ranking_leader_notification(TEXT, UUID, UUID) FROM PUBLIC;
GRANT ALL ON public.push_notification_states TO service_role;
GRANT ALL ON public.push_notification_deliveries TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_ranking_leader_notification(TEXT, UUID, UUID) TO service_role;
