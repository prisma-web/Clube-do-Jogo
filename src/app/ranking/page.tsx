'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { CalendarPlus, Check, ChevronDown, ChevronUp, Clock3, Library, ListOrdered, MoreHorizontal, Plus, Search, ThumbsDown, ThumbsUp, Trophy } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fetchRankingData } from '@/lib/data';
import { ACTIVE_RANKING_FORMULA, compareRankingItems, legacyPlaytimePoints, legacyRankingScore, preferenceRankingScore } from '@/lib/ranking';
import type { Game, RankingItem, VoteChoice, VoteParticipant, VoteReason } from '@/lib/types';
import { formatMonth, formatShortDate, shiftMonth } from '@/lib/utils';
import { useStaleQuery } from '@/hooks/use-stale-query';
import { useApp } from '@/components/app-provider';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { ListSkeleton, Skeleton } from '@/components/ui/skeleton';
import { PreferenceParticipantsDialog } from '@/components/preference-participants-dialog';
import { useUrlDialog } from '@/hooks/use-url-state';
import { LoadingToast } from '@/components/ui/loading-toast';
import { ClubGameAdminDialog } from '@/components/club-game-admin-dialog';
import { VoteReasonDialog } from '@/components/vote-reason-dialog';

const preferenceOptions = [
  { value: 'would_not_play', label: 'Não', shortLabel: 'Não', Icon: ThumbsDown },
  { value: 'would_play', label: 'Jogaria', shortLabel: 'Jogaria', Icon: ThumbsUp },
] as const;

type RankingView = 'ranking' | 'recent';

const rankingViews = [
  { value: 'ranking', label: 'Ranking atual', Icon: ListOrdered },
  { value: 'recent', label: 'Adicionados recentemente', Icon: CalendarPlus },
] as const;

function AnimatedPoints({ value }: { value: number }) {
  const motionValue = useMotionValue(value);
  const springValue = useSpring(motionValue, { stiffness: 270, damping: 24, mass: 0.5 });
  const display = useTransform(springValue, latest => latest.toFixed(ACTIVE_RANKING_FORMULA === 'legacy' ? 1 : 0));
  useEffect(() => { motionValue.set(value); }, [motionValue, value]);
  return <motion.span className="inline-block tabular-nums" aria-label={`${value} pontos`}>{display}</motion.span>;
}

function PreferenceButtons({ value, disabled, onChange, compact = false }: {
  value: VoteChoice | null;
  disabled?: boolean;
  onChange: (choice: VoteChoice) => void;
  compact?: boolean;
}) {
  return <div className={`preference-picker grid grid-cols-2 gap-1.5 ${compact ? 'min-w-[210px]' : ''}`}>{preferenceOptions.map(option => {
    const active = value === option.value;
    return <button key={option.value} type="button" disabled={disabled} data-choice={option.value} data-selected={active} aria-label={option.label} aria-pressed={active} onClick={() => onChange(option.value)} className={`preference-choice flex min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2 font-extrabold transition active:scale-[.97] disabled:cursor-default ${compact ? 'h-9 text-[9px]' : 'h-11 text-[10px]'}`}><option.Icon className="size-3.5 shrink-0" /><span className="truncate">{option.shortLabel}</span></button>;
  })}</div>;
}

function emptyChoiceProfiles(): Record<VoteChoice, VoteParticipant[]> {
  return { would_play: [], would_not_play: [] };
}

function friendlyDay(value: string) {
  const date = new Date(value);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  if (day === start) return 'Hoje';
  if (day === start - 86_400_000) return 'Ontem';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' }).format(date);
}

