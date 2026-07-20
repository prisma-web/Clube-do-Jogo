-- =============================================================
-- Migracao: Adicionar lista de jogos zerados
-- Execute no SQL Editor do Supabase
-- =============================================================

CREATE TABLE IF NOT EXISTS public.completed_games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(user_id, game_id)
);

ALTER TABLE public.completed_games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura de jogos zerados para autenticados" ON public.completed_games
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Permitir insercao de jogo zerado proprio" ON public.completed_games
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Permitir exclusao de jogo zerado proprio" ON public.completed_games
    FOR DELETE USING (auth.uid() = user_id);
