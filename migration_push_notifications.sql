-- Notificacoes push para comentarios da timeline.
-- Execute uma vez no SQL Editor do Supabase antes de publicar esta versao.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios veem as proprias assinaturas push" ON public.push_subscriptions;
CREATE POLICY "Usuarios veem as proprias assinaturas push" ON public.push_subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuarios criam as proprias assinaturas push" ON public.push_subscriptions;
CREATE POLICY "Usuarios criam as proprias assinaturas push" ON public.push_subscriptions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuarios atualizam as proprias assinaturas push" ON public.push_subscriptions;
CREATE POLICY "Usuarios atualizam as proprias assinaturas push" ON public.push_subscriptions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuarios removem as proprias assinaturas push" ON public.push_subscriptions;
CREATE POLICY "Usuarios removem as proprias assinaturas push" ON public.push_subscriptions FOR DELETE TO authenticated USING (auth.uid() = user_id);
