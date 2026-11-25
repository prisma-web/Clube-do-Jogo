import { rpcArgsAcceptingNull, type ApiUntrustedBody } from '@clube-do-jogo/data';
import { contractJson } from '@/lib/api-route';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { dispatchPushNotification, isPushConfigured } from '@/lib/push';
import { ACTIVE_RANKING_FORMULA, compareRankingItems, rankingScore } from '@/lib/ranking';
import { byChoice } from '@clube-do-jogo/domain';

const json = contractJson<'pushRankingLeader'>();

type RequestBody = ApiUntrustedBody<'pushRankingLeader'>;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'Nao autorizado.' }, { status: 401 });

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Pedido invalido.' }, { status: 400 });
  }
  const voteMonth = typeof body.voteMonth === 'string' ? body.voteMonth : '';
  const previousLeaderId = typeof body.previousLeaderId === 'string' ? body.previousLeaderId : null;
  const expectedLeaderId = typeof body.leaderId === 'string' ? body.leaderId : null;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(voteMonth)) return json({ error: 'Mes invalido.' }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return json({ sent: 0, configured: false });
  if (!isPushConfigured() && !process.env.EXPO_PROJECT_ID) {
    return json({ sent: 0, configured: false, native: { queued: 0, configured: false } });
  }
  const { data: votes, error: votesError } = await admin.from('votes').select('game_id, choice').eq('vote_month', voteMonth);
  if (votesError) return json({ error: 'Nao foi possivel carregar os votos.' }, { status: 500 });
  const gameIds = Array.from(new Set((votes || []).map(vote => vote.game_id)));
  if (!gameIds.length) {
    await admin.rpc('claim_ranking_leader_notification', rpcArgsAcceptingNull<
      'claim_ranking_leader_notification',
      'expected_previous_leader_id' | 'new_leader_id'
    >({ target_vote_month: voteMonth, expected_previous_leader_id: previousLeaderId, new_leader_id: null }));
    return json({ sent: 0, changed: false });
  }

  const [{ data: games, error: gamesError }, { data: completed, error: completedError }] = await Promise.all([
    admin.from('games').select('id, title, duration_hours, average_rating').in('id', gameIds),
    admin.from('game_progress').select('game_id').eq('status', 'finished').in('game_id', gameIds),
  ]);
  if (gamesError || completedError) return json({ error: 'Nao foi possivel calcular o ranking.' }, { status: 500 });

  const leader = (games || []).map(game => {
    const gameVotes = (votes || []).filter(vote => vote.game_id === game.id);
    const completedCount = (completed || []).filter(progress => progress.game_id === game.id).length;
    const choiceCounts = byChoice(choice => gameVotes.filter(vote => vote.choice === choice).length);
    return { game, choiceCounts, totalPoints: rankingScore(ACTIVE_RANKING_FORMULA, game, choiceCounts, completedCount) };
  }).sort(compareRankingItems)[0]?.game;
  if (!leader || (expectedLeaderId && expectedLeaderId !== leader.id)) return json({ sent: 0, changed: false });

  const { data: changed, error: stateError } = await admin.rpc('claim_ranking_leader_notification', rpcArgsAcceptingNull<
    'claim_ranking_leader_notification',
    'expected_previous_leader_id'
  >({
    target_vote_month: voteMonth,
    expected_previous_leader_id: previousLeaderId,
    new_leader_id: leader.id,
  }));
  if (stateError) return json({ error: 'Nao foi possivel registrar a lideranca.' }, { status: 500 });
  const eventKey = `ranking-leader:${voteMonth}:${leader.id}`;
  if (!changed) {
    if (previousLeaderId && previousLeaderId !== leader.id) {
      const retry = await dispatchPushNotification(admin, eventKey, {
        title: 'Lideranca alterada',
        body: `${leader.title} tomou a liderança no ranking!`,
        url: '/ranking',
        tag: `ranking-leader:${voteMonth}`,
      }, undefined, undefined, false);
      return json({ ...retry, changed: false });
    }
    return json({ sent: 0, configured: isPushConfigured(), native: { queued: 0, configured: Boolean(process.env.EXPO_PROJECT_ID) }, changed: false });
  }

  const result = await dispatchPushNotification(admin, eventKey, {
    title: 'Lideranca alterada',
    body: `${leader.title} tomou a liderança no ranking!`,
    url: '/ranking',
    tag: `ranking-leader:${voteMonth}`,
  }, undefined, undefined, isPushConfigured());
  return json({ ...result, changed: true });
}
