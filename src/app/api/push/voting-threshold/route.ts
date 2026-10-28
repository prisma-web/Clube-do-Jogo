import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { dispatchPushNotification } from '@/lib/push';

type RequestBody = { action?: unknown; voteMonth?: unknown; gameId?: unknown };
type ThresholdRecipient = {
  recipient_user_id: string;
  notification_sequence: number;
};

function validMonth(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

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
  if (!validMonth(body.voteMonth)) return NextResponse.json({ error: 'Mes invalido.' }, { status: 400 });
  const action = body.action;

  if (action === 'opened' || action === 'closed') {
    const rpc = action === 'opened' ? 'open_vote_threshold_notification' : 'complete_vote_threshold_notification';
    const { data, error } = await supabase.rpc(rpc, { target_vote_month: body.voteMonth });
    if (error) return NextResponse.json({ error: 'Nao foi possivel atualizar o aviso.' }, { status: 500 });
    return NextResponse.json({ changed: Boolean(data) });
  }

  const gameId = typeof body.gameId === 'string' ? body.gameId : '';
  if (action !== 'vote-saved' || !gameId) return NextResponse.json({ error: 'Dados invalidos.' }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ sent: 0, configured: false });

  // Only a game's first vote can add it to the voting pool. Calls for ordinary
  // vote changes are intentionally harmless and do not create a notification.
  const { data: votes, error: votesError } = await admin.from('votes')
    .select('user_id, created_at')
    .eq('vote_month', body.voteMonth)
    .eq('game_id', gameId)
    .order('created_at', { ascending: true });
  if (votesError) return NextResponse.json({ error: 'Nao foi possivel validar o jogo.' }, { status: 500 });
  if (!votes?.length || votes[0].user_id !== user.id) return NextResponse.json({ sent: 0, changed: false });

  const { data: recipients, error: recipientsError } = await admin.rpc('claim_vote_threshold_notifications', {
    target_vote_month: body.voteMonth,
    source_user_id: user.id,
  });
  if (recipientsError) return NextResponse.json({ error: 'Nao foi possivel registrar os avisos.' }, { status: 500 });

  const thresholdRecipients = (recipients || []) as ThresholdRecipient[];
  const results = await Promise.all(thresholdRecipients.map(async recipient => {
    const recipientId = recipient.recipient_user_id;
    const sequence = Number(recipient.notification_sequence);
    return dispatchPushNotification(admin, `vote-threshold:${body.voteMonth}:${recipientId}:${sequence}`, {
      title: 'Novos jogos entraram na votação',
      body: 'Dê sua opinião.',
      url: '/ranking',
      tag: `vote-threshold:${body.voteMonth}`,
    }, [recipientId]);
  }));
  return NextResponse.json({ changed: results.length > 0, recipients: results.length, deliveries: results });
}
