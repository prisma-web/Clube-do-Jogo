ALTER TABLE public.games
ADD COLUMN IF NOT EXISTS platform_ids INTEGER[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.user_platforms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  igdb_platform_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  abbreviation TEXT,
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(user_id, igdb_platform_id)
);

CREATE INDEX IF NOT EXISTS user_platforms_user_id_idx ON public.user_platforms(user_id);

ALTER TABLE public.user_platforms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários leem os próprios consoles" ON public.user_platforms;
DROP POLICY IF EXISTS "Consoles visiveis para autenticados" ON public.user_platforms;
CREATE POLICY "Consoles visiveis para autenticados" ON public.user_platforms
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Usuários adicionam os próprios consoles" ON public.user_platforms
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários removem os próprios consoles" ON public.user_platforms
  FOR DELETE USING (auth.uid() = user_id);