export default function RankingPage() {
  const supabase = useMemo(() => createClient(), []);
  const { user, profile, isDemo, isAdmin, selectedMonth, isHistorical, runOptimistic, clubRevision } = useApp();
  const voteMonth = shiftMonth(selectedMonth, 1);
  const [showAll, setShowAll] = useState(false);
  const [rankingSearch, setRankingSearch] = useState('');
  const [rankingView, setRankingView] = useState<RankingView>('ranking');
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Game[]>([]);
  const [searchError, setSearchError] = useState('');
  const [reasonTarget, setReasonTarget] = useState<{ item?: RankingItem; game?: Game } | null>(null);
  const [rankingParent] = useAutoAnimate<HTMLDivElement>({ duration: 160, easing: 'cubic-bezier(.22, 1, .36, 1)' });
  const rankingQuery = useStaleQuery(
    `ranking:${selectedMonth}:${isHistorical}:${user?.id}:${clubRevision}`,
    () => fetchRankingData(supabase, selectedMonth, user!.id, isDemo, isHistorical),
    Boolean(user),
  );
  const ranking = useMemo(() => rankingQuery.data || [], [rankingQuery.data]);
  const voteDialog = useUrlDialog('vote-game');
  const rankingPlacements = useMemo(() => {
    const placements = new Map<string, number>();
    let lastScore: number | null = null;
    let placement = 0;
    [...ranking].sort(compareRankingItems).forEach(item => {
      if (lastScore === null || item.totalPoints !== lastScore) placement += 1;
      placements.set(item.game.id, placement);
      lastScore = item.totalPoints;
    });
    return placements;
  }, [ranking]);
  const filteredRanking = useMemo(() => {
    const normalizedSearch = rankingSearch.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
    const matches = normalizedSearch
      ? ranking.filter(item => [item.game.title, ...(item.game.genres || []), ...(item.game.platforms || [])]
        .some(value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').includes(normalizedSearch)))
      : [...ranking];
    return rankingView === 'recent'
      ? matches.sort((a, b) => b.addedAt.localeCompare(a.addedAt) || compareRankingItems(a, b))
      : matches.sort(compareRankingItems);
  }, [ranking, rankingSearch, rankingView]);
  const rankingGroups = useMemo(() => {
    if (rankingView === 'recent') {
      const groups = new Map<string, RankingItem[]>();
      filteredRanking.forEach(item => {
        const key = item.addedAt.slice(0, 10);
        groups.set(key, [...(groups.get(key) || []), item]);
      });
      return Array.from(groups, ([key, items]) => ({ key, label: friendlyDay(items[0].addedAt), placement: null as number | null, items }));
    }
    const groups = new Map<number, RankingItem[]>();
    filteredRanking.forEach(item => {
      const placement = rankingPlacements.get(item.game.id) || 0;
      groups.set(placement, [...(groups.get(placement) || []), item]);
    });
    return Array.from(groups, ([placement, items]) => ({ key: String(placement), label: `${placement}º`, placement: placement as number | null, items }));
  }, [filteredRanking, rankingPlacements, rankingView]);
  const visibleGroups = showAll ? rankingGroups : rankingGroups.slice(0, 10);

  function changedItem(item: RankingItem, choice: VoteChoice | null, reason?: VoteReason | null, reasonText?: string | null): RankingItem {
    const me: VoteParticipant = { ...(profile || { id: user!.id, name: 'Você', avatar_url: null }), reason: choice === 'would_not_play' ? reason : null, reasonText: choice === 'would_not_play' ? reasonText : null };
    const choiceProfiles = Object.fromEntries(preferenceOptions.map(option => [option.value, item.choiceProfiles[option.value].filter(person => person.id !== user!.id)])) as Record<VoteChoice, VoteParticipant[]>;
    if (choice) choiceProfiles[choice] = [...choiceProfiles[choice], me];
    const choiceCounts = Object.fromEntries(preferenceOptions.map(option => [option.value, choiceProfiles[option.value].length])) as Record<VoteChoice, number>;
    const voters = preferenceOptions.flatMap(option => choiceProfiles[option.value]);
    const legacyTotalPoints = legacyRankingScore(item.game, voters.length, item.completedCount);
    return {
      ...item,
      choiceProfiles,
      choiceCounts,
      myChoice: choice,
      myReason: choice === 'would_not_play' ? reason : null,
      myReasonText: choice === 'would_not_play' ? reasonText : null,
      voters,
      votesCount: voters.length,
      votedByMe: choice !== null,
      legacyTotalPoints,
      totalPoints: ACTIVE_RANKING_FORMULA === 'legacy' ? legacyTotalPoints : preferenceRankingScore(choiceCounts),
    };
  }

  async function setPreference(item: RankingItem, choice: VoteChoice | null, reason?: VoteReason | null, reasonText?: string | null) {
    if (isHistorical) return;
    const previous = ranking;
    const next = ranking.map(row => row.game.id === item.game.id ? changedItem(row, choice, reason, reasonText) : row)
      .filter(row => row.votesCount > 0)
      .sort(compareRankingItems);
    if (isDemo) { rankingQuery.setData(next); return; }
    const request = choice
      ? supabase.from('votes').upsert({ user_id: user!.id, game_id: item.game.id, vote_month: voteMonth, choice, reason: choice === 'would_not_play' ? reason : null, reason_text: choice === 'would_not_play' ? reasonText : null }, { onConflict: 'user_id,game_id,vote_month' })
      : supabase.from('votes').delete().eq('user_id', user!.id).eq('game_id', item.game.id).eq('vote_month', voteMonth);
    await runOptimistic(choice ? 'Salvando escolha…' : 'Removendo escolha…', () => rankingQuery.setData(next), () => rankingQuery.setData(previous), () => request);
  }

  async function searchGames(event: React.FormEvent) {
    event.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError('');
    if (isDemo) {
      const normalized = searchQuery.toLocaleLowerCase('pt-BR');
      const { demoGames } = await import('@/lib/demo-data');
      setResults(demoGames.filter(game => game.title.toLocaleLowerCase('pt-BR').includes(normalized)));
      setSearching(false);
      return;
    }
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível buscar jogos.');
      setResults(payload);
    } catch (value) {
      setSearchError(value instanceof Error ? value.message : 'Não foi possível buscar jogos.');
    } finally { setSearching(false); }
  }

  async function chooseSearchGame(game: Game, choice: VoteChoice, reason?: VoteReason | null, reasonText?: string | null) {
    const existing = ranking.find(item => item.game.id === game.id);
    if (existing) { await setPreference(existing, choice, reason, reasonText); return; }
    const choiceProfiles = emptyChoiceProfiles();
    choiceProfiles[choice] = [{ ...(profile || { id: user!.id, name: 'Você', avatar_url: null }), reason: choice === 'would_not_play' ? reason : null, reasonText: choice === 'would_not_play' ? reasonText : null }];
    const choiceCounts = { would_play: 0, would_not_play: 0, [choice]: 1 } as Record<VoteChoice, number>;
    const legacyTotalPoints = legacyRankingScore(game, 1, 0);
    const item: RankingItem = {
      game, addedAt: new Date().toISOString(), choiceCounts, choiceProfiles, myChoice: choice, myReason: reason || null, myReasonText: reasonText || null,
      votesCount: 1, completedCount: 0, voters: choiceProfiles[choice], completedBy: [],
      playtimePoints: legacyPlaytimePoints(game.duration_hours), ratingMultiplier: Number(game.average_rating ?? 50) / 100,
      totalPoints: ACTIVE_RANKING_FORMULA === 'legacy' ? legacyTotalPoints : preferenceRankingScore(choiceCounts), legacyTotalPoints,
      votedByMe: true, completedByMe: false, inBacklog: false,
    };
    const next = [...ranking, item].sort(compareRankingItems);
    if (isDemo) { rankingQuery.setData(next); return; }
    await runOptimistic('Salvando escolha…', () => rankingQuery.setData(next), () => rankingQuery.setData(ranking), () => supabase.from('votes').upsert({ user_id: user!.id, game_id: game.id, vote_month: voteMonth, choice, reason: choice === 'would_not_play' ? reason : null, reason_text: choice === 'would_not_play' ? reasonText : null }, { onConflict: 'user_id,game_id,vote_month' }));
  }

  function choose(item: RankingItem, choice: VoteChoice) {
    if (choice === 'would_not_play') { setReasonTarget({ item }); return; }
    void setPreference(item, item.myChoice === choice ? null : choice);
  }

  function chooseSearch(game: Game, choice: VoteChoice) {
    if (choice === 'would_not_play') { setReasonTarget({ game, item: ranking.find(row => row.game.id === game.id) }); return; }
    const existing = ranking.find(row => row.game.id === game.id);
    if (existing) void setPreference(existing, existing.myChoice === choice ? null : choice);
    else void chooseSearchGame(game, choice);
  }

  async function addToMyGames(item: RankingItem) {
    if (item.inBacklog || isHistorical) return;
    const next = ranking.map(row => row.game.id === item.game.id ? { ...row, inBacklog: true } : row);
    if (isDemo) rankingQuery.setData(next);
    else await runOptimistic('Adicionando a Meus Jogos…', () => rankingQuery.setData(next), () => rankingQuery.setData(ranking), () => supabase.from('backlogs').upsert({ user_id: user!.id, game_id: item.game.id }, { onConflict: 'user_id,game_id' }));
  }

  return (
    <div className="mx-auto max-w-3xl animate-fade-in">
      <LoadingToast visible={rankingQuery.isRefreshing} label="Atualizando ranking…" />
      <section className="mb-6 flex min-w-0 items-end justify-between gap-4">
        <h1 className="min-w-0 text-2xl font-black tracking-tight sm:text-3xl">Votação para {formatMonth(voteMonth, { includeYear: isHistorical })}</h1>
        {!isHistorical && <Dialog open={voteDialog.open} onOpenChange={open => open ? voteDialog.show() : voteDialog.close()}>
          <DialogTrigger asChild><button aria-label="Adicionar jogo à votação" className="grid size-11 shrink-0 place-items-center rounded-xl bg-violet-600 transition active:scale-95 sm:flex sm:w-auto sm:px-4"><Plus className="size-4" /><span className="hidden text-xs font-extrabold sm:inline">Adicionar jogo</span></button></DialogTrigger>
          <DialogContent title="Adicionar jogo à votação">
            <form onSubmit={searchGames} className="flex gap-2 border-b border-white/8 p-4"><label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-600" /><input autoFocus value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Nome do jogo" className="h-11 w-full rounded-xl border border-white/10 bg-black/30 pl-10 pr-3 text-sm outline-none focus:border-violet-500" /></label><button disabled={searching} className="h-11 rounded-xl bg-violet-600 px-4 text-xs font-bold disabled:opacity-50">Buscar</button></form>
            <div className="max-h-[62dvh] space-y-2 overflow-y-auto p-4">{searching ? Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-32 w-full" />) : searchError ? <p className="p-8 text-center text-sm text-red-300">{searchError}</p> : results.length ? results.map(game => {
              const existing = ranking.find(item => item.game.id === game.id);
              return <article key={game.id} className="rounded-2xl border border-white/8 bg-white/[0.025] p-3"><div className="mb-3 flex min-w-0 items-center gap-3"><img src={game.image_url} alt="" className="h-16 w-12 shrink-0 rounded-lg object-cover" /><div className="min-w-0"><div className="truncate text-sm font-bold">{game.title}</div><div className="mt-1 inline-flex items-center gap-1 text-[11px] text-zinc-500"><Clock3 className="size-3" />{game.duration_hours} h</div></div></div><PreferenceButtons compact value={existing?.myChoice || null} onChange={choice => chooseSearch(game, choice)} /></article>;
            }) : <p className="p-10 text-center text-sm text-zinc-500">Busque pelo nome do jogo.</p>}</div>
          </DialogContent>
        </Dialog>}
      </section>

      {isHistorical && <div className="mb-5 rounded-2xl border border-amber-500/15 bg-amber-500/7 px-4 py-3 text-xs text-amber-200/80">Resultado preservado do ciclo encerrado.</div>}
      {!!ranking.length && <div className="mb-5 space-y-3">
        <label className="relative block"><Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-600" /><input value={rankingSearch} onChange={event => { setRankingSearch(event.target.value); setShowAll(false); }} placeholder="Buscar no ranking" className="h-12 w-full rounded-2xl border border-white/8 bg-white/[.035] pl-10 pr-4 text-sm outline-none focus:border-violet-500" /></label>
        <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-8 sm:px-8 [&::-webkit-scrollbar]:hidden"><div className="flex w-max gap-2">{rankingViews.map(({ value, label, Icon }) => <button key={value} type="button" onClick={() => { setRankingView(value); setShowAll(false); }} data-selected={rankingView === value} className="library-filter-chip inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold"><Icon className="size-3.5" />{label}</button>)}</div></div>
      </div>}
      {rankingQuery.isInitialLoading ? <ListSkeleton count={6} /> : !ranking.length ? <div className="grid min-h-64 place-items-center rounded-3xl border border-dashed border-white/10 p-8 text-center"><div><Trophy className="mx-auto size-8 text-zinc-700" /><h2 className="mt-3 text-sm font-bold text-zinc-300">A votação está vazia</h2></div></div> : !filteredRanking.length ? <div className="grid min-h-52 place-items-center rounded-3xl border border-dashed border-white/10 p-8 text-center"><div><Search className="mx-auto size-8 text-zinc-700" /><h2 className="mt-3 text-sm font-bold text-zinc-300">Nenhum jogo encontrado</h2></div></div> : (
        <div ref={rankingParent} className="ranking-list space-y-5 pt-1">
          {visibleGroups.map(group => <section key={group.key} className="ranking-placement-group min-w-0" data-placement={group.placement || undefined}>
            <header className="ranking-placement-header mb-2.5 flex min-w-0 items-center gap-3">
              {group.placement ? <span aria-label={`${group.placement}º lugar`} className={`ranking-placement-emblem flex size-12 shrink-0 items-center justify-center gap-1 rounded-full border text-sm font-black shadow-lg ${group.placement === 1 ? 'ranking-medal ranking-medal-1 bg-gradient-to-br from-amber-200 to-amber-600 text-amber-950' : group.placement === 2 ? 'ranking-medal ranking-medal-2 bg-gradient-to-br from-zinc-100 to-zinc-400 text-zinc-800' : group.placement === 3 ? 'ranking-medal ranking-medal-3 bg-gradient-to-br from-amber-500 to-amber-900 text-white' : 'ranking-position border-white/10 bg-zinc-800 text-zinc-200'}`}>{group.placement <= 3 && <Trophy className="size-4" />}<span>{group.placement}º</span></span> : <span className="ranking-date-label inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[.035] px-3 text-[11px] font-extrabold text-zinc-300"><CalendarPlus className="size-3.5" />{group.label}</span>}
              <span className="ranking-placement-line h-px min-w-0 flex-1 bg-gradient-to-r from-white/20 to-transparent" />
            </header>
            <div className="ranking-placement-cards ml-5 space-y-2.5 border-l border-white/8 pl-3">
          {group.items.map(item => <article key={item.game.id} data-rank={group.placement || undefined} data-my-choice={item.myChoice || undefined} className={`ranking-card relative min-w-0 rounded-2xl border p-3 transition ${group.placement === 1 ? 'border-amber-400/25 bg-gradient-to-br from-amber-400/[.07] to-white/[.025]' : 'border-white/[.07] bg-white/[.025]'}`}>
            <ClubGameAdminDialog game={item.game} variant="icon" className={`absolute top-2 z-20 ${isHistorical ? 'right-2' : 'right-12'}`} />
            {!isHistorical && <DropdownMenu.Root><DropdownMenu.Trigger aria-label={`Opções de ${item.game.title}`} className="ranking-menu-trigger absolute right-2 top-2 z-20 grid size-8 place-items-center rounded-full bg-zinc-950/75 text-zinc-400 backdrop-blur"><MoreHorizontal className="size-4" /></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={6} className="app-popup animated-popup z-[100] min-w-52 rounded-xl border border-white/10 bg-zinc-900 p-1.5 shadow-2xl outline-none"><DropdownMenu.Item disabled={item.inBacklog} onSelect={() => void addToMyGames(item)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-bold outline-none data-[disabled]:text-emerald-400 data-[highlighted]:bg-white/8">{item.inBacklog ? <Check className="size-3.5" /> : <Library className="size-3.5" />}{item.inBacklog ? 'Já está em Meus Jogos' : 'Adicionar a Meus Jogos'}</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>}

            <div className="ranking-card-summary flex min-w-0 gap-3">
              <Link href={`/jogos/${item.game.id}`} className="h-[112px] w-[82px] shrink-0 overflow-hidden rounded-xl bg-zinc-900"><img src={item.game.image_url} alt={`Capa de ${item.game.title}`} className="size-full object-cover" /></Link>
              <div className={`flex min-w-0 flex-1 flex-col justify-center py-1 ${isAdmin ? 'pr-16' : 'pr-7'}`}><Link href={`/jogos/${item.game.id}`} className="break-words text-sm font-extrabold leading-snug hover:text-violet-300">{item.game.title}</Link><div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-zinc-500"><span className="inline-flex items-center gap-1"><Clock3 className="size-3" />{item.game.duration_hours} h</span>{rankingView === 'recent' && <span className="inline-flex items-center gap-1"><CalendarPlus className="size-3" />{formatShortDate(item.addedAt)}</span>}</div><div className="ranking-score mt-3 whitespace-nowrap text-3xl font-black leading-none text-emerald-400"><AnimatedPoints value={item.totalPoints} /><span className="ml-1 text-[10px] font-bold text-zinc-500">pts</span></div></div>
            </div>

            <PreferenceParticipantsDialog profiles={item.choiceProfiles}>{openAt => <div className="preference-summary mt-3 grid w-full grid-cols-2 gap-1.5 border-t border-white/[0.07] pt-3">{preferenceOptions.map(option => <button type="button" onClick={() => openAt(option.value)} key={option.value} data-choice={option.value} className="preference-count flex min-w-0 items-center justify-center gap-1.5 rounded-lg bg-black/20 px-1.5 py-2 text-[10px] font-bold"><option.Icon className="size-3.5 shrink-0" /><span className="tabular-nums">{item.choiceCounts[option.value]}</span></button>)}</div>}</PreferenceParticipantsDialog>
            <div className="mt-2"><PreferenceButtons value={item.myChoice} disabled={isHistorical} onChange={choice => choose(item, choice)} /></div>
          </article>)}</div></section>)}
          {rankingGroups.length > 10 && <button onClick={() => setShowAll(value => !value)} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.025] text-xs font-bold">{showAll ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}{showAll ? `Mostrar 10 ${rankingView === 'recent' ? 'dias' : 'colocações'}` : `Ver todos os ${rankingGroups.length} ${rankingView === 'recent' ? 'dias' : 'colocações'}`}</button>}
        </div>
      )}
      <VoteReasonDialog open={Boolean(reasonTarget)} initialReason={reasonTarget?.item?.myReason} initialText={reasonTarget?.item?.myReasonText} onOpenChange={open => { if (!open) setReasonTarget(null); }} onConfirm={(reason, reasonText) => { const target = reasonTarget; setReasonTarget(null); if (target?.item) void setPreference(target.item, 'would_not_play', reason, reasonText); else if (target?.game) void chooseSearchGame(target.game, 'would_not_play', reason, reasonText); }} />
    </div>
  );
}
