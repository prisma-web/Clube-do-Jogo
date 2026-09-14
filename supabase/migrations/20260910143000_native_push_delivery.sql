CREATE TABLE IF NOT EXISTS public.native_push_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expo_push_token TEXT NOT NULL,
  project_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unlinked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS native_push_installations_active_token_idx
  ON public.native_push_installations(project_id, expo_push_token)
  WHERE active;
CREATE INDEX IF NOT EXISTS native_push_installations_user_idx
  ON public.native_push_installations(user_id)
  WHERE active;

CREATE TABLE IF NOT EXISTS public.native_push_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'expo' CHECK (channel = 'expo'),
  installation_id UUID NOT NULL REFERENCES public.native_push_installations(id) ON DELETE RESTRICT,
  recipient_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  message JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'sending', 'ticketed', 'retry', 'delivered', 'invalid_token', 'failed', 'unknown', 'cancelled')
  ),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  receipt_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (receipt_attempt_count >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_id UUID,
  lease_expires_at TIMESTAMPTZ,
  ticket_id TEXT,
  ticket_attempt_id UUID,
  last_error_code TEXT,
  last_error_message TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_key, channel, installation_id)
);

CREATE INDEX IF NOT EXISTS native_push_deliveries_due_idx
  ON public.native_push_deliveries(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS native_push_deliveries_ticket_idx
  ON public.native_push_deliveries(ticket_id)
  WHERE ticket_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.native_push_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES public.native_push_deliveries(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  worker_id UUID NOT NULL,
  expo_push_token TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  send_outcome TEXT NOT NULL DEFAULT 'started',
  ticket_id TEXT,
  receipt_outcome TEXT,
  error_code TEXT,
  error_message TEXT,
  uncertain BOOLEAN NOT NULL DEFAULT FALSE,
  raw_ticket JSONB,
  raw_receipt JSONB,
  UNIQUE (delivery_id, attempt_number)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'native_push_deliveries_ticket_attempt_fk'
      AND conrelid = 'public.native_push_deliveries'::regclass
  ) THEN
    ALTER TABLE public.native_push_deliveries
      ADD CONSTRAINT native_push_deliveries_ticket_attempt_fk
      FOREIGN KEY (ticket_attempt_id) REFERENCES public.native_push_attempts(id) ON DELETE SET NULL;
  END IF;
END;
$$;

ALTER TABLE public.native_push_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.native_push_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.native_push_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own native push installations" ON public.native_push_installations;
CREATE POLICY "Users read own native push installations"
  ON public.native_push_installations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.register_native_push_installation(
  target_installation_id TEXT,
  target_expo_push_token TEXT,
  target_project_id TEXT,
  target_platform TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  existing_installation public.native_push_installations%ROWTYPE;
  saved_installation public.native_push_installations%ROWTYPE;
  token_owner public.native_push_installations%ROWTYPE;
  was_rotated BOOLEAN := FALSE;
  was_transferred BOOLEAN := FALSE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF length(target_installation_id) < 8 OR length(target_installation_id) > 200 THEN
    RAISE EXCEPTION 'invalid installation id' USING ERRCODE = '22023';
  END IF;
  IF target_expo_push_token !~ '^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,}\]$' THEN
    RAISE EXCEPTION 'invalid expo push token' USING ERRCODE = '22023';
  END IF;
  IF target_project_id = '' OR target_platform NOT IN ('android', 'ios') THEN
    RAISE EXCEPTION 'invalid native push metadata' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(target_installation_id, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(target_project_id || ':' || target_expo_push_token, 0));

  SELECT * INTO existing_installation
  FROM public.native_push_installations
  WHERE installation_id = target_installation_id
  FOR UPDATE;

  IF FOUND THEN
    was_rotated := existing_installation.expo_push_token IS DISTINCT FROM target_expo_push_token
      OR existing_installation.project_id IS DISTINCT FROM target_project_id;
    was_transferred := existing_installation.user_id IS DISTINCT FROM current_user_id;
  END IF;

  SELECT * INTO token_owner
  FROM public.native_push_installations
  WHERE project_id = target_project_id
    AND expo_push_token = target_expo_push_token
    AND active
    AND installation_id <> target_installation_id
  FOR UPDATE;

  IF FOUND THEN
    was_transferred := was_transferred OR token_owner.user_id IS DISTINCT FROM current_user_id;
    UPDATE public.native_push_installations
    SET active = FALSE, unlinked_at = NOW(), updated_at = NOW()
    WHERE id = token_owner.id;
    UPDATE public.native_push_deliveries
    SET status = 'cancelled',
        lease_id = NULL,
        lease_expires_at = NULL,
        updated_at = NOW()
    WHERE installation_id = token_owner.id
      AND status IN ('pending', 'sending', 'ticketed', 'retry');
  END IF;

  INSERT INTO public.native_push_installations (
    installation_id,
    user_id,
    expo_push_token,
    project_id,
    platform,
    active,
    linked_at,
    unlinked_at,
    updated_at
  )
  VALUES (
    target_installation_id,
    current_user_id,
    target_expo_push_token,
    target_project_id,
    target_platform,
    TRUE,
    NOW(),
    NULL,
    NOW()
  )
  ON CONFLICT (installation_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    expo_push_token = EXCLUDED.expo_push_token,
    project_id = EXCLUDED.project_id,
    platform = EXCLUDED.platform,
    active = TRUE,
    linked_at = NOW(),
    unlinked_at = NULL,
    updated_at = NOW()
  RETURNING * INTO saved_installation;

  UPDATE public.native_push_deliveries
  SET status = 'cancelled',
      lease_id = NULL,
      lease_expires_at = NULL,
      updated_at = NOW()
  WHERE installation_id = saved_installation.id
    AND recipient_user_id <> current_user_id
    AND status IN ('pending', 'sending', 'ticketed', 'retry');

  RETURN jsonb_build_object(
    'installation', jsonb_build_object(
      'installationId', saved_installation.installation_id,
      'projectId', saved_installation.project_id,
      'platform', saved_installation.platform,
      'linkedAt', saved_installation.linked_at
    ),
    'rotated', was_rotated,
    'transferred', was_transferred
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.unlink_native_push_installation(
  target_installation_id TEXT,
  expected_expo_push_token TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  changed_count INTEGER;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.native_push_installations
  SET active = FALSE, unlinked_at = NOW(), updated_at = NOW()
  WHERE installation_id = target_installation_id
    AND expo_push_token = expected_expo_push_token
    AND user_id = current_user_id
    AND active;
  GET DIAGNOSTICS changed_count = ROW_COUNT;

  UPDATE public.native_push_deliveries d
  SET status = 'cancelled',
      lease_id = NULL,
      lease_expires_at = NULL,
      updated_at = NOW()
  FROM public.native_push_installations i
  WHERE d.installation_id = i.id
    AND i.installation_id = target_installation_id
    AND i.expo_push_token = expected_expo_push_token
    AND i.user_id = current_user_id
    AND NOT i.active
    AND d.status IN ('pending', 'sending', 'ticketed', 'retry');

  RETURN changed_count = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_native_push_deliveries(
  target_event_key TEXT,
  target_project_id TEXT,
  target_message JSONB,
  target_user_ids UUID[] DEFAULT NULL,
  excluded_user_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count INTEGER;
BEGIN
  IF target_event_key = '' OR jsonb_typeof(target_message) <> 'object' THEN
    RAISE EXCEPTION 'invalid native push event' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.native_push_deliveries (
    event_key,
    installation_id,
    recipient_user_id,
    project_id,
    message
  )
  SELECT
    target_event_key,
    i.id,
    i.user_id,
    i.project_id,
    target_message
  FROM public.native_push_installations i
  WHERE i.active
    AND i.project_id = target_project_id
    AND (target_user_ids IS NULL OR i.user_id = ANY(target_user_ids))
    AND (excluded_user_id IS NULL OR i.user_id <> excluded_user_id)
  ON CONFLICT (event_key, channel, installation_id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_native_push_deliveries(
  target_worker_id UUID,
  target_limit INTEGER
)
RETURNS TABLE (
  delivery_id UUID,
  attempt_id UUID,
  attempt_number INTEGER,
  installation_id TEXT,
  expo_push_token TEXT,
  project_id TEXT,
  message JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed RECORD;
  saved_attempt_id UUID;
BEGIN
  UPDATE public.native_push_deliveries d
  SET status = 'cancelled', lease_id = NULL, lease_expires_at = NULL, updated_at = NOW()
  FROM public.native_push_installations i
  WHERE d.installation_id = i.id
    AND d.status IN ('pending', 'sending', 'ticketed', 'retry')
    AND (NOT i.active OR i.user_id <> d.recipient_user_id OR i.project_id <> d.project_id);

  UPDATE public.native_push_deliveries
  SET status = 'unknown', lease_id = NULL, lease_expires_at = NULL, updated_at = NOW()
  WHERE attempt_count >= 5
    AND (
      status IN ('pending', 'retry')
      OR (
        status = 'sending'
        AND (lease_expires_at IS NULL OR lease_expires_at <= NOW())
      )
    );

  FOR claimed IN
    WITH candidates AS (
      SELECT d.id
      FROM public.native_push_deliveries d
      JOIN public.native_push_installations i ON i.id = d.installation_id
      WHERE ((
          d.status IN ('pending', 'retry')
          AND d.next_attempt_at <= NOW()
        ) OR (
          d.status = 'sending'
          AND d.lease_expires_at <= NOW()
        ))
        AND d.attempt_count < 5
        AND i.active
        AND i.user_id = d.recipient_user_id
        AND i.project_id = d.project_id
      ORDER BY d.next_attempt_at, d.created_at
      FOR UPDATE OF d SKIP LOCKED
      LIMIT LEAST(GREATEST(target_limit, 1), 100)
    )
    UPDATE public.native_push_deliveries d
    SET status = 'sending',
        attempt_count = d.attempt_count + 1,
        lease_id = target_worker_id,
        lease_expires_at = NOW() + INTERVAL '10 minutes',
        updated_at = NOW()
    FROM candidates c, public.native_push_installations i
    WHERE d.id = c.id
      AND i.id = d.installation_id
    RETURNING d.id, d.attempt_count, i.installation_id, i.expo_push_token, i.project_id, d.message
  LOOP
    INSERT INTO public.native_push_attempts (
      delivery_id,
      attempt_number,
      worker_id,
      expo_push_token,
      uncertain
    )
    VALUES (
      claimed.id,
      claimed.attempt_count,
      target_worker_id,
      claimed.expo_push_token,
      claimed.attempt_count > 1
    )
    RETURNING id INTO saved_attempt_id;

    delivery_id := claimed.id;
    attempt_id := saved_attempt_id;
    attempt_number := claimed.attempt_count;
    installation_id := claimed.installation_id;
    expo_push_token := claimed.expo_push_token;
    project_id := claimed.project_id;
    message := claimed.message;
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_native_push_ticket(
  target_delivery_id UUID,
  target_attempt_id UUID,
  target_worker_id UUID,
  target_expo_push_token TEXT,
  target_status TEXT,
  target_ticket_id TEXT,
  target_error_code TEXT,
  target_error_message TEXT,
  target_retry_at TIMESTAMPTZ,
  target_uncertain BOOLEAN,
  target_raw JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed_count INTEGER;
BEGIN
  IF target_status NOT IN ('ticketed', 'retry', 'invalid_token', 'failed', 'unknown') THEN
    RAISE EXCEPTION 'invalid native push ticket status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.native_push_deliveries
  SET status = target_status,
      ticket_id = CASE WHEN target_status = 'ticketed' THEN target_ticket_id ELSE NULL END,
      ticket_attempt_id = CASE WHEN target_status = 'ticketed' THEN target_attempt_id ELSE NULL END,
      receipt_attempt_count = CASE WHEN target_status = 'ticketed' THEN 0 ELSE receipt_attempt_count END,
      next_attempt_at = CASE
        WHEN target_status = 'ticketed' THEN NOW() + INTERVAL '15 minutes'
        WHEN target_status = 'retry' THEN COALESCE(target_retry_at, NOW() + INTERVAL '1 minute')
        ELSE next_attempt_at
      END,
      lease_id = NULL,
      lease_expires_at = NULL,
      last_error_code = target_error_code,
      last_error_message = target_error_message,
      updated_at = NOW()
  WHERE id = target_delivery_id
    AND status = 'sending'
    AND lease_id = target_worker_id;
  GET DIAGNOSTICS changed_count = ROW_COUNT;

  IF changed_count = 1 THEN
    UPDATE public.native_push_attempts
    SET finished_at = NOW(),
        send_outcome = target_status,
        ticket_id = target_ticket_id,
        error_code = target_error_code,
        error_message = target_error_message,
        uncertain = target_uncertain,
        raw_ticket = target_raw
    WHERE id = target_attempt_id
      AND delivery_id = target_delivery_id
      AND worker_id = target_worker_id;

    IF target_status = 'invalid_token' THEN
      UPDATE public.native_push_installations i
      SET active = FALSE, unlinked_at = NOW(), updated_at = NOW()
      FROM public.native_push_deliveries d
      WHERE d.id = target_delivery_id
        AND i.id = d.installation_id
        AND i.expo_push_token = target_expo_push_token;
    END IF;
  END IF;
  RETURN changed_count = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_native_push_receipts(
  target_worker_id UUID,
  target_limit INTEGER
)
RETURNS TABLE (
  delivery_id UUID,
  attempt_id UUID,
  receipt_attempt_number INTEGER,
  installation_id TEXT,
  expo_push_token TEXT,
  ticket_id TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH exhausted AS (
    UPDATE public.native_push_deliveries
    SET status = 'unknown',
        lease_id = NULL,
        lease_expires_at = NULL,
        last_error_code = 'ReceiptWorkerInterrupted',
        updated_at = NOW()
    WHERE status = 'ticketed'
      AND receipt_attempt_count >= 5
      AND lease_expires_at <= NOW()
    RETURNING id
  ),
  candidates AS (
    SELECT d.id
    FROM public.native_push_deliveries d
    JOIN public.native_push_installations i ON i.id = d.installation_id
    WHERE d.status = 'ticketed'
      AND d.next_attempt_at <= NOW()
      AND d.receipt_attempt_count < 5
      AND (d.lease_id IS NULL OR d.lease_expires_at <= NOW())
      AND i.active
      AND i.user_id = d.recipient_user_id
      AND i.project_id = d.project_id
    ORDER BY d.next_attempt_at, d.created_at
    FOR UPDATE OF d SKIP LOCKED
    LIMIT LEAST(GREATEST(target_limit, 1), 1000)
  ),
  claimed AS (
    UPDATE public.native_push_deliveries d
    SET receipt_attempt_count = d.receipt_attempt_count + 1,
        lease_id = target_worker_id,
        lease_expires_at = NOW() + INTERVAL '10 minutes',
        updated_at = NOW()
    FROM candidates c
    WHERE d.id = c.id
    RETURNING d.*
  )
  SELECT
    d.id,
    d.ticket_attempt_id,
    d.receipt_attempt_count,
    i.installation_id,
    a.expo_push_token,
    d.ticket_id
  FROM claimed d
  JOIN public.native_push_installations i ON i.id = d.installation_id
  JOIN public.native_push_attempts a ON a.id = d.ticket_attempt_id;
$$;

CREATE OR REPLACE FUNCTION public.record_native_push_receipt(
  target_delivery_id UUID,
  target_attempt_id UUID,
  target_worker_id UUID,
  target_expo_push_token TEXT,
  target_status TEXT,
  target_error_code TEXT,
  target_error_message TEXT,
  target_retry_at TIMESTAMPTZ,
  target_raw JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed_count INTEGER;
  saved_status TEXT;
BEGIN
  IF target_status NOT IN ('delivered', 'retry', 'invalid_token', 'failed', 'unknown', 'awaiting') THEN
    RAISE EXCEPTION 'invalid native push receipt status' USING ERRCODE = '22023';
  END IF;
  saved_status := CASE WHEN target_status = 'awaiting' THEN 'ticketed' ELSE target_status END;

  UPDATE public.native_push_deliveries
  SET status = saved_status,
      ticket_id = CASE WHEN target_status = 'retry' THEN NULL ELSE ticket_id END,
      ticket_attempt_id = CASE WHEN target_status = 'retry' THEN NULL ELSE ticket_attempt_id END,
      next_attempt_at = CASE
        WHEN target_status IN ('retry', 'awaiting') THEN COALESCE(target_retry_at, NOW() + INTERVAL '15 minutes')
        ELSE next_attempt_at
      END,
      lease_id = NULL,
      lease_expires_at = NULL,
      last_error_code = target_error_code,
      last_error_message = target_error_message,
      delivered_at = CASE WHEN target_status = 'delivered' THEN NOW() ELSE delivered_at END,
      updated_at = NOW()
  WHERE id = target_delivery_id
    AND status = 'ticketed'
    AND lease_id = target_worker_id
    AND ticket_attempt_id = target_attempt_id;
  GET DIAGNOSTICS changed_count = ROW_COUNT;

  IF changed_count = 1 THEN
    UPDATE public.native_push_attempts
    SET receipt_outcome = target_status,
        error_code = COALESCE(target_error_code, error_code),
        error_message = COALESCE(target_error_message, error_message),
        raw_receipt = target_raw
    WHERE id = target_attempt_id
      AND delivery_id = target_delivery_id;

    IF target_status = 'invalid_token' THEN
      UPDATE public.native_push_installations i
      SET active = FALSE, unlinked_at = NOW(), updated_at = NOW()
      FROM public.native_push_deliveries d
      WHERE d.id = target_delivery_id
        AND i.id = d.installation_id
        AND i.expo_push_token = target_expo_push_token;
    END IF;
  END IF;
  RETURN changed_count = 1;
END;
$$;

REVOKE ALL ON public.native_push_installations FROM anon, authenticated;
REVOKE ALL ON public.native_push_deliveries FROM anon, authenticated;
REVOKE ALL ON public.native_push_attempts FROM anon, authenticated;
GRANT SELECT ON public.native_push_installations TO authenticated;
GRANT ALL ON public.native_push_installations TO service_role;
GRANT ALL ON public.native_push_deliveries TO service_role;
GRANT ALL ON public.native_push_attempts TO service_role;

REVOKE ALL ON FUNCTION public.register_native_push_installation(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unlink_native_push_installation(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_native_push_deliveries(TEXT, TEXT, JSONB, UUID[], UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_native_push_deliveries(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_native_push_ticket(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_native_push_receipts(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_native_push_receipt(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.register_native_push_installation(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_native_push_installation(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_native_push_deliveries(TEXT, TEXT, JSONB, UUID[], UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_native_push_deliveries(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_native_push_ticket(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_native_push_receipts(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_native_push_receipt(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB) TO service_role;
