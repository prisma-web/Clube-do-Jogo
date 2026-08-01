'use client';

import { useMemo, useState } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { CalendarCheck2, CalendarClock, CheckCircle2, ChevronDown, Circle, PlayCircle, Star } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { demoProgress, demoProfiles } from '@/lib/demo-data';
import type { Game, GameProgress, ProgressStatus, Profile, RatingCriterion, RatingDetails, RatingMode } from '@/lib/types';
import { formatFinishedCount, formatShortDate } from '@/lib/utils';
import { transitionProgress } from '@/lib/progress';
import { useStaleQuery } from '@/hooks/use-stale-query';
import { useApp } from './app-provider';
import { Avatar } from './ui/avatar';
import { ListSkeleton } from './ui/skeleton';
import { RatingSlider, RatingStars } from './rating-slider';
import { ProgressConfirmationDialog } from './progress-confirmation-dialog';

const statusMeta: Record<ProgressStatus, { label: string; icon: typeof Circle; color: string }> = {
  not_started: { label: 'Não iniciado', icon: Circle, color: 'text-zinc-500' },
  started: { label: 'Comecei', icon: PlayCircle, color: 'text-sky-400' },
  finished: { label: 'Finalizado', icon: CheckCircle2, color: 'text-emerald-400' },
};

const detailCriteria: Array<{ key: RatingCriterion; label: string }> = [
  { key: 'graphics', label: 'Gráficos' },
  { key: 'gameplay', label: 'Gameplay' },
  { key: 'story', label: 'História' },
  { key: 'music', label: 'Música' },
  { key: 'fun', label: 'Diversão' },
];

