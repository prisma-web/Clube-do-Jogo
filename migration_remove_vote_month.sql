ALTER TABLE votes DROP CONSTRAINT IF EXISTS votes_user_id_game_id_vote_month_key;

ALTER TABLE votes DROP COLUMN IF EXISTS vote_month;

ALTER TABLE votes ADD CONSTRAINT votes_user_id_game_id_key UNIQUE (user_id, game_id);
