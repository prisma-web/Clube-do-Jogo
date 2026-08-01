import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type PushSubscriptionPayload = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };

// Hosts dos serviços de push dos navegadores. O endpoint é usado depois pelo
// client admin (service-role) para enviar notificações, então restringimos os
// destinos permitidos para evitar SSRF cego contra a rede interna.
const ALLOWED_PUSH_HOSTS = [
  'android.googleapis.com',
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'updates-autopush.stage.mozaws.net',
  'updates-autopush.dev.mozaws.net',
  '.notify.windows.com',
  '.push.apple.com',
];

function isAllowedEndpoint(endpoint: string) {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  return ALLOWED_PUSH_HOSTS.some(host => host.startsWith('.') ? url.hostname.endsWith(host) : url.hostname === host);
}

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
  if (!isAllowedEndpoint(endpoint)) return NextResponse.json({ error: 'Endpoint de push nao permitido.' }, { status: 400 });

  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id: user.id, endpoint, p256dh, auth, updated_at: new Date().toISOString() },
    { onConflict: 'endpoint' },
  );
  if (error) return NextResponse.json({ error: 'Nao foi possivel salvar a assinatura.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
