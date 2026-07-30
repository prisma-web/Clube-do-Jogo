import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type PushSubscriptionPayload = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 });

  let body: PushSubscriptionPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Assinatura invalida.' }, { status: 400 });
  }

  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
  const p256dh = typeof body.keys?.p256dh === 'string' ? body.keys.p256dh : '';
  const auth = typeof body.keys?.auth === 'string' ? body.keys.auth : '';
  if (!endpoint || !p256dh || !auth) return NextResponse.json({ error: 'Assinatura invalida.' }, { status: 400 });

  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id: user.id, endpoint, p256dh, auth, updated_at: new Date().toISOString() },
    { onConflict: 'endpoint' },
  );
  if (error) return NextResponse.json({ error: 'Nao foi possivel salvar a assinatura.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
