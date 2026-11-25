DO $$
DECLARE
  cycle_status TEXT;
BEGIN
  SELECT status INTO cycle_status
  FROM public.club_months
  WHERE month = '2026-08';

  IF cycle_status IS NULL THEN
    RAISE EXCEPTION 'O ciclo de 2026-08 não foi encontrado';
  END IF;

  IF cycle_status <> 'active'
     AND NOT EXISTS (
       SELECT 1 FROM public.club_rewards
       WHERE code = '2026-08-theme-cosmic-campfire'
     ) THEN
    RAISE EXCEPTION 'O ciclo de 2026-08 já foi encerrado sem a recompensa cadastrada';
  END IF;
END;
$$;

INSERT INTO public.club_rewards (
  club_month,
  code,
  kind,
  name,
  description,
  theme_id
)
VALUES (
  '2026-08',
  '2026-08-theme-cosmic-campfire',
  'theme',
  'Tema Fogueira Cósmica',
  'Uma fogueira sob um sistema solar inquieto, para exploradores que chegaram ao fim do ciclo.',
  'cosmic-campfire'
)
ON CONFLICT (code) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.club_rewards
    WHERE club_month = '2026-08'
      AND code = '2026-08-theme-cosmic-campfire'
      AND kind = 'theme'
      AND name = 'Tema Fogueira Cósmica'
      AND theme_id = 'cosmic-campfire'
  ) THEN
    RAISE EXCEPTION 'A recompensa Fogueira Cósmica conflita com um registro existente';
  END IF;
END;
$$;
