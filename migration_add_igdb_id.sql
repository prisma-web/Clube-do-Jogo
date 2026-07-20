-- =============================================================
-- Migracao: Adicionar ID da IGDB aos jogos
-- Execute no SQL Editor do Supabase
-- =============================================================

ALTER TABLE public.games
ADD COLUMN IF NOT EXISTS igdb_id INTEGER UNIQUE;
