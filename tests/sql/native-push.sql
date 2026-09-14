\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_database() <> 'clube_expo_verification_0746' THEN
    RAISE EXCEPTION 'isolated verification database required';
  END IF;
END;
$$;

BEGIN;

DO $$
DECLARE
  owner_id UUID;
  delivery RECORD;
  receipt RECORD;
  first_enqueue INTEGER;
  duplicate_enqueue INTEGER;
  active_token TEXT;
  active_installation BOOLEAN;
  delivery_status TEXT;
  first_worker_id UUID := gen_random_uuid();
  second_worker_id UUID := gen_random_uuid();
BEGIN
  SELECT id INTO owner_id
  FROM auth.users
  WHERE email = 'expo.member@example.test';
  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'isolated fixture user is missing';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', owner_id::TEXT, TRUE);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', TRUE);

  PERFORM public.register_native_push_installation(
    'sql-rotation-installation',
    'ExpoPushToken[sql_old_token_fixture]',
    'sql-project-rotation',
    'ios'
  );
  first_enqueue := public.enqueue_native_push_deliveries(
    'sql-rotation-event',
    'sql-project-rotation',
    '{"title":"Fixture","body":"Local","url":"/perfil","tag":"sql-rotation"}'::JSONB
  );
  duplicate_enqueue := public.enqueue_native_push_deliveries(
    'sql-rotation-event',
    'sql-project-rotation',
    '{"title":"Fixture","body":"Local","url":"/perfil","tag":"sql-rotation"}'::JSONB
  );
  IF first_enqueue <> 1 OR duplicate_enqueue <> 0 THEN
    RAISE EXCEPTION 'native delivery dedupe failed: first %, duplicate %', first_enqueue, duplicate_enqueue;
  END IF;

  SELECT * INTO delivery
  FROM public.claim_native_push_deliveries(first_worker_id, 1);
  IF delivery.attempt_number <> 1 THEN
    RAISE EXCEPTION 'first delivery attempt was not claimed';
  END IF;
  IF NOT public.record_native_push_ticket(
    delivery.delivery_id,
    delivery.attempt_id,
    first_worker_id,
    delivery.expo_push_token,
    'ticketed',
    'sql-ticket-rotation',
    NULL,
    NULL,
    NULL,
    FALSE,
    '{}'::JSONB
  ) THEN
    RAISE EXCEPTION 'ticket outcome was not persisted';
  END IF;

  PERFORM public.register_native_push_installation(
    'sql-rotation-installation',
    'ExpoPushToken[sql_new_token_fixture]',
    'sql-project-rotation',
    'ios'
  );
  UPDATE public.native_push_deliveries
  SET next_attempt_at = NOW() - INTERVAL '1 second'
  WHERE id = delivery.delivery_id;

  SELECT * INTO receipt
  FROM public.claim_native_push_receipts(first_worker_id, 1);
  IF receipt.expo_push_token <> 'ExpoPushToken[sql_old_token_fixture]' THEN
    RAISE EXCEPTION 'receipt did not retain attempted token: %', receipt.expo_push_token;
  END IF;
  IF NOT public.record_native_push_receipt(
    receipt.delivery_id,
    receipt.attempt_id,
    first_worker_id,
    receipt.expo_push_token,
    'invalid_token',
    'DeviceNotRegistered',
    NULL,
    NULL,
    '{}'::JSONB
  ) THEN
    RAISE EXCEPTION 'receipt outcome was not persisted';
  END IF;

  SELECT active, expo_push_token
  INTO active_installation, active_token
  FROM public.native_push_installations
  WHERE installation_id = 'sql-rotation-installation';
  IF NOT active_installation OR active_token <> 'ExpoPushToken[sql_new_token_fixture]' THEN
    RAISE EXCEPTION 'old receipt disabled rotated token';
  END IF;

  PERFORM public.register_native_push_installation(
    'sql-fifth-installation',
    'ExpoPushToken[sql_fifth_token_fixture]',
    'sql-project-fifth',
    'android'
  );
  PERFORM public.enqueue_native_push_deliveries(
    'sql-fifth-event',
    'sql-project-fifth',
    '{"title":"Fixture","body":"Local","url":"/perfil","tag":"sql-fifth"}'::JSONB
  );
  UPDATE public.native_push_deliveries
  SET attempt_count = 4
  WHERE event_key = 'sql-fifth-event';

  SELECT * INTO delivery
  FROM public.claim_native_push_deliveries(first_worker_id, 1);
  IF delivery.attempt_number <> 5 THEN
    RAISE EXCEPTION 'fifth delivery attempt was not claimed';
  END IF;
  PERFORM public.claim_native_push_deliveries(second_worker_id, 1);
  SELECT status INTO delivery_status
  FROM public.native_push_deliveries
  WHERE id = delivery.delivery_id;
  IF delivery_status <> 'sending' THEN
    RAISE EXCEPTION 'active fifth lease changed to %', delivery_status;
  END IF;

  UPDATE public.native_push_deliveries
  SET lease_expires_at = NOW() - INTERVAL '1 second'
  WHERE id = delivery.delivery_id;
  PERFORM public.claim_native_push_deliveries(second_worker_id, 1);
  SELECT status INTO delivery_status
  FROM public.native_push_deliveries
  WHERE id = delivery.delivery_id;
  IF delivery_status <> 'unknown' THEN
    RAISE EXCEPTION 'expired fifth lease did not converge to unknown: %', delivery_status;
  END IF;
END;
$$;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  read_denied BOOLEAN := FALSE;
  write_denied BOOLEAN := FALSE;
BEGIN
  BEGIN
    PERFORM 1 FROM public.native_push_deliveries LIMIT 1;
  EXCEPTION
    WHEN insufficient_privilege THEN read_denied := TRUE;
  END;
  IF NOT read_denied THEN
    RAISE EXCEPTION 'authenticated role read native push queue directly';
  END IF;

  BEGIN
    INSERT INTO public.native_push_deliveries (
      event_key,
      installation_id,
      recipient_user_id,
      project_id,
      message
    )
    VALUES (
      'sql-forbidden-direct-write',
      gen_random_uuid(),
      gen_random_uuid(),
      'sql-forbidden',
      '{}'::JSONB
    );
  EXCEPTION
    WHEN insufficient_privilege THEN write_denied := TRUE;
  END;
  IF NOT write_denied THEN
    RAISE EXCEPTION 'authenticated role wrote native push queue directly';
  END IF;
END;
$$;

RESET ROLE;
ROLLBACK;
