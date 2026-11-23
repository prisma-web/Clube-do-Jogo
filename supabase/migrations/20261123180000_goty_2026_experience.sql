-- Clube do Jogo: Experiência GOTY 2026 (Bolão Oficial The Game Awards 2026 + Seu GOTY + Mural Comunitário)
-- Migration estritamente aditiva e idempotente. Preserva integralmente todos os dados existentes.

-- ---------------------------------------------------------------------------
-- 1. Configuração do evento GOTY
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.goty_events (
  edition_year INTEGER PRIMARY KEY CHECK (edition_year >= 2024 AND edition_year <= 2100),
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked', 'results_published')),
  voting_opens_at TIMESTAMPTZ,
  voting_closes_at TIMESTAMPTZ,
  personal_voting_open BOOLEAN NOT NULL DEFAULT TRUE,
  ceremony_at TIMESTAMPTZ,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_verified_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 2. Categorias oficiais e indicados do The Game Awards (Bolão GOTY)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.goty_categories (
  id TEXT PRIMARY KEY,
  edition_year INTEGER NOT NULL REFERENCES public.goty_events(edition_year) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  name_pt TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  section TEXT NOT NULL DEFAULT 'main' CHECK (section IN ('main', 'craft', 'genre', 'community_esports')),
  display_order INTEGER NOT NULL,
  winner_nominee_id TEXT,
  winner_set_at TIMESTAMPTZ,
  winner_set_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (edition_year, slug)
);

CREATE TABLE IF NOT EXISTS public.goty_nominees (
  id TEXT PRIMARY KEY,
  edition_year INTEGER NOT NULL REFERENCES public.goty_events(edition_year) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES public.goty_categories(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  nominee_kind TEXT NOT NULL DEFAULT 'game' CHECK (
    nominee_kind IN ('game', 'performance', 'adaptation', 'creator', 'esports_athlete', 'esports_team', 'user_creation')
  ),
  game_query TEXT,
  igdb_id INTEGER,
  game_id UUID REFERENCES public.games(id) ON DELETE SET NULL,
  image_url TEXT,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (category_id, slug)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'goty_categories_winner_nominee_fk'
      AND conrelid = 'public.goty_categories'::regclass
  ) THEN
    ALTER TABLE public.goty_categories
      ADD CONSTRAINT goty_categories_winner_nominee_fk
      FOREIGN KEY (winner_nominee_id)
      REFERENCES public.goty_nominees(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS goty_categories_edition_order_idx
  ON public.goty_categories (edition_year, display_order);

CREATE INDEX IF NOT EXISTS goty_nominees_category_order_idx
  ON public.goty_nominees (category_id, display_order);

-- ---------------------------------------------------------------------------
-- 3. Votos e confirmações do Bolão GOTY
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.goty_bolao_submissions (
  edition_year INTEGER NOT NULL REFERENCES public.goty_events(edition_year) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (edition_year, user_id)
);

CREATE TABLE IF NOT EXISTS public.goty_bolao_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_year INTEGER NOT NULL REFERENCES public.goty_events(edition_year) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES public.goty_categories(id) ON DELETE CASCADE,
  nominee_id TEXT NOT NULL REFERENCES public.goty_nominees(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (edition_year, user_id, category_id)
);

CREATE INDEX IF NOT EXISTS goty_bolao_votes_edition_user_idx
  ON public.goty_bolao_votes (edition_year, user_id);

-- Garante que o indicado votado pertence exatamente à categoria escolhida
CREATE OR REPLACE FUNCTION public.validate_goty_bolao_vote_nominee()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.goty_nominees n
    WHERE n.id = NEW.nominee_id
      AND n.category_id = NEW.category_id
      AND n.edition_year = NEW.edition_year
  ) THEN
    RAISE EXCEPTION 'O indicado escolhido não pertence à categoria selecionada.';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_goty_bolao_vote_nominee ON public.goty_bolao_votes;
CREATE TRIGGER trg_validate_goty_bolao_vote_nominee
  BEFORE INSERT OR UPDATE ON public.goty_bolao_votes
  FOR EACH ROW EXECUTE FUNCTION public.validate_goty_bolao_vote_nominee();

-- ---------------------------------------------------------------------------
-- 4. Categorias e escolhas pessoais (Seu GOTY + Mural Comunitário)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.goty_personal_categories (
  id TEXT PRIMARY KEY,
  edition_year INTEGER NOT NULL REFERENCES public.goty_events(edition_year) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (edition_year, slug)
);

CREATE TABLE IF NOT EXISTS public.goty_personal_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_year INTEGER NOT NULL REFERENCES public.goty_events(edition_year) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES public.goty_personal_categories(id) ON DELETE CASCADE,
  game_id UUID REFERENCES public.games(id) ON DELETE SET NULL,
  igdb_id INTEGER,
  game_title TEXT NOT NULL,
  game_image_url TEXT,
  game_release_year INTEGER,
  game_platforms TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  game_genres TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  release_eligibility TEXT NOT NULL DEFAULT 'commercial_2026' CHECK (
    release_eligibility IN (
      'commercial_2026',
      'early_access_graduated_2026',
      'remake_remaster_2026',
      'standalone_expansion_2026',
      'manual_override',
      'ineligible'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (edition_year, user_id, category_id)
);

CREATE INDEX IF NOT EXISTS goty_personal_picks_edition_user_idx
  ON public.goty_personal_picks (edition_year, user_id);

-- ---------------------------------------------------------------------------
-- 5. Funções de validação de prazo e RPCs administrativas
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_goty_bolao_open(check_edition_year INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.goty_events e
    WHERE e.edition_year = check_edition_year
      AND e.status = 'open'
      AND (e.voting_opens_at IS NULL OR NOW() >= e.voting_opens_at)
      AND (e.voting_closes_at IS NULL OR NOW() <= e.voting_closes_at)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_goty_personal_open(check_edition_year INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.goty_events e
    WHERE e.edition_year = check_edition_year
      AND e.personal_voting_open = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.set_goty_event_settings(
  target_edition_year INTEGER,
  next_status TEXT DEFAULT NULL,
  next_voting_closes_at TIMESTAMPTZ DEFAULT NULL,
  clear_voting_closes_at BOOLEAN DEFAULT FALSE,
  next_personal_voting_open BOOLEAN DEFAULT NULL
)
RETURNS public.goty_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_row public.goty_events;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Somente administradores podem alterar as configurações do GOTY.';
  END IF;

  IF next_status IS NOT NULL AND next_status NOT IN ('open', 'locked', 'results_published') THEN
    RAISE EXCEPTION 'Status de evento GOTY inválido.';
  END IF;

  UPDATE public.goty_events
  SET
    status = COALESCE(next_status, status),
    voting_closes_at = CASE
      WHEN clear_voting_closes_at THEN NULL
      WHEN next_voting_closes_at IS NOT NULL THEN next_voting_closes_at
      ELSE voting_closes_at
    END,
    personal_voting_open = COALESCE(next_personal_voting_open, personal_voting_open),
    updated_at = NOW()
  WHERE edition_year = target_edition_year
  RETURNING * INTO updated_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Edição GOTY % não encontrada.', target_edition_year;
  END IF;

  RETURN updated_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_goty_category_winner(
  target_category_id TEXT,
  target_winner_nominee_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Somente administradores podem registrar vencedores oficiais.';
  END IF;

  IF target_winner_nominee_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.goty_nominees n
    WHERE n.id = target_winner_nominee_id
      AND n.category_id = target_category_id
  ) THEN
    RAISE EXCEPTION 'O vencedor informado não pertence a esta categoria.';
  END IF;

  UPDATE public.goty_categories
  SET
    winner_nominee_id = target_winner_nominee_id,
    winner_set_at = CASE WHEN target_winner_nominee_id IS NULL THEN NULL ELSE NOW() END,
    winner_set_by = CASE WHEN target_winner_nominee_id IS NULL THEN NULL ELSE auth.uid() END
  WHERE id = target_category_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Categoria GOTY não encontrada.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_goty_nominee_cover(
  target_nominee_id TEXT,
  next_image_url TEXT,
  next_igdb_id INTEGER DEFAULT NULL,
  next_game_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION 'Autenticação necessária.';
  END IF;

  UPDATE public.goty_nominees
  SET
    image_url = COALESCE(image_url, next_image_url),
    igdb_id = COALESCE(igdb_id, next_igdb_id),
    game_id = COALESCE(game_id, next_game_id)
  WHERE id = target_nominee_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Row Level Security (RLS)
-- ---------------------------------------------------------------------------

ALTER TABLE public.goty_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goty_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goty_nominees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goty_bolao_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goty_bolao_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goty_personal_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goty_personal_picks ENABLE ROW LEVEL SECURITY;

-- Leitura para membros autenticados
DROP POLICY IF EXISTS "Leitura de eventos GOTY para autenticados" ON public.goty_events;
CREATE POLICY "Leitura de eventos GOTY para autenticados" ON public.goty_events
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Leitura de categorias GOTY para autenticados" ON public.goty_categories;
CREATE POLICY "Leitura de categorias GOTY para autenticados" ON public.goty_categories
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Leitura de indicados GOTY para autenticados" ON public.goty_nominees;
CREATE POLICY "Leitura de indicados GOTY para autenticados" ON public.goty_nominees
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Leitura de submissoes do bolao para autenticados" ON public.goty_bolao_submissions;
CREATE POLICY "Leitura de submissoes do bolao para autenticados" ON public.goty_bolao_submissions
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Leitura de votos do bolao para autenticados" ON public.goty_bolao_votes;
CREATE POLICY "Leitura de votos do bolao para autenticados" ON public.goty_bolao_votes
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Leitura de categorias pessoais GOTY para autenticados" ON public.goty_personal_categories;
CREATE POLICY "Leitura de categorias pessoais GOTY para autenticados" ON public.goty_personal_categories
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Leitura de escolhas pessoais GOTY para autenticados" ON public.goty_personal_picks;
CREATE POLICY "Leitura de escolhas pessoais GOTY para autenticados" ON public.goty_personal_picks
  FOR SELECT USING (auth.role() = 'authenticated');

-- Escrita no Bolão protegida por dono + prazo aberto
DROP POLICY IF EXISTS "Inserir proprio voto do bolao enquanto aberto" ON public.goty_bolao_votes;
CREATE POLICY "Inserir proprio voto do bolao enquanto aberto" ON public.goty_bolao_votes
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND public.is_goty_bolao_open(edition_year)
  );

DROP POLICY IF EXISTS "Atualizar proprio voto do bolao enquanto aberto" ON public.goty_bolao_votes;
CREATE POLICY "Atualizar proprio voto do bolao enquanto aberto" ON public.goty_bolao_votes
  FOR UPDATE USING (
    auth.uid() = user_id AND public.is_goty_bolao_open(edition_year)
  ) WITH CHECK (
    auth.uid() = user_id AND public.is_goty_bolao_open(edition_year)
  );

DROP POLICY IF EXISTS "Remover proprio voto do bolao enquanto aberto" ON public.goty_bolao_votes;
CREATE POLICY "Remover proprio voto do bolao enquanto aberto" ON public.goty_bolao_votes
  FOR DELETE USING (
    auth.uid() = user_id AND public.is_goty_bolao_open(edition_year)
  );

DROP POLICY IF EXISTS "Inserir propria submissao do bolao enquanto aberto" ON public.goty_bolao_submissions;
CREATE POLICY "Inserir propria submissao do bolao enquanto aberto" ON public.goty_bolao_submissions
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND public.is_goty_bolao_open(edition_year)
  );

DROP POLICY IF EXISTS "Atualizar propria submissao do bolao enquanto aberto" ON public.goty_bolao_submissions;
CREATE POLICY "Atualizar propria submissao do bolao enquanto aberto" ON public.goty_bolao_submissions
  FOR UPDATE USING (
    auth.uid() = user_id AND public.is_goty_bolao_open(edition_year)
  ) WITH CHECK (
    auth.uid() = user_id AND public.is_goty_bolao_open(edition_year)
  );

-- Escrita no Seu GOTY independente do Bolão
DROP POLICY IF EXISTS "Inserir propria escolha pessoal GOTY" ON public.goty_personal_picks;
CREATE POLICY "Inserir propria escolha pessoal GOTY" ON public.goty_personal_picks
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND public.is_goty_personal_open(edition_year)
  );

DROP POLICY IF EXISTS "Atualizar propria escolha pessoal GOTY" ON public.goty_personal_picks;
CREATE POLICY "Atualizar propria escolha pessoal GOTY" ON public.goty_personal_picks
  FOR UPDATE USING (
    auth.uid() = user_id AND public.is_goty_personal_open(edition_year)
  ) WITH CHECK (
    auth.uid() = user_id AND public.is_goty_personal_open(edition_year)
  );

DROP POLICY IF EXISTS "Remover propria escolha pessoal GOTY" ON public.goty_personal_picks;
CREATE POLICY "Remover propria escolha pessoal GOTY" ON public.goty_personal_picks
  FOR DELETE USING (
    auth.uid() = user_id AND public.is_goty_personal_open(edition_year)
  );

-- Escrita administrativa direta bloqueada fora de admins/RPCs
DROP POLICY IF EXISTS "Admins gerenciam eventos GOTY" ON public.goty_events;
CREATE POLICY "Admins gerenciam eventos GOTY" ON public.goty_events
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins gerenciam categorias GOTY" ON public.goty_categories;
CREATE POLICY "Admins gerenciam categorias GOTY" ON public.goty_categories
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins gerenciam indicados GOTY" ON public.goty_nominees;
CREATE POLICY "Admins gerenciam indicados GOTY" ON public.goty_nominees
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins gerenciam categorias pessoais GOTY" ON public.goty_personal_categories;
CREATE POLICY "Admins gerenciam categorias pessoais GOTY" ON public.goty_personal_categories
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- 7. Seed Oficial Idempotente — The Game Awards 2026 (Anunciado em 17/11/2026)
-- Fonte oficial: https://thegameawards.com/nominees
-- ---------------------------------------------------------------------------

INSERT INTO public.goty_events (
  edition_year, title, subtitle, status, voting_opens_at, voting_closes_at,
  personal_voting_open, ceremony_at, source_name, source_url, source_verified_at
)
VALUES (
  2026,
  'GOTY 2026',
  'The Game Awards 2026 · Edição Oficial do Clube do Jogo',
  'open',
  '2026-11-17T14:00:00-03:00',
  '2026-12-10T20:59:00-03:00',
  TRUE,
  '2026-12-10T21:00:00-03:00',
  'The Game Awards 2026 — Official Nominees',
  'https://thegameawards.com/nominees',
  '2026-11-23'
)
ON CONFLICT (edition_year) DO NOTHING;

INSERT INTO public.goty_categories (id, edition_year, slug, name, name_pt, description, section, display_order) VALUES
  ('tga2026:game-of-the-year', 2026, 'game-of-the-year', 'Game of the Year', 'Jogo do Ano', 'Reconhece o jogo que entrega a melhor experiência absoluta em todos os campos criativos e técnicos.', 'main', 1),
  ('tga2026:best-game-direction', 2026, 'best-game-direction', 'Best Game Direction', 'Melhor Direção de Jogo', 'Visão criativa e inovação extraordinárias em direção e design de jogo.', 'main', 2),
  ('tga2026:best-narrative', 2026, 'best-narrative', 'Best Narrative', 'Melhor Narrativa', 'Excelência em roteiro, construção de história e desenvolvimento narrativo.', 'craft', 3),
  ('tga2026:best-art-direction', 2026, 'best-art-direction', 'Best Art Direction', 'Melhor Direção de Arte', 'Realização artística e técnica excepcional em design visual e animação.', 'craft', 4),
  ('tga2026:best-score-and-music', 2026, 'best-score-and-music', 'Best Score and Music', 'Melhor Trilha Sonora e Música', 'Composição musical marcante, trilha original e curadoria sonora.', 'craft', 5),
  ('tga2026:best-audio-design', 2026, 'best-audio-design', 'Best Audio Design', 'Melhor Design de Áudio', 'Excelência em design sonoro, efeitos ambientais e mixagem interativa.', 'craft', 6),
  ('tga2026:best-performance', 2026, 'best-performance', 'Best Performance', 'Melhor Atuação', 'Reconhece interpretações de voz, captura de movimento e performance dramática.', 'craft', 7),
  ('tga2026:innovation-in-accessibility', 2026, 'innovation-in-accessibility', 'Innovation in Accessibility', 'Inovação em Acessibilidade', 'Software e recursos que ampliam o acesso para que mais pessoas possam jogar.', 'craft', 8),
  ('tga2026:games-for-impact', 2026, 'games-for-impact', 'Games for Impact', 'Jogos de Impacto', 'Jogos reflexivos com forte mensagem social, cultural ou emocional.', 'craft', 9),
  ('tga2026:best-ongoing', 2026, 'best-ongoing', 'Best Ongoing', 'Melhor Jogo Contínuo', 'Evolução consistente de conteúdo e experiência contínua ao longo do tempo.', 'main', 10),
  ('tga2026:best-community-support', 2026, 'best-community-support', 'Best Community Support', 'Melhor Suporte à Comunidade', 'Excelência no diálogo, transparência e atualização constante junto aos jogadores.', 'community_esports', 11),
  ('tga2026:best-independent-game', 2026, 'best-independent-game', 'Best Independent Game', 'Melhor Jogo Independente', 'Realização criativa e técnica fora do sistema tradicional de grandes publicadoras.', 'main', 12),
  ('tga2026:best-debut-indie-game', 2026, 'best-debut-indie-game', 'Best Debut Indie Game', 'Melhor Estreia Indie', 'O melhor jogo de estreia de um novo estúdio independente.', 'main', 13),
  ('tga2026:best-mobile-game', 2026, 'best-mobile-game', 'Best Mobile Game', 'Melhor Jogo Mobile', 'O melhor jogo projetado para dispositivos móveis.', 'genre', 14),
  ('tga2026:best-vr-ar-game', 2026, 'best-vr-ar-game', 'Best VR / AR Game', 'Melhor Jogo VR / AR', 'A melhor experiência em realidade virtual ou aumentada.', 'genre', 15),
  ('tga2026:best-action-game', 2026, 'best-action-game', 'Best Action Game', 'Melhor Jogo de Ação', 'O melhor jogo focado principalmente em combate intenso e resposta de ação.', 'genre', 16),
  ('tga2026:best-action-adventure-game', 2026, 'best-action-adventure-game', 'Best Action / Adventure Game', 'Melhor Jogo de Ação e Aventura', 'Combinação marcante de combate, exploração, travessia e quebra-cabeças.', 'genre', 17),
  ('tga2026:best-role-playing-game', 2026, 'best-role-playing-game', 'Best Role Playing Game', 'Melhor RPG', 'Jogos projetados com rica progressão, sistemas e personalização de personagem.', 'genre', 18),
  ('tga2026:best-fighting-game', 2026, 'best-fighting-game', 'Best Fighting Game', 'Melhor Jogo de Luta', 'O melhor jogo focado em combates mano-a-mano competitivos.', 'genre', 19),
  ('tga2026:best-family-game', 2026, 'best-family-game', 'Best Family Game', 'Melhor Jogo para a Família', 'A melhor experiência para todas as idades, em qualquer gênero ou plataforma.', 'genre', 20),
  ('tga2026:best-sim-strategy-game', 2026, 'best-sim-strategy-game', 'Best Sim / Strategy Game', 'Melhor Jogo de Simulação / Estratégia', 'Jogos focados em estratégia em tempo real, turnos ou simulação profunda.', 'genre', 21),
  ('tga2026:best-sports-racing-game', 2026, 'best-sports-racing-game', 'Best Sports / Racing Game', 'Melhor Jogo de Esportes / Corrida', 'Os melhores títulos tradicionais e arcade de esportes e automobilismo.', 'genre', 22),
  ('tga2026:best-multiplayer-game', 2026, 'best-multiplayer-game', 'Best Multiplayer Game', 'Melhor Jogo Multiplayer', 'Excelência em gameplay online, cooperativo ou competitivo massivo.', 'genre', 23),
  ('tga2026:best-adaptation', 2026, 'best-adaptation', 'Best Adaptation', 'Melhor Adaptação', 'Obras criativas que adaptam universos dos games para cinema, séries ou animação.', 'community_esports', 24),
  ('tga2026:most-anticipated-game', 2026, 'most-anticipated-game', 'Most Anticipated Game', 'Jogo Mais Aguardado', 'Jogo anunciado com maior potencial de elevar o futuro da indústria.', 'main', 25),
  ('tga2026:best-user-creation', 2026, 'best-user-creation', 'Best User Creation', 'Melhor Criação da Comunidade', 'Destaca mods, mundos e experiências criativas feitas pela comunidade.', 'community_esports', 26),
  ('tga2026:content-creator-of-the-year', 2026, 'content-creator-of-the-year', 'Content Creator of the Year', 'Criador de Conteúdo do Ano', 'Streamer ou criador que causou impacto positivo na comunidade gamer em 2026.', 'community_esports', 27),
  ('tga2026:best-esports-game', 2026, 'best-esports-game', 'Best Esports Game', 'Melhor Jogo de Esports', 'O jogo que entregou a melhor experiência competitiva de esports em 2026.', 'community_esports', 28),
  ('tga2026:best-esports-athlete', 2026, 'best-esports-athlete', 'Best Esports Athlete', 'Melhor Atleta de Esports', 'O destaque individual mais consistente no cenário competitivo de 2026.', 'community_esports', 29),
  ('tga2026:best-esports-team', 2026, 'best-esports-team', 'Best Esports Team', 'Melhor Equipe de Esports', 'A equipe competitiva com desempenho mais dominante na temporada de 2026.', 'community_esports', 30)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.goty_nominees (id, edition_year, category_id, slug, title, subtitle, nominee_kind, game_query, display_order) VALUES
  -- 1. Game of the Year
  ('tga2026:game-of-the-year:007-first-light', 2026, 'tga2026:game-of-the-year', '007-first-light', '007 First Light', 'IO Interactive', 'game', '007 First Light', 1),
  ('tga2026:game-of-the-year:control-resonant', 2026, 'tga2026:game-of-the-year', 'control-resonant', 'Control Resonant', 'Remedy Entertainment / Annapurna Interactive', 'game', 'Control Resonant', 2),
  ('tga2026:game-of-the-year:grand-theft-auto-vi', 2026, 'tga2026:game-of-the-year', 'grand-theft-auto-vi', 'Grand Theft Auto VI', 'Rockstar Games', 'game', 'Grand Theft Auto VI', 3),
  ('tga2026:game-of-the-year:phantom-blade-zero', 2026, 'tga2026:game-of-the-year', 'phantom-blade-zero', 'Phantom Blade Zero', 'S-GAME', 'game', 'Phantom Blade Zero', 4),
  ('tga2026:game-of-the-year:resident-evil-requiem', 2026, 'tga2026:game-of-the-year', 'resident-evil-requiem', 'Resident Evil Requiem', 'Capcom', 'game', 'Resident Evil Requiem', 5),
  ('tga2026:game-of-the-year:the-legend-of-zelda-ocarina-of-time', 2026, 'tga2026:game-of-the-year', 'the-legend-of-zelda-ocarina-of-time', 'The Legend of Zelda: Ocarina of Time', 'Nintendo', 'game', 'The Legend of Zelda: Ocarina of Time', 6),

  -- 2. Best Game Direction
  ('tga2026:best-game-direction:control-resonant', 2026, 'tga2026:best-game-direction', 'control-resonant', 'Control Resonant', 'Remedy Entertainment / Annapurna Interactive', 'game', 'Control Resonant', 1),
  ('tga2026:best-game-direction:grand-theft-auto-vi', 2026, 'tga2026:best-game-direction', 'grand-theft-auto-vi', 'Grand Theft Auto VI', 'Rockstar Games', 'game', 'Grand Theft Auto VI', 2),
  ('tga2026:best-game-direction:phantom-blade-zero', 2026, 'tga2026:best-game-direction', 'phantom-blade-zero', 'Phantom Blade Zero', 'S-GAME', 'game', 'Phantom Blade Zero', 3),
  ('tga2026:best-game-direction:pragmata', 2026, 'tga2026:best-game-direction', 'pragmata', 'Pragmata', 'Capcom', 'game', 'Pragmata', 4),
  ('tga2026:best-game-direction:resident-evil-requiem', 2026, 'tga2026:best-game-direction', 'resident-evil-requiem', 'Resident Evil Requiem', 'Capcom', 'game', 'Resident Evil Requiem', 5),

  -- 3. Best Narrative
  ('tga2026:best-narrative:007-first-light', 2026, 'tga2026:best-narrative', '007-first-light', '007 First Light', 'IO Interactive', 'game', '007 First Light', 1),
  ('tga2026:best-narrative:control-resonant', 2026, 'tga2026:best-narrative', 'control-resonant', 'Control Resonant', 'Remedy Entertainment / Annapurna Interactive', 'game', 'Control Resonant', 2),
  ('tga2026:best-narrative:grand-theft-auto-vi', 2026, 'tga2026:best-narrative', 'grand-theft-auto-vi', 'Grand Theft Auto VI', 'Rockstar Games', 'game', 'Grand Theft Auto VI', 3),
  ('tga2026:best-narrative:resident-evil-requiem', 2026, 'tga2026:best-narrative', 'resident-evil-requiem', 'Resident Evil Requiem', 'Capcom', 'game', 'Resident Evil Requiem', 4),
  ('tga2026:best-narrative:the-blood-of-dawnwalker', 2026, 'tga2026:best-narrative', 'the-blood-of-dawnwalker', 'The Blood of Dawnwalker', 'Rebel Wolves / Bandai Namco Entertainment', 'game', 'The Blood of Dawnwalker', 5),

  -- 4. Best Art Direction
  ('tga2026:best-art-direction:control-resonant', 2026, 'tga2026:best-art-direction', 'control-resonant', 'Control Resonant', 'Remedy Entertainment / Annapurna Interactive', 'game', 'Control Resonant', 1),
  ('tga2026:best-art-direction:grand-theft-auto-vi', 2026, 'tga2026:best-art-direction', 'grand-theft-auto-vi', 'Grand Theft Auto VI', 'Rockstar Games', 'game', 'Grand Theft Auto VI', 2),
  ('tga2026:best-art-direction:mouse-pi-for-hire', 2026, 'tga2026:best-art-direction', 'mouse-pi-for-hire', 'Mouse: P.I. For Hire', 'Fumi Games / PlaySide Publishing', 'game', 'Mouse: P.I. For Hire', 3),
  ('tga2026:best-art-direction:phantom-blade-zero', 2026, 'tga2026:best-art-direction', 'phantom-blade-zero', 'Phantom Blade Zero', 'S-GAME', 'game', 'Phantom Blade Zero', 4),
  ('tga2026:best-art-direction:the-legend-of-zelda-ocarina-of-time', 2026, 'tga2026:best-art-direction', 'the-legend-of-zelda-ocarina-of-time', 'The Legend of Zelda: Ocarina of Time', 'Nintendo', 'game', 'The Legend of Zelda: Ocarina of Time', 5),

  -- 5. Best Score and Music
  ('tga2026:best-score-and-music:ace-combat-8-wings-of-theve', 2026, 'tga2026:best-score-and-music', 'ace-combat-8-wings-of-theve', 'Ace Combat 8: Wings of Theve', 'Bandai Namco Aces / Bandai Namco Entertainment', 'game', 'Ace Combat 8: Wings of Theve', 1),
  ('tga2026:best-score-and-music:grand-theft-auto-vi', 2026, 'tga2026:best-score-and-music', 'grand-theft-auto-vi', 'Grand Theft Auto VI', 'Rockstar Games', 'game', 'Grand Theft Auto VI', 2),
  ('tga2026:best-score-and-music:mixtape', 2026, 'tga2026:best-score-and-music', 'mixtape', 'Mixtape', 'Beethoven & Dinosaur / Annapurna Interactive', 'game', 'Mixtape', 3),
  ('tga2026:best-score-and-music:phantom-blade-zero', 2026, 'tga2026:best-score-and-music', 'phantom-blade-zero', 'Phantom Blade Zero', 'S-GAME', 'game', 'Phantom Blade Zero', 4),
  ('tga2026:best-score-and-music:the-legend-of-zelda-ocarina-of-time', 2026, 'tga2026:best-score-and-music', 'the-legend-of-zelda-ocarina-of-time', 'The Legend of Zelda: Ocarina of Time', 'Nintendo', 'game', 'The Legend of Zelda: Ocarina of Time', 5),

  -- 6. Best Audio Design
  ('tga2026:best-audio-design:ace-combat-8-wings-of-theve', 2026, 'tga2026:best-audio-design', 'ace-combat-8-wings-of-theve', 'Ace Combat 8: Wings of Theve', 'Bandai Namco Aces / Bandai Namco Entertainment', 'game', 'Ace Combat 8: Wings of Theve', 1),
  ('tga2026:best-audio-design:control-resonant', 2026, 'tga2026:best-audio-design', 'control-resonant', 'Control Resonant', 'Remedy Entertainment / Annapurna Interactive', 'game', 'Control Resonant', 2),
  ('tga2026:best-audio-design:grand-theft-auto-vi', 2026, 'tga2026:best-audio-design', 'grand-theft-auto-vi', 'Grand Theft Auto VI', 'Rockstar Games', 'game', 'Grand Theft Auto VI', 3),
  ('tga2026:best-audio-design:resident-evil-requiem', 2026, 'tga2026:best-audio-design', 'resident-evil-requiem', 'Resident Evil Requiem', 'Capcom', 'game', 'Resident Evil Requiem', 4),
  ('tga2026:best-audio-design:star-wars-galactic-racer', 2026, 'tga2026:best-audio-design', 'star-wars-galactic-racer', 'Star Wars: Galactic Racer', 'Fuse Games / Secret Mode', 'game', 'Star Wars: Galactic Racer', 5),

  -- 7. Best Performance
  ('tga2026:best-performance:patrick-gibson', 2026, 'tga2026:best-performance', 'patrick-gibson', 'Patrick Gibson', '007 First Light', 'performance', '007 First Light', 1),
  ('tga2026:best-performance:angela-santalbano', 2026, 'tga2026:best-performance', 'angela-santalbano', 'Angela Sant''Albano', 'Resident Evil Requiem', 'performance', 'Resident Evil Requiem', 2),
  ('tga2026:best-performance:liam-mcintyre', 2026, 'tga2026:best-performance', 'liam-mcintyre', 'Liam McIntyre', 'Marvel''s Wolverine', 'performance', 'Marvel''s Wolverine', 3),
  ('tga2026:best-performance:manni-l-perez', 2026, 'tga2026:best-performance', 'manni-l-perez', 'Manni L. Perez', 'Grand Theft Auto VI', 'performance', 'Grand Theft Auto VI', 4),
  ('tga2026:best-performance:rahul-kohli', 2026, 'tga2026:best-performance', 'rahul-kohli', 'Rahul Kohli', 'Saros', 'performance', 'Saros', 5),

  -- 8. Innovation in Accessibility
  ('tga2026:innovation-in-accessibility:assassins-creed-black-flag-resynced', 2026, 'tga2026:innovation-in-accessibility', 'assassins-creed-black-flag-resynced', 'Assassin''s Creed Black Flag Resynced', 'Ubisoft Singapore / Ubisoft', 'game', 'Assassin''s Creed Black Flag Resynced', 1),
  ('tga2026:innovation-in-accessibility:forza-horizon-6', 2026, 'tga2026:innovation-in-accessibility', 'forza-horizon-6', 'Forza Horizon 6', 'Playground Games / Xbox Game Studios', 'game', 'Forza Horizon 6', 2),
  ('tga2026:innovation-in-accessibility:gears-of-war-e-day', 2026, 'tga2026:innovation-in-accessibility', 'gears-of-war-e-day', 'Gears of War: E-Day', 'The Coalition / Xbox Game Studios', 'game', 'Gears of War: E-Day', 3),
  ('tga2026:innovation-in-accessibility:marvels-wolverine', 2026, 'tga2026:innovation-in-accessibility', 'marvels-wolverine', 'Marvel''s Wolverine', 'Insomniac Games / Sony Interactive Entertainment', 'game', 'Marvel''s Wolverine', 4),
  ('tga2026:innovation-in-accessibility:rhythm-heaven-groove', 2026, 'tga2026:innovation-in-accessibility', 'rhythm-heaven-groove', 'Rhythm Heaven Groove', 'Nintendo', 'game', 'Rhythm Heaven Groove', 5),

  -- 9. Games for Impact
  ('tga2026:games-for-impact:big-walk', 2026, 'tga2026:games-for-impact', 'big-walk', 'Big Walk', 'House House / Panic', 'game', 'Big Walk', 1),
  ('tga2026:games-for-impact:cairn', 2026, 'tga2026:games-for-impact', 'cairn', 'Cairn', 'The Game Bakers', 'game', 'Cairn', 2),
  ('tga2026:games-for-impact:forever-ago', 2026, 'tga2026:games-for-impact', 'forever-ago', 'Forever Ago', 'Third Shift / Annapurna Interactive', 'game', 'Forever Ago', 3),
  ('tga2026:games-for-impact:life-is-strange-reunion', 2026, 'tga2026:games-for-impact', 'life-is-strange-reunion', 'Life is Strange: Reunion', 'Deck Nine / Square Enix', 'game', 'Life is Strange: Reunion', 4),
  ('tga2026:games-for-impact:lilys-world-xd', 2026, 'tga2026:games-for-impact', 'lilys-world-xd', 'Lily''s World XD', 'SonderingEmily / Kwalee', 'game', 'Lily''s World XD', 5),
  ('tga2026:games-for-impact:mixtape', 2026, 'tga2026:games-for-impact', 'mixtape', 'Mixtape', 'Beethoven & Dinosaur / Annapurna Interactive', 'game', 'Mixtape', 6),

  -- 10. Best Ongoing
  ('tga2026:best-ongoing:arc-raiders', 2026, 'tga2026:best-ongoing', 'arc-raiders', 'ARC Raiders', 'Embark Studios', 'game', 'ARC Raiders', 1),
  ('tga2026:best-ongoing:final-fantasy-xiv', 2026, 'tga2026:best-ongoing', 'final-fantasy-xiv', 'Final Fantasy XIV', 'Square Enix', 'game', 'Final Fantasy XIV', 2),
  ('tga2026:best-ongoing:fortnite', 2026, 'tga2026:best-ongoing', 'fortnite', 'Fortnite', 'Epic Games', 'game', 'Fortnite', 3),
  ('tga2026:best-ongoing:no-mans-sky', 2026, 'tga2026:best-ongoing', 'no-mans-sky', 'No Man''s Sky', 'Hello Games', 'game', 'No Man''s Sky', 4),
  ('tga2026:best-ongoing:the-witcher-3-wild-hunt', 2026, 'tga2026:best-ongoing', 'the-witcher-3-wild-hunt', 'The Witcher 3: Wild Hunt', 'CD Projekt Red', 'game', 'The Witcher 3: Wild Hunt', 5),

  -- 11. Best Community Support
  ('tga2026:best-community-support:crimson-desert', 2026, 'tga2026:best-community-support', 'crimson-desert', 'Crimson Desert', 'Pearl Abyss', 'game', 'Crimson Desert', 1),
  ('tga2026:best-community-support:helldivers-2', 2026, 'tga2026:best-community-support', 'helldivers-2', 'Helldivers 2', 'Arrowhead Game Studio / Sony Interactive Entertainment', 'game', 'Helldivers 2', 2),
  ('tga2026:best-community-support:no-mans-sky', 2026, 'tga2026:best-community-support', 'no-mans-sky', 'No Man''s Sky', 'Hello Games', 'game', 'No Man''s Sky', 3),
  ('tga2026:best-community-support:the-witcher-3-wild-hunt', 2026, 'tga2026:best-community-support', 'the-witcher-3-wild-hunt', 'The Witcher 3: Wild Hunt', 'CD Projekt Red', 'game', 'The Witcher 3: Wild Hunt', 4),
  ('tga2026:best-community-support:warframe', 2026, 'tga2026:best-community-support', 'warframe', 'Warframe', 'Digital Extremes', 'game', 'Warframe', 5),

  -- 12. Best Independent Game
  ('tga2026:best-independent-game:big-walk', 2026, 'tga2026:best-independent-game', 'big-walk', 'Big Walk', 'House House / Panic', 'game', 'Big Walk', 1),
  ('tga2026:best-independent-game:cairn', 2026, 'tga2026:best-independent-game', 'cairn', 'Cairn', 'The Game Bakers', 'game', 'Cairn', 2),
  ('tga2026:best-independent-game:denshattack', 2026, 'tga2026:best-independent-game', 'denshattack', 'Denshattack!', 'Undercoders / Fireshine Games', 'game', 'Denshattack!', 3),
  ('tga2026:best-independent-game:mewgenics', 2026, 'tga2026:best-independent-game', 'mewgenics', 'Mewgenics', 'Edmund McMillen & Tyler Glaiel', 'game', 'Mewgenics', 4),
  ('tga2026:best-independent-game:mina-the-hollower', 2026, 'tga2026:best-independent-game', 'mina-the-hollower', 'Mina the Hollower', 'Yacht Club Games', 'game', 'Mina the Hollower', 5),

  -- 13. Best Debut Indie Game
  ('tga2026:best-debut-indie-game:dressmaker', 2026, 'tga2026:best-debut-indie-game', 'dressmaker', 'Dressmaker', 'Cozy Lives / Free Lives', 'game', 'Dressmaker', 1),
  ('tga2026:best-debut-indie-game:esoteric-ebb', 2026, 'tga2026:best-debut-indie-game', 'esoteric-ebb', 'Esoteric Ebb', 'Christoffer Bodegård / Raw Fury', 'game', 'Esoteric Ebb', 2),
  ('tga2026:best-debut-indie-game:orbitals', 2026, 'tga2026:best-debut-indie-game', 'orbitals', 'Orbitals', 'Shapefarm / Kepler Interactive', 'game', 'Orbitals', 3),
  ('tga2026:best-debut-indie-game:replaced', 2026, 'tga2026:best-debut-indie-game', 'replaced', 'Replaced', 'Sad Cat Studios / Thunderful Publishing', 'game', 'Replaced', 4),
  ('tga2026:best-debut-indie-game:silver-pines', 2026, 'tga2026:best-debut-indie-game', 'silver-pines', 'Silver Pines', 'Wych Elm / Team17', 'game', 'Silver Pines', 5),

  -- 14. Best Mobile Game
  ('tga2026:best-mobile-game:arknights-endfield', 2026, 'tga2026:best-mobile-game', 'arknights-endfield', 'Arknights: Endfield', 'Hypergryph / Gryphline', 'game', 'Arknights: Endfield', 1),
  ('tga2026:best-mobile-game:monster-hunter-outlanders', 2026, 'tga2026:best-mobile-game', 'monster-hunter-outlanders', 'Monster Hunter Outlanders', 'TiMi Studio Group / Level Infinite', 'game', 'Monster Hunter Outlanders', 2),
  ('tga2026:best-mobile-game:neverness-to-everness', 2026, 'tga2026:best-mobile-game', 'neverness-to-everness', 'Neverness to Everness', 'Hotta Studio / Perfect World Games', 'game', 'Neverness to Everness', 3),
  ('tga2026:best-mobile-game:pokemon-champions', 2026, 'tga2026:best-mobile-game', 'pokemon-champions', 'Pokémon Champions', 'The Pokémon Works / The Pokémon Company', 'game', 'Pokémon Champions', 4),
  ('tga2026:best-mobile-game:where-winds-meet', 2026, 'tga2026:best-mobile-game', 'where-winds-meet', 'Where Winds Meet', 'Everstone Studio / NetEase Games', 'game', 'Where Winds Meet', 5),

  -- 15. Best VR / AR Game
  ('tga2026:best-vr-ar-game:forefront', 2026, 'tga2026:best-vr-ar-game', 'forefront', 'Forefront', 'Triangle Factory', 'game', 'Forefront', 1),
  ('tga2026:best-vr-ar-game:into-the-radius-2', 2026, 'tga2026:best-vr-ar-game', 'into-the-radius-2', 'Into the Radius 2', 'CM Immersive', 'game', 'Into the Radius 2', 2),
  ('tga2026:best-vr-ar-game:little-nightmares-vr-altered-echoes', 2026, 'tga2026:best-vr-ar-game', 'little-nightmares-vr-altered-echoes', 'Little Nightmares VR: Altered Echoes', 'ICONIK / Bandai Namco Entertainment', 'game', 'Little Nightmares VR: Altered Echoes', 3),
  ('tga2026:best-vr-ar-game:tmnt-empire-city', 2026, 'tga2026:best-vr-ar-game', 'tmnt-empire-city', 'Teenage Mutant Ninja Turtles: Empire City', 'Cortopia Studios / Beyond Frames', 'game', 'Teenage Mutant Ninja Turtles: Empire City', 4),
  ('tga2026:best-vr-ar-game:thief-vr-legacy-of-shadow', 2026, 'tga2026:best-vr-ar-game', 'thief-vr-legacy-of-shadow', 'Thief VR: Legacy of Shadow', 'Maze Theory / Vertigo Games', 'game', 'Thief VR: Legacy of Shadow', 5),

  -- 16. Best Action Game
  ('tga2026:best-action-game:ace-combat-8-wings-of-theve', 2026, 'tga2026:best-action-game', 'ace-combat-8-wings-of-theve', 'Ace Combat 8: Wings of Theve', 'Bandai Namco Aces / Bandai Namco Entertainment', 'game', 'Ace Combat 8: Wings of Theve', 1),
  ('tga2026:best-action-game:gears-of-war-e-day', 2026, 'tga2026:best-action-game', 'gears-of-war-e-day', 'Gears of War: E-Day', 'The Coalition / Xbox Game Studios', 'game', 'Gears of War: E-Day', 2),
  ('tga2026:best-action-game:onimusha-way-of-the-sword', 2026, 'tga2026:best-action-game', 'onimusha-way-of-the-sword', 'Onimusha: Way of the Sword', 'Capcom', 'game', 'Onimusha: Way of the Sword', 3),
  ('tga2026:best-action-game:phantom-blade-zero', 2026, 'tga2026:best-action-game', 'phantom-blade-zero', 'Phantom Blade Zero', 'S-GAME', 'game', 'Phantom Blade Zero', 4),
  ('tga2026:best-action-game:saros', 2026, 'tga2026:best-action-game', 'saros', 'Saros', 'Housemarque / Sony Interactive Entertainment', 'game', 'Saros', 5),

  -- 17. Best Action / Adventure Game
  ('tga2026:best-action-adventure-game:007-first-light', 2026, 'tga2026:best-action-adventure-game', '007-first-light', '007 First Light', 'IO Interactive', 'game', '007 First Light', 1),
  ('tga2026:best-action-adventure-game:control-resonant', 2026, 'tga2026:best-action-adventure-game', 'control-resonant', 'Control Resonant', 'Remedy Entertainment / Annapurna Interactive', 'game', 'Control Resonant', 2),
  ('tga2026:best-action-adventure-game:grand-theft-auto-vi', 2026, 'tga2026:best-action-adventure-game', 'grand-theft-auto-vi', 'Grand Theft Auto VI', 'Rockstar Games', 'game', 'Grand Theft Auto VI', 3),
  ('tga2026:best-action-adventure-game:pragmata', 2026, 'tga2026:best-action-adventure-game', 'pragmata', 'Pragmata', 'Capcom', 'game', 'Pragmata', 4),
  ('tga2026:best-action-adventure-game:resident-evil-requiem', 2026, 'tga2026:best-action-adventure-game', 'resident-evil-requiem', 'Resident Evil Requiem', 'Capcom', 'game', 'Resident Evil Requiem', 5),
  ('tga2026:best-action-adventure-game:the-legend-of-zelda-ocarina-of-time', 2026, 'tga2026:best-action-adventure-game', 'the-legend-of-zelda-ocarina-of-time', 'The Legend of Zelda: Ocarina of Time', 'Nintendo', 'game', 'The Legend of Zelda: Ocarina of Time', 6),

  -- 18. Best Role Playing Game
  ('tga2026:best-role-playing-game:final-fantasy-resonance', 2026, 'tga2026:best-role-playing-game', 'final-fantasy-resonance', 'Final Fantasy Resonance', 'Lancarse / Square Enix', 'game', 'Final Fantasy Resonance', 1),
  ('tga2026:best-role-playing-game:fire-emblem-fortunes-weave', 2026, 'tga2026:best-role-playing-game', 'fire-emblem-fortunes-weave', 'Fire Emblem: Fortune''s Weave', 'Intelligent Systems / Nintendo', 'game', 'Fire Emblem: Fortune''s Weave', 2),
  ('tga2026:best-role-playing-game:monster-hunter-stories-3', 2026, 'tga2026:best-role-playing-game', 'monster-hunter-stories-3', 'Monster Hunter Stories 3: Twisted Reflection', 'Capcom', 'game', 'Monster Hunter Stories 3: Twisted Reflection', 3),
  ('tga2026:best-role-playing-game:the-blood-of-dawnwalker', 2026, 'tga2026:best-role-playing-game', 'the-blood-of-dawnwalker', 'The Blood of Dawnwalker', 'Rebel Wolves / Bandai Namco Entertainment', 'game', 'The Blood of Dawnwalker', 4),
  ('tga2026:best-role-playing-game:trails-in-the-sky-2nd-chapter', 2026, 'tga2026:best-role-playing-game', 'trails-in-the-sky-2nd-chapter', 'Trails in the Sky 2nd Chapter', 'Nihon Falcom / GungHo Online Entertainment', 'game', 'Trails in the Sky 2nd Chapter', 5),

  -- 19. Best Fighting Game
  ('tga2026:best-fighting-game:2xko', 2026, 'tga2026:best-fighting-game', '2xko', '2XKO', 'Riot Games', 'game', '2XKO', 1),
  ('tga2026:best-fighting-game:avatar-legends-the-fighting-game', 2026, 'tga2026:best-fighting-game', 'avatar-legends-the-fighting-game', 'Avatar Legends: The Fighting Game', 'Gameplay Group / Paramount Games', 'game', 'Avatar Legends: The Fighting Game', 2),
  ('tga2026:best-fighting-game:invincible-vs', 2026, 'tga2026:best-fighting-game', 'invincible-vs', 'Invincible VS', 'Quarter Up / Skybound Games', 'game', 'Invincible VS', 3),
  ('tga2026:best-fighting-game:marvel-tokon-fighting-souls', 2026, 'tga2026:best-fighting-game', 'marvel-tokon-fighting-souls', 'Marvel Tōkon: Fighting Souls', 'Arc System Works / Sony Interactive Entertainment', 'game', 'Marvel Tokon: Fighting Souls', 4),
  ('tga2026:best-fighting-game:my-hero-academia-alls-justice', 2026, 'tga2026:best-fighting-game', 'my-hero-academia-alls-justice', 'My Hero Academia: All''s Justice', 'Byking / Bandai Namco Entertainment', 'game', 'My Hero Academia: All''s Justice', 5),

  -- 20. Best Family Game
  ('tga2026:best-family-game:big-walk', 2026, 'tga2026:best-family-game', 'big-walk', 'Big Walk', 'House House / Panic', 'game', 'Big Walk', 1),
  ('tga2026:best-family-game:lego-batman-legacy-of-the-dark-knight', 2026, 'tga2026:best-family-game', 'lego-batman-legacy-of-the-dark-knight', 'LEGO Batman: Legacy of the Dark Knight', 'TT Games / Warner Bros. Games', 'game', 'LEGO Batman: Legacy of the Dark Knight', 2),
  ('tga2026:best-family-game:nintendo-switch-sports-resort', 2026, 'tga2026:best-family-game', 'nintendo-switch-sports-resort', 'Nintendo Switch Sports Resort', 'Nintendo', 'game', 'Nintendo Switch Sports Resort', 3),
  ('tga2026:best-family-game:pokemon-pokopia', 2026, 'tga2026:best-family-game', 'pokemon-pokopia', 'Pokémon Pokopia', 'Game Freak / Nintendo / Koei Tecmo', 'game', 'Pokémon Pokopia', 4),
  ('tga2026:best-family-game:yoshi-and-the-mysterious-book', 2026, 'tga2026:best-family-game', 'yoshi-and-the-mysterious-book', 'Yoshi and the Mysterious Book', 'Nintendo', 'game', 'Yoshi and the Mysterious Book', 5),

  -- 21. Best Sim / Strategy Game
  ('tga2026:best-sim-strategy-game:mewgenics', 2026, 'tga2026:best-sim-strategy-game', 'mewgenics', 'Mewgenics', 'Edmund McMillen & Tyler Glaiel', 'game', 'Mewgenics', 1),
  ('tga2026:best-sim-strategy-game:planet-zoo-2', 2026, 'tga2026:best-sim-strategy-game', 'planet-zoo-2', 'Planet Zoo 2', 'Frontier Developments', 'game', 'Planet Zoo 2', 2),
  ('tga2026:best-sim-strategy-game:pokemon-pokopia', 2026, 'tga2026:best-sim-strategy-game', 'pokemon-pokopia', 'Pokémon Pokopia', 'Game Freak / Nintendo / Koei Tecmo', 'game', 'Pokémon Pokopia', 3),
  ('tga2026:best-sim-strategy-game:slay-the-spire-2', 2026, 'tga2026:best-sim-strategy-game', 'slay-the-spire-2', 'Slay the Spire 2', 'Mega Crit', 'game', 'Slay the Spire 2', 4),
  ('tga2026:best-sim-strategy-game:star-wars-zero-company', 2026, 'tga2026:best-sim-strategy-game', 'star-wars-zero-company', 'Star Wars Zero Company', 'Bit Reactor / Electronic Arts', 'game', 'Star Wars Zero Company', 5),

  -- 22. Best Sports / Racing Game
  ('tga2026:best-sports-racing-game:ea-sports-fc-27', 2026, 'tga2026:best-sports-racing-game', 'ea-sports-fc-27', 'EA Sports FC 27', 'EA Vancouver / EA Romania / EA Sports', 'game', 'EA Sports FC 27', 1),
  ('tga2026:best-sports-racing-game:forza-horizon-6', 2026, 'tga2026:best-sports-racing-game', 'forza-horizon-6', 'Forza Horizon 6', 'Playground Games / Xbox Game Studios', 'game', 'Forza Horizon 6', 2),
  ('tga2026:best-sports-racing-game:nintendo-switch-sports-resort', 2026, 'tga2026:best-sports-racing-game', 'nintendo-switch-sports-resort', 'Nintendo Switch Sports Resort', 'Nintendo', 'game', 'Nintendo Switch Sports Resort', 3),
  ('tga2026:best-sports-racing-game:screamer', 2026, 'tga2026:best-sports-racing-game', 'screamer', 'Screamer', 'Milestone', 'game', 'Screamer', 4),
  ('tga2026:best-sports-racing-game:star-wars-galactic-racer', 2026, 'tga2026:best-sports-racing-game', 'star-wars-galactic-racer', 'Star Wars: Galactic Racer', 'Fuse Games / Secret Mode', 'game', 'Star Wars: Galactic Racer', 5),

  -- 23. Best Multiplayer Game
  ('tga2026:best-multiplayer-game:big-walk', 2026, 'tga2026:best-multiplayer-game', 'big-walk', 'Big Walk', 'House House / Panic', 'game', 'Big Walk', 1),
  ('tga2026:best-multiplayer-game:call-of-duty-modern-warfare-4', 2026, 'tga2026:best-multiplayer-game', 'call-of-duty-modern-warfare-4', 'Call of Duty: Modern Warfare 4', 'Infinity Ward / Activision', 'game', 'Call of Duty: Modern Warfare 4', 2),
  ('tga2026:best-multiplayer-game:gears-of-war-e-day', 2026, 'tga2026:best-multiplayer-game', 'gears-of-war-e-day', 'Gears of War: E-Day', 'The Coalition / Xbox Game Studios', 'game', 'Gears of War: E-Day', 3),
  ('tga2026:best-multiplayer-game:marathon', 2026, 'tga2026:best-multiplayer-game', 'marathon', 'Marathon', 'Bungie / Sony Interactive Entertainment', 'game', 'Marathon', 4),
  ('tga2026:best-multiplayer-game:meccha-chameleon', 2026, 'tga2026:best-multiplayer-game', 'meccha-chameleon', 'Meccha Chameleon', 'Lemorion_1224', 'game', 'Meccha Chameleon', 5),
  ('tga2026:best-multiplayer-game:orbitals', 2026, 'tga2026:best-multiplayer-game', 'orbitals', 'Orbitals', 'Shapefarm / Kepler Interactive', 'game', 'Orbitals', 6),

  -- 24. Best Adaptation
  ('tga2026:best-adaptation:cyberpunk-edgerunners-2', 2026, 'tga2026:best-adaptation', 'cyberpunk-edgerunners-2', 'Cyberpunk: Edgerunners 2', 'Studio Trigger / CD Projekt Red / Netflix', 'adaptation', NULL, 1),
  ('tga2026:best-adaptation:fallout-season-2', 2026, 'tga2026:best-adaptation', 'fallout-season-2', 'Fallout (Season 2)', 'Kilter Films / Bethesda / Amazon MGM Studios', 'adaptation', NULL, 2),
  ('tga2026:best-adaptation:mortal-kombat-ii', 2026, 'tga2026:best-adaptation', 'mortal-kombat-ii', 'Mortal Kombat II', 'New Line Cinema / Atomic Monster / Warner Bros.', 'adaptation', NULL, 3),
  ('tga2026:best-adaptation:resident-evil-film', 2026, 'tga2026:best-adaptation', 'resident-evil-film', 'Resident Evil', 'Constantin Film / PlayStation Productions / Columbia Pictures', 'adaptation', NULL, 4),
  ('tga2026:best-adaptation:the-super-mario-galaxy-movie', 2026, 'tga2026:best-adaptation', 'the-super-mario-galaxy-movie', 'The Super Mario Galaxy Movie', 'Illumination / Nintendo / Universal Pictures', 'adaptation', NULL, 5),

  -- 25. Most Anticipated Game
  ('tga2026:most-anticipated-game:fable', 2026, 'tga2026:most-anticipated-game', 'fable', 'Fable', 'Playground Games / Xbox Game Studios', 'game', 'Fable', 1),
  ('tga2026:most-anticipated-game:final-fantasy-vii-revelation', 2026, 'tga2026:most-anticipated-game', 'final-fantasy-vii-revelation', 'Final Fantasy VII Revelation', 'Square Enix', 'game', 'Final Fantasy VII Revelation', 2),
  ('tga2026:most-anticipated-game:god-of-war-laufey', 2026, 'tga2026:most-anticipated-game', 'god-of-war-laufey', 'God of War: Laufey', 'Santa Monica Studio / Sony Interactive Entertainment', 'game', 'God of War: Laufey', 3),
  ('tga2026:most-anticipated-game:resident-evil-veronica', 2026, 'tga2026:most-anticipated-game', 'resident-evil-veronica', 'Resident Evil Veronica', 'Capcom', 'game', 'Resident Evil Veronica', 4),
  ('tga2026:most-anticipated-game:the-witcher-iv', 2026, 'tga2026:most-anticipated-game', 'the-witcher-iv', 'The Witcher IV', 'CD Projekt Red', 'game', 'The Witcher IV', 5),

  -- 26. Best User Creation
  ('tga2026:best-user-creation:a-dream-of-silence-revamped', 2026, 'tga2026:best-user-creation', 'a-dream-of-silence-revamped', 'A Dream of Silence: Revamped', 'Lizardphunk / Baldur''s Gate 3', 'user_creation', NULL, 1),
  ('tga2026:best-user-creation:create-aeronautics', 2026, 'tga2026:best-user-creation', 'create-aeronautics', 'Create Aeronautics', 'Simulated Team / Minecraft', 'user_creation', NULL, 2),
  ('tga2026:best-user-creation:nopixel-v', 2026, 'tga2026:best-user-creation', 'nopixel-v', 'NoPixel V', 'NoPixel Studios / Grand Theft Auto Online', 'user_creation', NULL, 3),
  ('tga2026:best-user-creation:star-wars-droid-tycoon', 2026, 'tga2026:best-user-creation', 'star-wars-droid-tycoon', 'Star Wars Droid Tycoon', 'FOAD / Fortnite', 'user_creation', NULL, 4),
  ('tga2026:best-user-creation:ttk', 2026, 'tga2026:best-user-creation', 'ttk', 'TTK', 'Sable Digital / Roblox', 'user_creation', NULL, 5),

  -- 27. Content Creator of the Year
  ('tga2026:content-creator-of-the-year:cdawg', 2026, 'tga2026:content-creator-of-the-year', 'cdawg', 'CDawg', 'Criador de Conteúdo', 'creator', NULL, 1),
  ('tga2026:content-creator-of-the-year:cellbit', 2026, 'tga2026:content-creator-of-the-year', 'cellbit', 'Cellbit', 'Criador de Conteúdo', 'creator', NULL, 2),
  ('tga2026:content-creator-of-the-year:ishowspeed', 2026, 'tga2026:content-creator-of-the-year', 'ishowspeed', 'iShowSpeed', 'Criador de Conteúdo', 'creator', NULL, 3),
  ('tga2026:content-creator-of-the-year:lilsimsie', 2026, 'tga2026:content-creator-of-the-year', 'lilsimsie', 'LilSimsie', 'Criadora de Conteúdo', 'creator', NULL, 4),
  ('tga2026:content-creator-of-the-year:ohnepixel', 2026, 'tga2026:content-creator-of-the-year', 'ohnepixel', 'OhnePixel', 'Criador de Conteúdo', 'creator', NULL, 5),

  -- 28. Best Esports Game
  ('tga2026:best-esports-game:counter-strike-2', 2026, 'tga2026:best-esports-game', 'counter-strike-2', 'Counter-Strike 2', 'Valve', 'game', 'Counter-Strike 2', 1),
  ('tga2026:best-esports-game:dota-2', 2026, 'tga2026:best-esports-game', 'dota-2', 'Dota 2', 'Valve', 'game', 'Dota 2', 2),
  ('tga2026:best-esports-game:league-of-legends', 2026, 'tga2026:best-esports-game', 'league-of-legends', 'League of Legends', 'Riot Games', 'game', 'League of Legends', 3),
  ('tga2026:best-esports-game:mobile-legends-bang-bang', 2026, 'tga2026:best-esports-game', 'mobile-legends-bang-bang', 'Mobile Legends: Bang Bang', 'Moonton', 'game', 'Mobile Legends: Bang Bang', 4),
  ('tga2026:best-esports-game:valorant', 2026, 'tga2026:best-esports-game', 'valorant', 'Valorant', 'Riot Games', 'game', 'Valorant', 5),

  -- 29. Best Esports Athlete
  ('tga2026:best-esports-athlete:chovy', 2026, 'tga2026:best-esports-athlete', 'chovy', 'Chovy', 'Gen.G · League of Legends', 'esports_athlete', NULL, 1),
  ('tga2026:best-esports-athlete:donk', 2026, 'tga2026:best-esports-athlete', 'donk', 'Donk', 'Team Spirit · Counter-Strike 2', 'esports_athlete', NULL, 2),
  ('tga2026:best-esports-athlete:erde', 2026, 'tga2026:best-esports-athlete', 'erde', 'Erde', 'LOUD · Valorant', 'esports_athlete', NULL, 3),
  ('tga2026:best-esports-athlete:yatoro', 2026, 'tga2026:best-esports-athlete', 'yatoro', 'Yatoro', 'Team Spirit · Dota 2', 'esports_athlete', NULL, 4),
  ('tga2026:best-esports-athlete:zywoo', 2026, 'tga2026:best-esports-athlete', 'zywoo', 'ZywOo', 'Team Vitality · Counter-Strike 2', 'esports_athlete', NULL, 5),

  -- 30. Best Esports Team
  ('tga2026:best-esports-team:geng-lol', 2026, 'tga2026:best-esports-team', 'geng-lol', 'Gen.G', 'League of Legends', 'esports_team', NULL, 1),
  ('tga2026:best-esports-team:loud-valorant', 2026, 'tga2026:best-esports-team', 'loud-valorant', 'LOUD', 'Valorant', 'esports_team', NULL, 2),
  ('tga2026:best-esports-team:team-falcons-cs2', 2026, 'tga2026:best-esports-team', 'team-falcons-cs2', 'Team Falcons (CS2)', 'Counter-Strike 2', 'esports_team', NULL, 3),
  ('tga2026:best-esports-team:team-falcons-rl', 2026, 'tga2026:best-esports-team', 'team-falcons-rl', 'Team Falcons (Rocket League)', 'Rocket League', 'esports_team', NULL, 4),
  ('tga2026:best-esports-team:team-spirit-dota2', 2026, 'tga2026:best-esports-team', 'team-spirit-dota2', 'Team Spirit', 'Dota 2', 'esports_team', NULL, 5),
  ('tga2026:best-esports-team:team-vitality-cs2', 2026, 'tga2026:best-esports-team', 'team-vitality-cs2', 'Team Vitality', 'Counter-Strike 2', 'esports_team', NULL, 6)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.goty_personal_categories (id, edition_year, slug, name, description, display_order) VALUES
  ('personal2026:meu-goty', 2026, 'meu-goty', 'Meu GOTY', 'O jogo de 2026 que definiu o seu ano — sem critérios técnicos, só coração.', 1),
  ('personal2026:melhor-narrativa', 2026, 'melhor-narrativa', 'Melhor narrativa', 'A história, os diálogos ou personagens que ficaram na sua cabeça.', 2),
  ('personal2026:melhor-direcao-de-arte', 2026, 'melhor-direcao-de-arte', 'Melhor direção de arte', 'O estilo visual, atmosfera e estética mais inesquecíveis do ano.', 3),
  ('personal2026:melhor-trilha-sonora', 2026, 'melhor-trilha-sonora', 'Melhor trilha sonora', 'As músicas que você continuou ouvindo mesmo longe do controle.', 4),
  ('personal2026:melhor-gameplay', 2026, 'melhor-gameplay', 'Melhor gameplay', 'O jogo mais gostoso de jogar, explorar ou dominar mecânica por mecânica.', 5),
  ('personal2026:maior-surpresa', 2026, 'maior-surpresa', 'Maior surpresa do ano', 'Aquele título de 2026 que você não esperava tanto e te conquistou de vez.', 6),
  ('personal2026:melhor-multiplayer', 2026, 'melhor-multiplayer', 'Melhor experiência multiplayer', 'O jogo que rendeu as melhores noites em grupo, co-op ou partidas online.', 7),
  ('personal2026:jogo-que-mais-marcou', 2026, 'jogo-que-mais-marcou', 'Jogo que mais me marcou', 'A memória emocional mais forte que 2026 deixou na sua estante.', 8),
  ('personal2026:maior-decepcao', 2026, 'maior-decepcao', 'Maior decepção do ano', 'Aquele lançamento de 2026 que prometeu muito e não entregou o que você esperava.', 9)
ON CONFLICT (id) DO NOTHING;
