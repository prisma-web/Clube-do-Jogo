import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { dispatchPushNotification } from '@/lib/push';

type CommentRequest = { commentId?: unknown };

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 });

  let body: CommentRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Pedido invalido.' }, { status: 400 });
  }
  const commentId = typeof body.commentId === 'string' ? body.commentId : '';
  if (!commentId) return NextResponse.json({ error: 'Comentario invalido.' }, { status: 400 });

  const { data: comment } = await supabase.from('club_comments').select('id, user_id, game_id, club_month, body').eq('id', commentId).eq('user_id', user.id).maybeSingle();
  if (!comment) return NextResponse.json({ error: 'Comentario nao encontrado.' }, { status: 404 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ sent: 0, configured: false });

  const [{ data: game }, { data: author }] = await Promise.all([
    admin.from('games').select('title').eq('id', comment.game_id).maybeSingle(),
    admin.from('profiles').select('name').eq('id', user.id).maybeSingle(),
  ]);

  const gameTitle = game?.title || 'o jogo do mes';
  const authorName = author?.name || 'Um membro';
  const preview = comment.body.replace(/\s+/g, ' ').trim().slice(0, 120);
  const result = await dispatchPushNotification(admin, `comment:${comment.id}`, {
    title: `Novo comentario em ${gameTitle}`,
    body: preview ? `${authorName}: ${preview}${comment.body.length > preview.length ? '...' : ''}` : `${authorName} comentou na timeline.`,
    url: '/jogo-do-mes?section=timeline',
    tag: `comment:${comment.game_id}:${comment.club_month}`,
  }, undefined, user.id);
  return NextResponse.json(result);
}
