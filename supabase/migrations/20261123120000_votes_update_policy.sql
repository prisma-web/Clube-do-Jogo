-- Lets members change their own vote with an upsert (INSERT ... ON CONFLICT DO UPDATE).
-- Without an UPDATE policy, the conflict branch fails with
-- "new row violates row-level security policy (USING expression)".
-- Additive: only creates a policy; mirrors the INSERT/DELETE window
-- (own vote, for the election after the active cycle).
DROP POLICY IF EXISTS "Permitir atualização de voto próprio" ON public.votes;
CREATE POLICY "Permitir atualização de voto próprio" ON public.votes
FOR UPDATE
USING (
  auth.uid() = user_id
  AND vote_month = (
    SELECT TO_CHAR(TO_DATE(month || '-01', 'YYYY-MM-DD') + INTERVAL '1 month', 'YYYY-MM')
    FROM public.club_months WHERE status = 'active'
  )
)
WITH CHECK (
  auth.uid() = user_id
  AND vote_month = (
    SELECT TO_CHAR(TO_DATE(month || '-01', 'YYYY-MM-DD') + INTERVAL '1 month', 'YYYY-MM')
    FROM public.club_months WHERE status = 'active'
  )
);
