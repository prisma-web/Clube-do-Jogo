DO $$
DECLARE
  select_policy_name TEXT;
BEGIN
  FOR select_policy_name IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_platforms'
      AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_platforms', select_policy_name);
  END LOOP;
END;
$$;

CREATE POLICY "Consoles visiveis para autenticados" ON public.user_platforms
FOR SELECT TO authenticated
USING (true);
