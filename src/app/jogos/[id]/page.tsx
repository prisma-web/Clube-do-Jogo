'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tabs from '@radix-ui/react-tabs';
import { CalendarDays, CheckCircle2, Clock3, Gamepad2, Heart, ImageIcon, LayoutDashboard, ListChecks, NotebookPen, Share2, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { demoRanking } from '@/lib/demo-data';
import { fetchGame, fetchUserPlatforms } from '@/lib/data';
import type { Profile, UserPlatform, VoteChoice, VoteParticipant, VoteReason } from '@/lib/types';
import { ACTIVE_RANKING_FORMULA, legacyRankingScore, preferenceRankingScore } from '@/lib/ranking';
import { shiftMonth, youtubeEmbedUrl } from '@/lib/utils';
import { useStaleQuery } from '@/hooks/use-stale-query';
import { useApp } from '@/components/app-provider';
import { Skeleton } from '@/components/ui/skeleton';
import { GameGallery } from '@/components/game-gallery';
import { RatingDisplay } from '@/components/rating-slider';
import { GameActionButton } from '@/components/game-action-button';
import { FloatingTrailer } from '@/components/floating-trailer';
import { ClubGameAdminDialog } from '@/components/club-game-admin-dialog';
import { ProgressList } from '@/components/progress-list';
import { NotesChat } from '@/components/notes-chat';
import { PreferenceParticipantsDialog } from '@/components/preference-participants-dialog';
import { VoteReasonDialog } from '@/components/vote-reason-dialog';
import { useUrlTab } from '@/hooks/use-url-state';

interface GamePeople {
  voters: Profile[];
  completed: Profile[];
  choiceProfiles: Record<VoteChoice, VoteParticipant[]>;
  myChoice: VoteChoice | null;
  myReason?: VoteReason | null;
  myReasonText?: string | null;
  votedByMe: boolean;
  completedByMe: boolean;
  inBacklog: boolean;
  favorite: boolean;
}

const preferenceOptions = [
  { value: 'would_not_play', label: 'Não', Icon: ThumbsDown },
  { value: 'would_play', label: 'Jogaria', Icon: ThumbsUp },
] as const;

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
      return { voters: item.voters, completed: item.completedBy, choiceProfiles: item.choiceProfiles, myChoice: item.myChoice, myReason: item.myReason, myReasonText: item.myReasonText, votedByMe: item.votedByMe, completedByMe: item.completedByMe, inBacklog: item.inBacklog, favorite: item.game.id === 'hollow-knight' };
    }
    const [{ data: votes, error: votesError }, { data: completed, error: completedError }, { data: backlog }, { data: favorite }] = await Promise.all([
      supabase.from('votes').select('user_id, choice, reason, reason_text').eq('game_id', params.id).eq('vote_month', voteMonth),
      supabase.from('game_progress').select('user_id').eq('game_id', params.id).eq('status', 'finished'),
      supabase.from('backlogs').select('id').eq('game_id', params.id).eq('user_id', user!.id).maybeSingle(),
      supabase.from('favorite_games').select('id').eq('game_id', params.id).eq('user_id', user!.id).maybeSingle(),
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
    const validVotes = (votes || []).filter(item => item.choice === 'would_play' || item.choice === 'would_not_play');
    const choiceProfiles: Record<VoteChoice, VoteParticipant[]> = {
      would_play: validVotes.filter(item => item.choice === 'would_play').map(item => ({ ...(profileMap.get(item.user_id) || { id: item.user_id, name: 'Membro', avatar_url: null }), reason: null, reasonText: null })),
      would_not_play: validVotes.filter(item => item.choice === 'would_not_play').map(item => ({ ...(profileMap.get(item.user_id) || { id: item.user_id, name: 'Membro', avatar_url: null }), reason: item.reason as VoteReason | null, reasonText: item.reason_text })),
    };
    const myVote = validVotes.find(item => item.user_id === user!.id);
    return {
      voters: validVotes.map(item => profileMap.get(item.user_id) || { id: item.user_id, name: 'Membro', avatar_url: null }),
      completed: (completed || []).map(item => profileMap.get(item.user_id) || { id: item.user_id, name: 'Membro', avatar_url: null }),
      choiceProfiles,
      myChoice: myVote ? (myVote.choice || 'would_play') as VoteChoice : null,
      myReason: (myVote?.reason as VoteReason | null) || null,
      myReasonText: myVote?.reason_text || null,
      votedByMe: Boolean(myVote),
      completedByMe: (completed || []).some(item => item.user_id === user!.id),
      inBacklog: Boolean(backlog),
      favorite: Boolean(favorite),
    };
  }, Boolean(user));
  const game = gameQuery.data;
  const people = peopleQuery.data || { voters: [], completed: [], choiceProfiles: { would_play: [], would_not_play: [] }, myChoice: null, myReason: null, myReasonText: null, votedByMe: false, completedByMe: false, inBacklog: false, favorite: false };
  const platformsQuery = useStaleQuery<UserPlatform[]>(`user-platforms:${user?.id}`, () => fetchUserPlatforms(supabase, user!.id, isDemo), Boolean(user));
  const ownedPlatformIds = new Set((platformsQuery.data || []).map(platform => platform.igdb_platform_id));
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [activeTab, setActiveTab] = useUrlTab('section', ['overview', 'progress', 'notes'] as const, 'overview');

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
    else await runOptimistic('Adicionando a Meus Jogos…', () => peopleQuery.setData(next), () => peopleQuery.setData(people), () => supabase.from('backlogs').upsert({ user_id: user!.id, game_id: game.id }, { onConflict: 'user_id,game_id' }));
  }

  async function removeFromBacklog() {
    if (!game || !people.inBacklog) return;
    const next = { ...people, inBacklog: false };
    if (isDemo) peopleQuery.setData(next);
    else await runOptimistic('Removendo de Meus Jogos…', () => peopleQuery.setData(next), () => peopleQuery.setData(people), () => supabase.from('backlogs').delete().eq('user_id', user!.id).eq('game_id', game.id));
  }

  async function setPreference(choice: VoteChoice | null, reason?: VoteReason | null, reasonText?: string | null) {
    if (!game || isHistorical) return;
    const mine: VoteParticipant = { id: user!.id, name: 'Você', avatar_url: null, reason: choice === 'would_not_play' ? reason : null, reasonText: choice === 'would_not_play' ? reasonText : null };
    const choiceProfiles = {
      would_play: people.choiceProfiles.would_play.filter(person => person.id !== user!.id),
      would_not_play: people.choiceProfiles.would_not_play.filter(person => person.id !== user!.id),
    };
    if (choice) choiceProfiles[choice] = [...choiceProfiles[choice], mine];
    const voters = [...choiceProfiles.would_play, ...choiceProfiles.would_not_play];
    const next = { ...people, myChoice: choice, myReason: choice === 'would_not_play' ? reason : null, myReasonText: choice === 'would_not_play' ? reasonText : null, votedByMe: choice !== null, choiceProfiles, voters };
    if (isDemo) {
      peopleQuery.setData(next);
      return;
    }
    const request = choice
      ? supabase.from('votes').upsert({ user_id: user!.id, game_id: game.id, vote_month: voteMonth, choice, reason: choice === 'would_not_play' ? reason : null, reason_text: choice === 'would_not_play' ? reasonText : null }, { onConflict: 'user_id,game_id,vote_month' })
      : supabase.from('votes').delete().eq('user_id', user!.id).eq('game_id', game.id).eq('vote_month', voteMonth);
    await runOptimistic(choice ? 'Salvando escolha…' : 'Removendo escolha…', () => peopleQuery.setData(next), () => peopleQuery.setData(people), () => request);
  }

  async function toggleFavorite() {
    if (!game) return;
    const favorite = !people.favorite;
    const next = { ...people, favorite };
    if (isDemo) { peopleQuery.setData(next); return; }
    const request = favorite
      ? supabase.from('favorite_games').upsert({ user_id: user!.id, game_id: game.id }, { onConflict: 'user_id,game_id' })
      : supabase.from('favorite_games').delete().eq('user_id', user!.id).eq('game_id', game.id);
    await runOptimistic(favorite ? 'Adicionando aos favoritos…' : 'Removendo dos favoritos…', () => peopleQuery.setData(next), () => peopleQuery.setData(people), () => request);
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
  const choiceCounts = { would_play: people.choiceProfiles.would_play.length, would_not_play: people.choiceProfiles.would_not_play.length };
  const totalPoints = ACTIVE_RANKING_FORMULA === 'legacy' ? legacyRankingScore(game, people.voters.length, people.completed.length) : preferenceRankingScore(choiceCounts);
  const ratingValue = game.average_rating === null || game.average_rating === undefined ? null : Math.max(0, Math.min(10, game.average_rating / 10));
  const orderedPlatforms = (game.platforms || [])
    .map((name, index) => ({ name, platformId: game.platform_ids?.[index] ?? -1, index }))
    .sort((first, second) =>
      Number(ownedPlatformIds.has(second.platformId)) - Number(ownedPlatformIds.has(first.platformId))
      || first.index - second.index,
    );

  const backlogAction = people.inBacklog ? (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild><GameActionButton kind="backlog" active className="h-10 px-4" aria-label="Opções de Meus Jogos" /></DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} collisionPadding={12} className="app-popup animated-popup z-[100] min-w-52 rounded-xl border border-white/10 bg-zinc-900 p-1.5 shadow-2xl outline-none">
          <DropdownMenu.Item onSelect={() => void removeFromBacklog()} className="danger-action flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-bold text-red-300 outline-none data-[highlighted]:bg-red-500/10"><Trash2 className="size-3.5" />Remover de Meus Jogos</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  ) : <GameActionButton kind="backlog" active={false} onClick={() => void addToBacklog()} className="h-10 px-4" />;

  const overviewContent = (
    <div className="space-y-5 sm:space-y-6">
      {!isPreview && <div className="grid items-start gap-4 lg:grid-cols-[.72fr_1.28fr]">
        <section className="game-detail-surface game-detail-score-card rounded-3xl border border-white/8 bg-white/[.035] p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="game-detail-eyebrow text-[10px] font-black uppercase tracking-[.16em] text-zinc-600">Pontuação do clube</span>
              <div className="mt-2 text-4xl font-black tracking-[-0.045em] sm:text-5xl" style={{ color: 'var(--support-completed)' }}>{totalPoints.toFixed(ACTIVE_RANKING_FORMULA === 'legacy' ? 1 : 0)}<span className="ml-2 text-lg font-bold tracking-normal text-zinc-500">pts</span></div>
            </div>
            <div className="shrink-0">{backlogAction}</div>
          </div>
        </section>

        <section className="game-detail-surface game-detail-people-card rounded-3xl border border-white/8 bg-white/[.035] p-4 sm:p-5">
          <PreferenceParticipantsDialog profiles={people.choiceProfiles}>{openAt => <div className="preference-summary grid w-full grid-cols-2 gap-2">{preferenceOptions.map(option => <button type="button" onClick={() => openAt(option.value)} key={option.value} data-choice={option.value} className="preference-count flex min-w-0 flex-col items-center gap-1 rounded-xl bg-black/20 px-2 py-2.5 text-[10px] font-bold"><option.Icon className="size-4" /><span>{choiceCounts[option.value]}</span><span className="max-w-full truncate">{option.label}</span></button>)}</div>}</PreferenceParticipantsDialog>
          <div className="preference-picker mt-3 grid grid-cols-2 gap-2">{preferenceOptions.map(option => <button key={option.value} disabled={isHistorical} data-choice={option.value} data-selected={people.myChoice === option.value} onClick={() => option.value === 'would_not_play' && people.myChoice !== option.value ? setReasonOpen(true) : void setPreference(people.myChoice === option.value ? null : option.value)} className="preference-choice flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2 text-[10px] font-extrabold transition active:scale-[.97]"><option.Icon className="size-3.5 shrink-0" /><span className="truncate">{option.label}</span></button>)}</div>
        </section>
      </div>}

      {(game.genres?.length || game.platforms?.length) && <section className="game-detail-surface game-detail-facts rounded-3xl border border-white/8 bg-white/[.035] p-5 sm:p-6">
        <div className="grid gap-6 sm:grid-cols-2">
          {game.genres?.length ? <div><h2 className="text-base font-black tracking-tight">Gêneros</h2><div className="mt-3 flex flex-wrap gap-2">{game.genres.map(genre => <span key={genre} className="game-detail-fact-chip rounded-full border border-white/8 bg-white/[.06] px-3 py-2 text-xs font-semibold text-zinc-400">{genre}</span>)}</div></div> : null}
          {orderedPlatforms.length ? <div><h2 className="text-base font-black tracking-tight">Plataformas</h2><div className="mt-3 flex flex-wrap gap-2">{orderedPlatforms.map(platform => { const owned = ownedPlatformIds.has(platform.platformId); return <span key={platform.name} data-owned={owned} className="game-detail-fact-chip inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[.06] px-3 py-2 text-xs font-semibold text-zinc-400">{owned && <CheckCircle2 className="size-3.5 shrink-0" />}{platform.name}</span>; })}</div></div> : null}
        </div>
      </section>}

      <section className="game-detail-surface game-detail-gallery game-detail-gallery-bleed overflow-hidden border-y border-white/8 bg-white/[.035] py-4 sm:py-6">
        <div className="mb-4 flex items-center gap-2 px-4 sm:px-8"><ImageIcon className="size-4 text-zinc-400" /><h2 className="text-base font-black tracking-tight">Galeria</h2></div>
        <GameGallery title={game.title} images={galleryImages} />
      </section>
    </div>
  );

  return (
    <div className="game-detail-page animate-fade-in">
      <div className="game-detail-trailer-bleed -mx-4 mb-4 max-h-[34dvh] overflow-hidden bg-black sm:-mx-8 sm:mb-6 sm:max-h-none">
        {trailer ? <FloatingTrailer src={trailer} title={`Trailer de ${game.title}`} /> : <div className="aspect-video"><img src={game.image_url} alt={`Capa de ${game.title}`} className="size-full object-cover" /></div>}
      </div>
      <div className="mx-auto max-w-4xl">
        <section className="game-detail-summary px-0 pb-6 sm:pb-7">
          <div className="flex items-start justify-between gap-4">
            <h1 className="min-w-0 break-words text-3xl font-black leading-[1.02] tracking-[-0.035em] sm:text-5xl">{game.title}</h1>
            <div className="flex shrink-0 gap-2"><button onClick={() => void toggleFavorite()} aria-label={people.favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'} className={`game-detail-share grid size-10 place-items-center rounded-full border border-white/8 bg-white/[.06] transition ${people.favorite ? 'text-pink-400' : 'text-zinc-400'}`}><Heart className={`size-4 ${people.favorite ? 'fill-current' : ''}`} /></button><button onClick={() => void shareGame()} aria-label="Compartilhar jogo" title="Compartilhar jogo" className="game-detail-share grid size-10 place-items-center rounded-full border border-white/8 bg-white/[.06] text-zinc-400 transition hover:bg-white/[.12] hover:text-white"><Share2 className="size-4" /></button></div>
          </div>
          <div className="mt-4 flex min-w-0 flex-wrap gap-2 text-xs font-bold text-zinc-400">
            <span className="game-detail-meta-chip inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[.06] px-3 py-2"><Clock3 className="size-3.5 text-zinc-500" />{game.duration_hours}h</span>
            <span className="game-detail-meta-chip inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[.06] px-3 py-2">{ratingValue === null ? <span className="text-zinc-500">Sem nota</span> : <RatingDisplay value={ratingValue} className="text-xs" />}</span>
            {game.release_year && <span className="game-detail-meta-chip inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[.06] px-3 py-2"><CalendarDays className="size-3.5 text-zinc-500" />{game.release_year}</span>}
          </div>
          <p className={`game-detail-description mt-3 max-w-2xl text-sm leading-6 text-zinc-400 sm:text-[15px] sm:leading-7 ${descriptionExpanded ? '' : 'line-clamp-3'}`}>{game.description || 'Sem descrição disponível.'}</p>
          {game.description && game.description.length > 180 && <button onClick={() => setDescriptionExpanded(value => !value)} className="mt-1 text-[11px] font-extrabold text-violet-300">{descriptionExpanded ? 'Ver menos' : 'Ver mais'}</button>}
          {!isPreview && <ClubGameAdminDialog game={game} className="mt-5" />}
        </section>

      {!isPreview ? <Tabs.Root value={activeTab} onValueChange={value => setActiveTab(value as typeof activeTab)}>
        <Tabs.List aria-label="Seções do jogo" className="app-tabs game-detail-tabs sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 mb-5 grid grid-cols-3 rounded-2xl border border-white/8 bg-[#0c0c0f]/92 p-1.5 shadow-xl backdrop-blur-xl min-[960px]:top-4">
          <Tabs.Trigger value="overview" className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[11px] font-extrabold text-zinc-500 outline-none data-[state=active]:bg-violet-500/15 data-[state=active]:text-violet-300"><LayoutDashboard className="size-3.5" /><span className="truncate">Visão geral</span></Tabs.Trigger>
          <Tabs.Trigger value="progress" className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[11px] font-extrabold text-zinc-500 outline-none data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-300"><ListChecks className="size-3.5" /><span className="truncate">Progresso</span></Tabs.Trigger>
          <Tabs.Trigger value="notes" className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[11px] font-extrabold text-zinc-500 outline-none data-[state=active]:bg-violet-500/15 data-[state=active]:text-violet-300"><NotebookPen className="size-3.5" /><span className="truncate">Anotações</span></Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="overview" className="outline-none data-[state=active]:animate-tab-in">{overviewContent}</Tabs.Content>
        <Tabs.Content value="progress" className="outline-none data-[state=active]:animate-tab-in"><ProgressList game={game} /></Tabs.Content>
        <Tabs.Content value="notes" className="outline-none data-[state=active]:animate-tab-in"><NotesChat game={game} /></Tabs.Content>
      </Tabs.Root> : overviewContent}
      </div>
      <VoteReasonDialog open={reasonOpen} initialReason={people.myReason} initialText={people.myReasonText} onOpenChange={setReasonOpen} onConfirm={(reason, reasonText) => { setReasonOpen(false); void setPreference('would_not_play', reason, reasonText); }} />
    </div>
  );
}