function formatRating(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function detailsFrom(value: RatingDetails | null | undefined, fallback: number): RatingDetails {
  return Object.fromEntries(detailCriteria.map(({ key }) => {
    const stored = value?.[key];
    if (stored === null) return [key, null];
    return [key, typeof stored === 'number' && Number.isFinite(stored) ? stored : fallback];
  })) as RatingDetails;
}

function detailsAverage(details: RatingDetails) {
  const values = detailCriteria
    .map(({ key }) => details[key])
    .filter((value): value is number => typeof value === 'number');
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function ProgressList({ game, snapshotMonth }: { game: Game; snapshotMonth?: string }) {
  const supabase = useMemo(() => createClient(), []);
  const { user, isDemo, runOptimistic, notify } = useApp();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<ProgressStatus | null>(null);
  const query = useStaleQuery<GameProgress[]>(`progress:${game.id}:${snapshotMonth || 'latest'}`, async () => {
    if (isDemo) return demoProgress.map(item => ({ ...item, game_id: game.id }));
    if (snapshotMonth) {
      const { data, error } = await supabase
        .from('cycle_progress_snapshots')
        .select('*, profile:profiles!cycle_progress_snapshots_user_id_fkey (id, name, avatar_url)')
        .eq('cycle_month', snapshotMonth)
        .eq('game_id', game.id);
      if (error) throw error;
      return (data || []) as unknown as GameProgress[];
    }
    const [{ data: profiles, error: profilesError }, { data: progress, error: progressError }] = await Promise.all([
      supabase.from('profiles').select('id, name, avatar_url').order('name'),
      supabase.from('game_progress').select('*').eq('game_id', game.id),
    ]);
    if (profilesError) throw profilesError;
    if (progressError) throw progressError;
    const progressMap = new Map((progress || []).map(item => [item.user_id, item]));
    return (profiles as Profile[]).map(profile => ({
      id: progressMap.get(profile.id)?.id || `new-${profile.id}`,
      user_id: profile.id,
      game_id: game.id,
      status: (progressMap.get(profile.id)?.status || 'not_started') as ProgressStatus,
      rating: progressMap.get(profile.id)?.rating ?? null,
      rating_mode: (progressMap.get(profile.id)?.rating_mode || 'simple') as RatingMode,
      rating_details: progressMap.get(profile.id)?.rating_details || null,
      started_at: progressMap.get(profile.id)?.started_at || null,
      finished_at: progressMap.get(profile.id)?.finished_at || null,
      profile,
    }));
  });
  const progress = query.data || [];
  const [progressParent] = useAutoAnimate<HTMLDivElement>({ duration: 160, easing: 'cubic-bezier(.22, 1, .36, 1)' });
  const mine = progress.find(item => item.user_id === user!.id);
  const ratedProgress = progress.filter(item => item.rating !== null);
  const clubAverage = ratedProgress.length ? ratedProgress.reduce((total, item) => total + Number(item.rating), 0) / ratedProgress.length : null;

  async function updateStatus(status: ProgressStatus) {
    if (snapshotMonth) return;
    const existing = progress.find(item => item.user_id === user!.id);
    const now = new Date().toISOString();
    const values = transitionProgress(existing, status, now);
    const next: GameProgress = existing ? {
      ...existing,
      ...values,
    } : {
      id: crypto.randomUUID(), user_id: user!.id, game_id: game.id,
      ...values,
      profile: demoProfiles[0],
    };
    const nextProgress = progress.some(item => item.user_id === user!.id) ? progress.map(item => item.user_id === user!.id ? next : item) : [next, ...progress];
    if (isDemo) query.setData(nextProgress);
    else await runOptimistic('Atualizando progresso…', () => query.setData(nextProgress), () => query.setData(progress), () => supabase.from('game_progress').upsert({ user_id: user!.id, game_id: game.id, status: next.status, rating: next.rating, rating_mode: next.rating_mode, rating_details: next.rating_details, started_at: next.started_at, finished_at: next.finished_at, updated_at: now }, { onConflict: 'user_id,game_id' }));
  }

  async function saveRating(rating: number, mode: RatingMode, details: RatingDetails | null) {
    if (snapshotMonth) return;
    const next = progress.map(item => item.user_id === user!.id ? { ...item, rating, rating_mode: mode, rating_details: details } : item);
    if (isDemo) {
      query.setData(next);
      notify('Nota atualizada');
      return;
    }
    const saved = await runOptimistic('Salvando nota…', () => query.setData(next), () => query.setData(progress), () => supabase.from('game_progress').update({ rating, rating_mode: mode, rating_details: details, updated_at: new Date().toISOString() }).eq('user_id', user!.id).eq('game_id', game.id));
    if (saved) notify('Nota atualizada');
  }

  function setDetailedMode(enabled: boolean) {
    if (!mine) return;
    if (!enabled) {
      void saveRating(mine.rating ?? 5, 'simple', null);
      return;
    }
    let details = detailsFrom(mine.rating_details, mine.rating ?? 5);
    if (!detailCriteria.some(({ key }) => details[key] !== null)) details = detailsFrom(null, mine.rating ?? 5);
    void saveRating(detailsAverage(details), 'detailed', details);
  }

  function setCriterion(key: RatingCriterion, value: number | null) {
    if (!mine) return;
    const details = { ...detailsFrom(mine.rating_details, mine.rating ?? 5), [key]: value };
    void saveRating(detailsAverage(details), 'detailed', details);
  }

  const myDetails = detailsFrom(mine?.rating_details, mine?.rating ?? 5);
  const enabledCriteria = detailCriteria.filter(({ key }) => myDetails[key] !== null).length;

  return (
    <div className="space-y-4">
      <section className="progress-status-card rounded-2xl border border-white/8 bg-white/[0.025] p-4">
        <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-extrabold">Meu progresso</h2>{mine && <span className={`text-xs font-bold ${statusMeta[mine.status].color}`}>{statusMeta[mine.status].label}</span>}</div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {(Object.keys(statusMeta) as ProgressStatus[]).map(status => { const MetaIcon = statusMeta[status].icon; return <button key={status} disabled={Boolean(snapshotMonth) || mine?.status === status} data-selected={mine?.status === status} onClick={() => setPendingStatus(status)} className={`progress-status-option flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border px-1 py-3 text-[10px] font-bold transition disabled:cursor-default ${mine?.status === status ? 'border-violet-400/35 bg-violet-500/15 text-violet-200' : 'border-white/8 bg-white/[0.025] text-zinc-500 enabled:hover:bg-white/5'}`}><MetaIcon className="size-4" /><span className="max-w-full truncate whitespace-nowrap">{statusMeta[status].label}</span></button>; })}
        </div>
        {mine?.status === 'finished' && <div className="mt-4 space-y-4 border-t border-white/8 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><span className="block text-xs font-bold text-zinc-400">Minha nota</span><span className="mt-0.5 block text-[10px] text-zinc-600">de 0 a 10</span></div>{mine.rating_mode === 'detailed' && <span className="text-sm font-black tabular-nums text-amber-300">{formatRating(mine.rating ?? 0)}</span>}</div>
          {mine.rating_mode !== 'detailed' && <RatingSlider value={mine.rating ?? 5} disabled={Boolean(snapshotMonth)} label="Minha nota" onCommit={rating => void saveRating(rating, 'simple', null)} />}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-3"><div><span className="block text-xs font-bold text-zinc-400">Média do clube</span><span className="mt-0.5 block text-[10px] text-zinc-600">{ratedProgress.length ? `${ratedProgress.length} ${ratedProgress.length === 1 ? 'avaliação' : 'avaliações'}` : 'Ainda sem avaliações'}</span></div>{clubAverage !== null && <span className="inline-flex items-center gap-2"><RatingStars value={clubAverage} /><strong className="text-sm tabular-nums text-amber-300">{formatRating(clubAverage)}</strong></span>}</div>
          <button type="button" onClick={() => setDetailsOpen(open => !open)} className="flex w-full items-center justify-between rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2.5 text-xs font-bold text-zinc-300 transition hover:bg-white/[0.055]"><span>Nota detalhada</span><ChevronDown className={`size-4 text-zinc-500 transition ${detailsOpen ? 'rotate-180' : ''}`} /></button>
          {detailsOpen && <div className="space-y-3 rounded-xl border border-white/8 bg-black/15 p-3">
            <label className="flex items-center justify-between gap-3 text-xs font-bold text-zinc-300"><span>Usar nota detalhada</span><input type="checkbox" checked={mine.rating_mode === 'detailed'} disabled={Boolean(snapshotMonth)} onChange={event => setDetailedMode(event.target.checked)} className="size-4 accent-violet-500" /></label>
            <div className="space-y-3 border-t border-white/8 pt-3">
              {detailCriteria.map(({ key, label }) => {
                const value = myDetails[key];
                const enabled = value !== null;
                return <div key={key} className="space-y-2"><div className="flex items-center justify-between gap-3"><span className={`text-xs font-bold ${enabled ? 'text-zinc-300' : 'text-zinc-600'}`}>{label}</span><label className="inline-flex items-center gap-2 text-[10px] font-bold text-zinc-500"><span>Incluir</span><input type="checkbox" checked={enabled} disabled={Boolean(snapshotMonth) || mine.rating_mode !== 'detailed' || (enabled && enabledCriteria <= 1)} onChange={event => setCriterion(key, event.target.checked ? mine.rating ?? 5 : null)} className="size-3.5 accent-violet-500" /></label></div><RatingSlider value={value ?? 0} disabled={!enabled || mine.rating_mode !== 'detailed' || Boolean(snapshotMonth)} label={`Nota de ${label}`} onCommit={nextValue => setCriterion(key, nextValue)} /></div>;
              })}
            </div>
          </div>}
        </div>}
      </section>

      <section className="club-progress-card rounded-2xl border border-white/8 bg-white/[0.025] p-4"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-extrabold">Progresso do clube</h2><span className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">{formatFinishedCount(progress.filter(item => item.status === 'finished').length)}</span></div>
      {query.isInitialLoading ? <ListSkeleton count={4} /> : <div ref={progressParent} className="space-y-2">{progress.map(item => {
        const meta = statusMeta[item.status];
        const Icon = meta.icon;
        return <article key={item.user_id} className="progress-person flex min-w-0 items-center gap-3 rounded-xl border border-white/[0.07] bg-black/[0.12] p-3"><Avatar src={item.profile?.avatar_url} name={item.profile?.name} className="size-10" /><div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2"><span className="truncate text-xs font-extrabold">{item.profile?.name || 'Membro'}</span>{item.rating !== null && <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-amber-400"><Star className="size-3 fill-current" />{formatRating(Number(item.rating))}</span>}</div><div className="mt-1.5 flex min-w-0 flex-wrap gap-x-3 gap-y-1.5 text-[10px] font-semibold text-zinc-500">{item.started_at && <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><CalendarClock className="size-3.5 text-sky-400" />{formatShortDate(item.started_at)}</span>}{item.finished_at && <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><CalendarCheck2 className="size-3.5 text-emerald-400" />{formatShortDate(item.finished_at)}</span>}</div></div><span className={`inline-flex shrink-0 items-center gap-1 text-[10px] font-bold ${meta.color}`}><Icon className="size-3.5" /><span className="hidden min-[360px]:inline">{meta.label}</span></span></article>;
      })}</div>}</section>
      <ProgressConfirmationDialog open={pendingStatus !== null} onOpenChange={open => { if (!open) setPendingStatus(null); }} game={game} currentStatus={mine?.status || 'not_started'} targetStatus={pendingStatus || 'not_started'} onConfirm={() => { if (pendingStatus) void updateStatus(pendingStatus); setPendingStatus(null); }} />
    </div>
  );
}
