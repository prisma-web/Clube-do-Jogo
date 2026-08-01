import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

type CommentRequest = { commentId?: unknown };
type PushSubscription = { id: string; endpoint: string; p256dh: string; auth: string };

function notificationErrorStatus(error: unknown) {
  return typeof error === 'object' && error && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : null;
}

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
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;
  if (!admin || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) return NextResponse.json({ sent: 0, configured: false });

  const [{ data: subscriptions, error: subscriptionsError }, { data: game }, { data: author }] = await Promise.all([
    admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').neq('user_id', user.id),
    admin.from('games').select('title').eq('id', comment.game_id).maybeSingle(),
    admin.from('profiles').select('name').eq('id', user.id).maybeSingle(),
  ]);
  if (subscriptionsError) return NextResponse.json({ error: 'Nao foi possivel carregar as assinaturas.' }, { status: 500 });
  if (!subscriptions?.length) return NextResponse.json({ sent: 0, configured: true });

  try {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  } catch (error) {
    console.error('Configuracao VAPID invalida:', error);
    return NextResponse.json({ sent: 0, configured: false });
  }
  const gameTitle = game?.title || 'o jogo do mes';
  const authorName = author?.name || 'Um membro';
  const preview = comment.body.replace(/\s+/g, ' ').trim().slice(0, 120);
  const payload = JSON.stringify({
    title: `Novo comentario em ${gameTitle}`,
    body: preview ? `${authorName}: ${preview}${comment.body.length > preview.length ? '...' : ''}` : `${authorName} comentou na timeline.`,
    url: '/jogo-do-mes?section=timeline',
    tag: `comment:${comment.game_id}:${comment.club_month}`,
  });

  const results = await Promise.allSettled((subscriptions as PushSubscription[]).map(subscription => webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, { TTL: 60 * 60 * 24 })));
  const expiredIds = results.flatMap((result, index) => {
    const status = result.status === 'rejected' ? notificationErrorStatus(result.reason) : null;
    return status === 404 || status === 410 ? [(subscriptions as PushSubscription[])[index].id] : [];
  });
  if (expiredIds.length) await admin.from('push_subscriptions').delete().in('id', expiredIds);
  return NextResponse.json({ sent: results.filter(result => result.status === 'fulfilled').length, configured: true });
}
