-- =============================================================
-- Migração: Remover lógica de reset mensal dos votos
-- Execute no SQL Editor do Supabase
-- =============================================================

-- 1. Remover a constraint única antiga (inclui vote_month)
ALTER TABLE votes DROP CONSTRAINT IF EXISTS votes_user_id_game_id_vote_month_key;

-- 2. Remover a coluna vote_month
ALTER TABLE votes DROP COLUMN IF EXISTS vote_month;

-- 3. Criar nova constraint única apenas por (user_id, game_id)
ALTER TABLE votes ADD CONSTRAINT votes_user_id_game_id_key UNIQUE (user_id, game_id);
