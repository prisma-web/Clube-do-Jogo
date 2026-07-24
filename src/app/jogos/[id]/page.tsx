'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tabs from '@radix-ui/react-tabs';
import { CalendarDays, CheckCircle2, ChevronDown, Clock3, Flag, Gamepad2, ImageIcon, LayoutDashboard, ListChecks, NotebookPen, Share2, Star, ThumbsUp, Trash2, UsersRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { demoRanking } from '@/lib/demo-data';
import { fetchGame, fetchUserPlatforms } from '@/lib/data';
import type { Profile, UserPlatform } from '@/lib/types';
import { shiftMonth, youtubeEmbedUrl } from '@/lib/utils';
import { useStaleQuery } from '@/hooks/use-stale-query';
import { useApp } from '@/components/app-provider';
import { ParticipantsDialog } from '@/components/participants-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar } from '@/components/ui/avatar';
import { GameGallery } from '@/components/game-gallery';
import { GameActionButton } from '@/components/game-action-button';
import { FloatingTrailer } from '@/components/floating-trailer';
import { ClubGameAdminDialog } from '@/components/club-game-admin-dialog';
import { ProgressList } from '@/components/progress-list';
import { NotesChat } from '@/components/notes-chat';

interface GamePeople {
  voters: Profile[];
  completed: Profile[];
  votedByMe: boolean;
  completedByMe: boolean;
  inBacklog: boolean;
}

function PeoplePreview({ people, empty }: { people: Profile[]; empty: string }) {
  return (
    <div className="game-people-chips flex flex-wrap gap-2">
      {people.map(person => <span key={person.id} className="game-person-chip inline-flex max-w-full items-center gap-2 rounded-full border border-white/8 bg-white/[.06] py-1 pl-1 pr-3 text-xs font-semibold text-zinc-400"><Avatar src={person.avatar_url} name={person.name} className="size-7 text-[9px]" /><span className="truncate">{person.name || 'Membro'}</span></span>)}
      {!people.length && <span className="game-people-empty text-xs leading-relaxed text-zinc-600">{empty}</span>}
    </div>
  );
}

export default function GamePage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const isPreview = searchParams.get('preview') === '1';
  const supabase = useMemo(() => createClient(), []);
  const { user, isDemo, selectedMonth, isHistorical, runOptimistic, clubRevision } = useApp();
  const voteMonth = shiftMonth(selectedMonth, 1);
  const gameQuery = useStaleQuery(`game:${params.id}`, () => fetchGame(supabase, params.id, isDemo));
  const mediaRequested = useRef(new Set<string>());
  const peopleQuery = useStaleQuery<GamePeople>(`game-people:${params.id}:${voteMonth}:${clubRevision}`, async () => {
    if (isDemo) {
      const item = demoRanking().find(row => row.game.id === params.id) || demoRanking()[0];
      return { voters: item.voters, completed: item.completedBy, votedByMe: item.votedByMe, completedByMe: item.completedByMe, inBacklog: item.inBacklog };
    }
    const [{ data: votes, error: votesError }, { data: completed, error: completedError }, { data: backlog }] = await Promise.all([
      supabase.from('votes').select('user_id').eq('game_id', params.id).eq('vote_month', voteMonth),
      supabase.from('game_progress').select('user_id').eq('game_id', params.id).eq('status', 'finished'),
      supabase.from('backlogs').select('id').eq('game_id', params.id).eq('user_id', user!.id).maybeSingle(),
    ]);
    if (votesError) throw votesError;
    if (completedError) throw completedError;
    const ids = Array.from(new Set([...(votes || []).map(item => item.user_id), ...(completed || []).map(item => item.user_id)]));
    let profiles: Profile[] = [];
    if (ids.length) {
      const response = await supabase.from('profiles').select('id, name, avatar_url').in('id', ids);
      if (response.error) throw response.error;
      profiles = response.data as Profile[];
    }
    const profileMap = new Map(profiles.map(profile => [profile.id, profile]));
    return {
      voters: (votes || []).map(item => profileMap.get(item.user_id) || { id: item.user_id, name: 'Membro', avatar_url: null }),
      completed: (completed || []).map(item => profileMap.get(item.user_id) || { id: item.user_id, name: 'Membro', avatar_url: null }),
      votedByMe: (votes || []).some(item => item.user_id === user!.id),
      completedByMe: (completed || []).some(item => item.user_id === user!.id),
      inBacklog: Boolean(backlog),
    };
  }, Boolean(user));
  const game = gameQuery.data;
  const people = peopleQuery.data || { voters: [], completed: [], votedByMe: false, completedByMe: false, inBacklog: false };
  const platformsQuery = useStaleQuery<UserPlatform[]>(`user-platforms:${user?.id}`, () => fetchUserPlatforms(supabase, user!.id, isDemo), Boolean(user));
  const ownedPlatformIds = new Set((platformsQuery.data || []).map(platform => platform.igdb_platform_id));
  const [participantsOpen, setParticipantsOpen] = useState(true);

  useEffect(() => {
    if (isDemo || !game || ((game.screenshot_urls?.length || 0) >= 3 && game.genres?.length && game.platforms?.length && game.platform_ids?.length) || mediaRequested.current.has(game.id)) return;
    mediaRequested.current.add(game.id);
    void fetch(`/api/games/${game.id}/media`, { method: 'POST' })
      .then(response => response.ok ? response.json() : null)
      .then(updated => { if (updated) gameQuery.setData(updated); })
      .catch(() => undefined);
  }, [game, gameQuery, isDemo]);

  async function addToBacklog() {
    if (!game || people.inBacklog) return;
    const next = { ...people, inBacklog: true };
    if (isDemo) peopleQuery.setData(next);
    else await runOptimistic('Adicionando ao backlog...', () => peopleQuery.setData(next), () => peopleQuery.setData(people), () => supabase.from('backlogs').upsert({ user_id: user!.id, game_id: game.id }, { onConflict: 'user_id,game_id' }));
  }

  async function removeFromBacklog() {
    if (!game || !people.inBacklog) return;
    const next = { ...people, inBacklog: false };
    if (isDemo) peopleQuery.setData(next);
    else await runOptimistic('Removendo do backlog...', () => peopleQuery.setData(next), () => peopleQuery.setData(people), () => supabase.from('backlogs').delete().eq('user_id', user!.id).eq('game_id', game.id));
  }

  async function toggleVote() {
    if (!game || isHistorical) return;
    const votingNow = !people.votedByMe;
    const mine: Profile = { id: user!.id, name: 'Você', avatar_url: null };
    const next = { ...people, votedByMe: votingNow, inBacklog: votingNow || people.inBacklog, voters: votingNow ? [...people.voters, mine] : people.voters.filter(item => item.id !== user!.id) };
    if (isDemo) {
      peopleQuery.setData(next);
      return;
    }
    const request = votingNow
      ? Promise.all([
        supabase.from('votes').insert({ user_id: user!.id, game_id: game.id, vote_month: voteMonth }),
        supabase.from('backlogs').upsert({ user_id: user!.id, game_id: game.id }, { onConflict: 'user_id,game_id' }),
      ])
      : supabase.from('votes').delete().eq('user_id', user!.id).eq('game_id', game.id).eq('vote_month', voteMonth);
    await runOptimistic(votingNow ? 'Registrando voto...' : 'Removendo voto...', () => peopleQuery.setData(next), () => peopleQuery.setData(people), () => request);
  }

  async function toggleCompleted() {
    if (!game || isHistorical) return;
    const completedNow = !people.completedByMe;
    const mine: Profile = { id: user!.id, name: 'Você', avatar_url: null };
    const next = { ...people, completedByMe: completedNow, completed: completedNow ? [...people.completed, mine] : people.completed.filter(item => item.id !== user!.id) };
    if (isDemo) {
      peopleQuery.setData(next);
      return;
    }
    const now = new Date().toISOString();
    const request = supabase.from('game_progress').upsert({
      user_id: user!.id,
      game_id: game.id,
      status: completedNow ? 'finished' : 'not_started',
      rating: null,
      started_at: completedNow ? now : null,
      finished_at: completedNow ? now : null,
      updated_at: now,
    }, { onConflict: 'user_id,game_id' });
    await runOptimistic(completedNow ? 'Marcando como finalizado...' : 'Removendo jogo finalizado...', () => peopleQuery.setData(next), () => peopleQuery.setData(people), () => request);
  }

  async function shareGame() {
    if (!game) return;
    const shareData = { title: game.title, text: `Veja ${game.title} no Clube do Jogo`, url: window.location.href };
    if (navigator.share) await navigator.share(shareData).catch(() => undefined);
    else await navigator.clipboard?.writeText(window.location.href).catch(() => undefined);
  }

  if (gameQuery.isInitialLoading) return <div className="mx-auto max-w-3xl space-y-5"><Skeleton className="-mx-4 aspect-video rounded-none sm:mx-0 sm:rounded-2xl" /><Skeleton className="h-10 w-4/5" /><Skeleton className="h-24 w-full" /></div>;
  if (!game) return <div className="grid min-h-[60dvh] place-items-center text-center"><div><Gamepad2 className="mx-auto size-9 text-zinc-700" /><h1 className="mt-3 text-lg font-black">Jogo não encontrado</h1></div></div>;

  const trailer = youtubeEmbedUrl(game.trailer_url);
  const screenshots = game.screenshot_urls || [];
  const galleryImages = Array.from(new Set([game.image_url, ...screenshots].filter(Boolean)));
  const playtimePoints = game.duration_hours < 8 ? 1 : game.duration_hours <= 15 ? 3 : game.duration_hours <= 20 ? 2 : 1;
  const ratingMultiplier = Number(game.average_rating ?? 50) / 100;
  const completionPenalty = people.completed.length ? people.completed.length * 2 : 1;
  const totalPoints = Math.round(((people.voters.length * 2 * playtimePoints * ratingMultiplier) / completionPenalty) * 10) / 10;
  const starCount = game.average_rating === null || game.average_rating === undefined ? null : Math.round(game.average_rating / 20);
  const rating = game.average_rating === null || game.average_rating === undefined
    ? null
    : (game.average_rating / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const orderedPlatforms = (game.platforms || [])
    .map((name, index) => ({ name, platformId: game.platform_ids?.[index] ?? -1, index }))
    .sort((first, second) =>
      Number(ownedPlatformIds.has(second.platformId)) - Number(ownedPlatformIds.has(first.platformId))
      || first.index - second.index,
    );

  const backlogAction = people.inBacklog ? (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild><GameActionButton kind="backlog" active className="h-10 px-4" aria-label="Opções do backlog" /></DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} collisionPadding={12} className="app-popup animated-popup z-[100] min-w-52 rounded-xl border border-white/10 bg-zinc-900 p-1.5 shadow-2xl outline-none">
          <DropdownMenu.Item onSelect={() => void removeFromBacklog()} className="danger-action flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-bold text-red-300 outline-none data-[highlighted]:bg-red-500/10"><Trash2 className="size-3.5" />Remover do backlog</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  ) : <GameActionButton kind="backlog" active={false} onClick={() => void addToBacklog()} className="h-10 px-4" />;

  const overviewContent = (
    <div className="space-y-5 sm:space-y-6">
      {!isPreview && <div className="grid items-start gap-5 lg:grid-cols-[.82fr_1.18fr]">
        <section className="game-detail-surface game-detail-score-card rounded-3xl border border-white/8 bg-white/[.035] p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="game-detail-eyebrow text-[10px] font-black uppercase tracking-[.16em] text-zinc-600">Pontuação do clube</span>
              <div className="mt-2 text-4xl font-black tracking-[-0.045em] sm:text-5xl" style={{ color: 'var(--support-completed)' }}>{totalPoints.toFixed(1)}<span className="ml-2 text-lg font-bold tracking-normal text-zinc-500">pts</span></div>
            </div>
            <div className="shrink-0">{backlogAction}</div>
          </div>
          <p className="game-detail-muted mt-4 text-xs leading-relaxed text-zinc-500">Calculada a partir dos votos, duração, avaliação e pessoas que finalizaram.</p>
        </section>

        <section className="game-detail-surface game-detail-people-card overflow-hidden rounded-3xl border border-white/8 bg-white/[.035]">
          <button type="button" aria-expanded={participantsOpen} onClick={() => setParticipantsOpen(open => !open)} className="game-detail-people-toggle flex w-full items-center gap-3 px-5 py-4 text-left sm:px-6">
            <span className="game-detail-section-icon grid size-9 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-300"><UsersRound className="size-4" /></span>
            <span className="min-w-0 flex-1">
              <strong className="block text-sm">Participação</strong>
              <span className="game-detail-muted mt-0.5 block text-[11px] text-zinc-500">{people.voters.length} votos · {people.completed.length} finalizaram</span>
            </span>
            <ChevronDown className={`size-4 shrink-0 text-zinc-500 transition-transform ${participantsOpen ? 'rotate-180' : ''}`} />
          </button>
          {participantsOpen && <div className="game-detail-people-grid grid gap-3 border-t border-white/8 p-4 animate-fade-in sm:grid-cols-2 sm:p-5">
            <div className="participation-card game-participation-group min-w-0 rounded-2xl border border-white/8 bg-black/10 p-4">
              <div className="mb-3 flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-sm font-black" style={{ color: 'var(--support-vote)' }}><ThumbsUp className="size-4 fill-current" />Votos</h3><GameActionButton kind="vote" active={people.votedByMe} disabled={isHistorical} onClick={() => void toggleVote()} className="h-9 shrink-0 px-3 text-[11px]" /></div>
              <ParticipantsDialog dialogId={`${params.id}-votes`} voters={people.voters} completed={people.completed}><button className="block w-full text-left" aria-label="Ver pessoas que votaram"><PeoplePreview people={people.voters} empty="Ainda ninguém votou." /></button></ParticipantsDialog>
            </div>
            <div className="participation-card game-participation-group min-w-0 rounded-2xl border border-white/8 bg-black/10 p-4">
              <div className="mb-3 flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-sm font-black" style={{ color: 'var(--support-completed)' }}><Flag className="size-4 fill-current" />Finalizaram</h3><GameActionButton kind="completed" active={people.completedByMe} disabled={isHistorical} onClick={() => void toggleCompleted()} className="h-9 shrink-0 px-3 text-[11px]" /></div>
              <ParticipantsDialog dialogId={`${params.id}-completed`} voters={people.voters} completed={people.completed} initialTab="completed"><button className="block w-full text-left" aria-label="Ver pessoas que finalizaram"><PeoplePreview people={people.completed} empty="Ainda ninguém finalizou." /></button></ParticipantsDialog>
            </div>
          </div>}
        </section>
      </div>}

      {(game.genres?.length || game.platforms?.length) && <section className="game-detail-surface game-detail-facts rounded-3xl border border-white/8 bg-white/[.035] p-5 sm:p-6">
        <div className="grid gap-6 sm:grid-cols-2">
          {game.genres?.length ? <div><h2 className="text-base font-black tracking-tight">Gêneros</h2><div className="mt-3 flex flex-wrap gap-2">{game.genres.map(genre => <span key={genre} className="game-detail-fact-chip rounded-full border border-white/8 bg-white/[.06] px-3 py-2 text-xs font-semibold text-zinc-400">{genre}</span>)}</div></div> : null}
          {orderedPlatforms.length ? <div><h2 className="text-base font-black tracking-tight">Plataformas</h2><div className="mt-3 flex flex-wrap gap-2">{orderedPlatforms.map(platform => { const owned = ownedPlatformIds.has(platform.platformId); return <span key={platform.name} data-owned={owned} className="game-detail-fact-chip inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[.06] px-3 py-2 text-xs font-semibold text-zinc-400">{owned && <CheckCircle2 className="size-3.5 shrink-0" />}{platform.name}</span>; })}</div></div> : null}
        </div>
      </section>}

      <section className="game-detail-surface game-detail-gallery rounded-3xl border border-white/8 bg-white/[.035] p-4 sm:p-6">
        <div className="mb-4 flex items-center gap-2"><ImageIcon className="size-4 text-zinc-400" /><h2 className="text-base font-black tracking-tight">Galeria</h2></div>
        <GameGallery title={game.title} images={galleryImages} />
      </section>
    </div>
  );

  return (
    <div className="game-detail-page mx-auto max-w-4xl animate-fade-in">
      <div className="game-detail-stage mb-6">
        <div className="game-trailer-card game-detail-trailer relative overflow-hidden rounded-t-3xl border border-b-0 border-white/10 bg-black">
        {trailer ? <FloatingTrailer src={trailer} title={`Trailer de ${game.title}`} /> : <div className="aspect-video"><img src={game.image_url} alt={`Capa de ${game.title}`} className="size-full object-cover" /></div>}
        </div>
        <div className="game-detail-video-divider" aria-hidden="true" />
        <section className="game-detail-surface game-detail-summary rounded-b-3xl border border-t-0 border-white/10 bg-white/[.035] px-5 pb-6 pt-5 sm:px-7 sm:pb-7 sm:pt-6">
          <div className="flex items-start justify-between gap-4">
            <h1 className="min-w-0 break-words text-3xl font-black leading-[1.02] tracking-[-0.035em] sm:text-5xl">{game.title}</h1>
            <button onClick={() => void shareGame()} aria-label="Compartilhar jogo" title="Compartilhar jogo" className="game-detail-share grid size-10 shrink-0 place-items-center rounded-full border border-white/8 bg-white/[.06] text-zinc-400 transition hover:bg-white/[.12] hover:text-white"><Share2 className="size-4" /></button>
          </div>
          <div className="mt-4 flex min-w-0 flex-wrap gap-2 text-xs font-bold text-zinc-400">
            <span className="game-detail-meta-chip inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[.06] px-3 py-2"><Clock3 className="size-3.5 text-zinc-500" />{game.duration_hours}h</span>
            <span className="game-detail-meta-chip inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[.06] px-3 py-2">{starCount === null ? <span className="text-zinc-500">Sem nota</span> : <span className="game-rating inline-flex items-center gap-2"><span className="tabular-nums">{rating}</span><span className="flex">{Array.from({ length: 5 }, (_, index) => <Star key={index} className={`size-3.5 ${index < starCount ? 'fill-current' : 'opacity-25'}`} />)}</span></span>}</span>
            {game.release_year && <span className="game-detail-meta-chip inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[.06] px-3 py-2"><CalendarDays className="size-3.5 text-zinc-500" />{game.release_year}</span>}
          </div>
          <p className="game-detail-description mt-4 max-w-2xl text-sm leading-6 text-zinc-400 sm:text-[15px] sm:leading-7">{game.description || 'Sem descrição disponível.'}</p>
          {!isPreview && <ClubGameAdminDialog game={game} className="mt-5" />}
        </section>
      </div>

      {!isPreview ? <Tabs.Root defaultValue="overview">
        <Tabs.List aria-label="Seções do jogo" className="app-tabs game-detail-tabs sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 mb-5 grid grid-cols-3 rounded-2xl border border-white/8 bg-[#0c0c0f]/92 p-1.5 shadow-xl backdrop-blur-xl min-[960px]:top-4">
          <Tabs.Trigger value="overview" className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[11px] font-extrabold text-zinc-500 outline-none data-[state=active]:bg-violet-500/15 data-[state=active]:text-violet-300"><LayoutDashboard className="size-3.5" /><span className="truncate">Visão geral</span></Tabs.Trigger>
          <Tabs.Trigger value="progress" className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[11px] font-extrabold text-zinc-500 outline-none data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-300"><ListChecks className="size-3.5" /><span className="truncate">Progresso</span></Tabs.Trigger>
          <Tabs.Trigger value="notes" className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[11px] font-extrabold text-zinc-500 outline-none data-[state=active]:bg-violet-500/15 data-[state=active]:text-violet-300"><NotebookPen className="size-3.5" /><span className="truncate">Anotações</span></Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="overview" className="outline-none data-[state=active]:animate-tab-in">{overviewContent}</Tabs.Content>
        <Tabs.Content value="progress" className="outline-none data-[state=active]:animate-tab-in"><section className="game-detail-surface game-detail-tab-card rounded-3xl border border-white/8 bg-white/[.035] p-5 sm:p-6"><ProgressList game={game} /></section></Tabs.Content>
        <Tabs.Content value="notes" className="outline-none data-[state=active]:animate-tab-in"><section className="game-detail-surface game-detail-tab-card rounded-3xl border border-white/8 bg-white/[.035] p-4 sm:p-6"><div className="mb-4 flex items-center gap-2"><NotebookPen className="size-4 text-violet-400" /><h2 className="text-base font-black tracking-tight">Anotações</h2></div><NotesChat game={game} /></section></Tabs.Content>
      </Tabs.Root> : overviewContent}
    </div>
  );
}
