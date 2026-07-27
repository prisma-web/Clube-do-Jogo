-- Timeline: comentarios compartilhados e atualizados em tempo real.
-- Execute uma vez no SQL Editor do Supabase.

ALTER TABLE public.club_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Criar comentario no mes atual" ON public.club_comments;
DROP POLICY IF EXISTS "Criar comentario no ciclo ativo" ON public.club_comments;
CREATE POLICY "Criar comentario no ciclo ativo" ON public.club_comments
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.club_months cycle
    WHERE cycle.month = club_comments.club_month
      AND cycle.game_id = club_comments.game_id
      AND cycle.status = 'active'
  )
);

DROP POLICY IF EXISTS "Criar reacao no mes atual" ON public.comment_reactions;
DROP POLICY IF EXISTS "Criar reacao no ciclo ativo" ON public.comment_reactions;
CREATE POLICY "Criar reacao no ciclo ativo" ON public.comment_reactions
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.club_comments timeline_comment
    JOIN public.club_months cycle
      ON cycle.month = timeline_comment.club_month
      AND cycle.game_id = timeline_comment.game_id
    WHERE timeline_comment.id = comment_reactions.comment_id
      AND timeline_comment.game_id = comment_reactions.game_id
      AND timeline_comment.club_month = comment_reactions.club_month
      AND cycle.status = 'active'
  )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'club_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.club_comments;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'comment_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.comment_reactions;
  END IF;
END;
$$;
