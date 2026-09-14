import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { dispatchPushNotification, isAdminUser, isPushConfigured } from '@/lib/push';

type RequestBody = { clubMonth?: unknown };

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 });

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Pedido invalido.' }, { status: 400 });
  }
  const clubMonth = typeof body.clubMonth === 'string' ? body.clubMonth : '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(clubMonth)) return NextResponse.json({ error: 'Mes invalido.' }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ sent: 0, configured: false });
  if (!await isAdminUser(admin, user.id)) return NextResponse.json({ error: 'Nao autorizado.' }, { status: 403 });

  const { data: rewards, error: rewardsError } = await admin.from('club_rewards').select('id').eq('club_month', clubMonth);
  if (rewardsError) return NextResponse.json({ error: 'Nao foi possivel carregar recompensas.' }, { status: 500 });
  const rewardIds = (rewards || []).map(reward => reward.id);
  if (!rewardIds.length) return NextResponse.json({ sent: 0 });
  const { data: grants, error: grantsError } = await admin.from('user_reward_grants').select('id, user_id').in('reward_id', rewardIds);
  if (grantsError) return NextResponse.json({ error: 'Nao foi possivel carregar recompensas distribuidas.' }, { status: 500 });

  let sent = 0;
  let queued = 0;
  let nativeError = false;
  for (const grant of grants || []) {
    const eventKey = `reward:${grant.id}`;
    let sendWeb = isPushConfigured();
    if (sendWeb) {
      const claim = await admin.from('push_notification_deliveries').insert({ event_key: eventKey, user_id: grant.user_id });
      if (claim.error?.code === '23505') sendWeb = false;
      else if (claim.error) {
        await dispatchPushNotification(admin, eventKey, {
          title: 'Nova recompensa',
          body: 'Você tem uma nova recompensa!',
          url: '/perfil',
          tag: eventKey,
        }, [grant.user_id], undefined, false);
        return NextResponse.json({ error: 'Nao foi possivel registrar a notificacao.' }, { status: 500 });
      }
    }
    const result = await dispatchPushNotification(admin, eventKey, {
      title: 'Nova recompensa',
      body: 'Você tem uma nova recompensa!',
      url: '/perfil',
      tag: `reward:${grant.id}`,
    }, [grant.user_id], undefined, sendWeb);
    sent += result.sent;
    queued += result.native.queued;
    nativeError ||= 'error' in result.native;
  }
  return NextResponse.json({
    sent,
    configured: isPushConfigured(),
    native: {
      queued,
      configured: Boolean(process.env.EXPO_PROJECT_ID),
      ...(nativeError ? { error: 'native_enqueue_failed' } : {}),
    },
  });
}
