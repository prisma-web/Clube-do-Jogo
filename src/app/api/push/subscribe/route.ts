import type { ApiUntrustedBody } from '@clube-do-jogo/data';
import { contractJson } from '@/lib/api-route';
import { createRequestContext } from '@/lib/supabase/server';

const json = contractJson<'pushSubscribe'>();

type PushSubscriptionPayload = ApiUntrustedBody<'pushSubscribe'>;

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
  const { supabase, userId } = await createRequestContext({ checkRevocation: true });
  if (!userId) return json({ error: 'Nao autorizado.' }, { status: 401 });

  let body: PushSubscriptionPayload;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Assinatura invalida.' }, { status: 400 });
  }

  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
  const p256dh = typeof body.keys?.p256dh === 'string' ? body.keys.p256dh : '';
  const auth = typeof body.keys?.auth === 'string' ? body.keys.auth : '';
  if (!endpoint || !p256dh || !auth) return json({ error: 'Assinatura invalida.' }, { status: 400 });
  if (!isAllowedEndpoint(endpoint)) return json({ error: 'Endpoint de push nao permitido.' }, { status: 400 });

  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id: userId, endpoint, p256dh, auth, updated_at: new Date().toISOString() },
    { onConflict: 'endpoint' },
  );
  if (error) return json({ error: 'Nao foi possivel salvar a assinatura.' }, { status: 500 });
  return json({ ok: true });
}
