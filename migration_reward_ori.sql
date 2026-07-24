-- Recompensa cosmética do ciclo de julho de 2026.
-- Execute depois de migration_rewards.sql e durante o ciclo ativo.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.club_months
    WHERE month = '2026-07' AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'O ciclo ativo de 2026-07 não foi encontrado';
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
  '2026-07',
  '2026-07-theme-ori',
  'theme',
  'Tema Floresta de Nibel',
  'Uma floresta noturna iluminada por espíritos e vida bioluminescente.',
  'ori'
)
ON CONFLICT (code) DO NOTHING;
