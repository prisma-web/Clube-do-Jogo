-- =============================================================
-- Migracao: Adicionar nota media e ano de lancamento aos jogos
-- Execute no SQL Editor do Supabase
-- =============================================================

ALTER TABLE public.games
ADD COLUMN IF NOT EXISTS average_rating NUMERIC DEFAULT NULL;

ALTER TABLE public.games
ADD COLUMN IF NOT EXISTS release_year INTEGER DEFAULT NULL;
