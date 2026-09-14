\set ON_ERROR_STOP on
BEGIN;
DO $$
<<admin_cycles>>
DECLARE
  admin_id uuid;
  member_id uuid;
  other_id uuid;
  reward_id uuid;
  original_cycle public.club_months%ROWTYPE;
  change_result jsonb;
  undo_result jsonb;
  preview jsonb;
  notes_before jsonb;
  progress_before jsonb;
  expected_notes integer;
  expected_grants integer;
  blocked boolean;
BEGIN
  IF current_database() NOT LIKE 'clube_expo_verification_%' THEN
    RAISE EXCEPTION 'isolated verification database required';
  END IF;
  SELECT id INTO admin_id FROM auth.users WHERE email = 'expo.admin@example.test';
  SELECT id INTO member_id FROM auth.users WHERE email = 'expo.member@example.test';
  SELECT id INTO other_id FROM auth.users WHERE email = 'expo.other@example.test';
  IF admin_id IS NULL OR member_id IS NULL OR other_id IS NULL THEN RAISE EXCEPTION 'local fixtures required'; END IF;
  SELECT * INTO STRICT original_cycle FROM public.club_months WHERE status = 'active';
  SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY id), '[]'::jsonb) INTO notes_before FROM public.game_notes n;
  SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY id), '[]'::jsonb) INTO progress_before FROM public.game_progress p;
  SELECT count(*) INTO expected_notes FROM public.game_notes WHERE game_id = original_cycle.game_id;
  SELECT count(*) INTO expected_grants FROM public.game_progress WHERE game_id = original_cycle.game_id AND status = 'finished';
  IF expected_notes = 0 OR expected_grants = 0 THEN RAISE EXCEPTION 'notes and finished progress fixtures required'; END IF;
  INSERT INTO public.club_rewards (club_month, code, kind, name, theme_id, eligibility)
  VALUES (original_cycle.month, 'sql-admin-regression', 'theme', 'SQL fixture', 'sql-fixture-theme', 'finished') RETURNING id INTO reward_id;

  PERFORM set_config('request.jwt.claim.sub', member_id::text, true);
  blocked := false;
  BEGIN
    PERFORM public.set_club_game('00000000-0000-4000-a000-000000000004', 'next');
  EXCEPTION WHEN raise_exception THEN blocked := SQLERRM LIKE '%administradores%'; END;
  IF NOT blocked THEN RAISE EXCEPTION 'member changed club cycle'; END IF;

  PERFORM set_config('request.jwt.claim.sub', admin_id::text, true);
  blocked := false;
  BEGIN
    PERFORM public.set_user_role(admin_id, 'member');
  EXCEPTION WHEN raise_exception THEN blocked := SQLERRM LIKE '%pelo menos um administrador%'; END;
  IF NOT blocked THEN RAISE EXCEPTION 'last administrator was demoted'; END IF;
  PERFORM public.set_user_role(other_id, 'admin');
  IF NOT public.is_admin(other_id) THEN RAISE EXCEPTION 'promotion not persisted'; END IF;
  PERFORM public.set_user_role(other_id, 'member');
  IF public.is_admin(other_id) THEN RAISE EXCEPTION 'demotion not persisted'; END IF;

  change_result := public.set_club_game('00000000-0000-4000-a000-000000000004', 'next');
  IF (SELECT status FROM public.club_months WHERE month = original_cycle.month) <> 'closed' THEN RAISE EXCEPTION 'previous cycle not closed'; END IF;
  IF (SELECT count(*) FROM public.cycle_note_snapshots WHERE cycle_month = original_cycle.month) <> expected_notes THEN RAISE EXCEPTION 'private notes not frozen'; END IF;
  IF (SELECT count(*) FROM public.user_reward_grants WHERE user_reward_grants.reward_id = admin_cycles.reward_id) <> expected_grants THEN RAISE EXCEPTION 'reward grant mismatch'; END IF;
  IF (SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY id), '[]'::jsonb) FROM public.game_notes n) <> notes_before THEN RAISE EXCEPTION 'permanent notes changed'; END IF;
  IF (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY id), '[]'::jsonb) FROM public.game_progress p) <> progress_before THEN RAISE EXCEPTION 'permanent progress changed'; END IF;
  preview := public.get_club_game_undo_preview((change_result->>'undo_event_id')::uuid);
  IF (preview->>'note_snapshots')::integer <> expected_notes THEN RAISE EXCEPTION 'undo preview lost note impact'; END IF;
  IF (preview->>'reward_grants')::integer <> expected_grants THEN RAISE EXCEPTION 'undo preview lost reward impact'; END IF;

  undo_result := public.undo_club_game_change((change_result->>'undo_event_id')::uuid, true);
  IF (SELECT month FROM public.club_months WHERE status = 'active') <> original_cycle.month THEN RAISE EXCEPTION 'undo did not restore cycle'; END IF;
  IF EXISTS(SELECT 1 FROM public.user_reward_grants WHERE user_reward_grants.reward_id = admin_cycles.reward_id) THEN RAISE EXCEPTION 'undo retained grants from closed cycle'; END IF;
  change_result := public.redo_club_game_change((undo_result->>'redo_event_id')::uuid);
  IF (SELECT count(*) FROM public.user_reward_grants WHERE user_reward_grants.reward_id = admin_cycles.reward_id) <> expected_grants THEN RAISE EXCEPTION 'redo did not restore grants'; END IF;
  undo_result := public.undo_club_game_change((change_result->>'undo_event_id')::uuid, true);
  UPDATE public.club_cycle_events SET reverted_at = now() - interval '6 minutes' WHERE id = (undo_result->>'redo_event_id')::uuid;
  blocked := false;
  BEGIN
    PERFORM public.redo_club_game_change((undo_result->>'redo_event_id')::uuid);
  EXCEPTION WHEN raise_exception THEN blocked := SQLERRM LIKE '%prazo%expirou%'; END;
  IF NOT blocked THEN RAISE EXCEPTION 'expired redo was accepted'; END IF;
  IF (SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY id), '[]'::jsonb) FROM public.game_notes n) <> notes_before THEN RAISE EXCEPTION 'undo/redo changed permanent notes'; END IF;
  IF (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY id), '[]'::jsonb) FROM public.game_progress p) <> progress_before THEN RAISE EXCEPTION 'undo/redo changed permanent progress'; END IF;
  RAISE NOTICE 'PASS admin permissions, roles, close, snapshots, grants, undo, redo and expiration; permanent notes/progress unchanged';
END;
$$;
ROLLBACK;
