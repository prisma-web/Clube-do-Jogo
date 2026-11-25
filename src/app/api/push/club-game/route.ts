import type { ApiUntrustedBody } from '@clube-do-jogo/data';
import { contractJson } from '@/lib/api-route';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestContext } from '@/lib/supabase/server';
import { dispatchPushNotification, formatPushMonth, isAdminUser, isPushConfigured } from '@/lib/push';

const json = contractJson<'pushClubGame'>();

type RequestBody = ApiUntrustedBody<'pushClubGame'>;

export async function POST(request: Request) {
  const { userId } = await createRequestContext({ checkRevocation: true });
  if (!userId) return json({ error: 'Nao autorizado.' }, { status: 401 });

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Pedido invalido.' }, { status: 400 });
  }
  const gameId = typeof body.gameId === 'string' ? body.gameId : '';
  const month = typeof body.month === 'string' ? body.month : '';
  if (!gameId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return json({ error: 'Dados invalidos.' }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return json({ sent: 0, configured: false });
  if (!await isAdminUser(admin, userId)) return json({ error: 'Nao autorizado.' }, { status: 403 });

  const { data: cycle } = await admin.from('club_months').select('game_id').eq('month', month).eq('status', 'active').maybeSingle();
  if (!cycle || cycle.game_id !== gameId) return json({ sent: 0, changed: false });
  const { data: game } = await admin.from('games').select('title').eq('id', gameId).maybeSingle();
  const gameTitle = game?.title || 'O novo jogo';
  const eventKey = `club-game:${month}:${gameId}`;
  let sendWeb = isPushConfigured();
  let duplicateWebClaim = false;
  if (sendWeb) {
    const claim = await admin.from('push_notification_deliveries').insert({ event_key: eventKey, user_id: userId });
    if (claim.error?.code === '23505') {
      duplicateWebClaim = true;
      sendWeb = false;
    } else if (claim.error) {
      await dispatchPushNotification(admin, eventKey, {
        title: 'Novo jogo do mes',
        body: `${gameTitle} é o jogo de ${formatPushMonth(month)}!`,
        url: '/jogo-do-mes',
        tag: `club-game:${month}`,
      }, undefined, undefined, false);
      return json({ error: 'Nao foi possivel registrar a notificacao.' }, { status: 500 });
    }
  }
  const result = await dispatchPushNotification(admin, eventKey, {
    title: 'Novo jogo do mes',
    body: `${gameTitle} é o jogo de ${formatPushMonth(month)}!`,
    url: '/jogo-do-mes',
    tag: `club-game:${month}`,
  }, undefined, undefined, sendWeb);
  return json(duplicateWebClaim ? { ...result, changed: false } : result);
}
