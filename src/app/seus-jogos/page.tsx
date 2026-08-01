'use client';

import { useMemo, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { ArrowDownAZ, Check, ChevronDown, Circle, Filter, Flag, Gamepad2, Heart, Library, MoreHorizontal, Plus, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fetchProfileWithGames } from '@/lib/data';
import { transitionProgress } from '@/lib/progress';
import type { Game, LibraryGame, ProfileWithGames, ProgressStatus, UserPlatform } from '@/lib/types';
import { useStaleQuery } from '@/hooks/use-stale-query';
import { useApp } from '@/components/app-provider';
import { GameListCard } from '@/components/game-list-card';
import { ListSkeleton, Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { ProgressConfirmationDialog } from '@/components/progress-confirmation-dialog';
import { useUrlDialog } from '@/hooks/use-url-state';

type QuickFilter = 'all' | 'started' | 'finished' | 'not_started' | 'favorites';
type SortMode = 'recent' | 'title' | 'duration' | 'rating';

const quickFilters: Array<{ value: QuickFilter; label: string; Icon: typeof Library }> = [
  { value: 'all', label: 'Todos', Icon: Library },
  { value: 'started', label: 'Comecei', Icon: Gamepad2 },
  { value: 'finished', label: 'Finalizados', Icon: Flag },
  { value: 'not_started', label: 'Não iniciados', Icon: Circle },
  { value: 'favorites', label: 'Favoritos', Icon: Heart },
];

const statusLabel: Record<ProgressStatus, string> = { not_started: 'Não iniciado', started: 'Comecei', finished: 'Finalizado' };

function rebuild(data: ProfileWithGames, library: LibraryGame[]): ProfileWithGames {
  return {
    ...data,
    library,
    backlog: library.filter(item => item.inBacklog).map(item => item.game),
    completed: library.filter(item => item.progress?.status === 'finished').map(item => item.game),
    favorites: library.filter(item => item.favorite).map(item => item.game),
  };
}

export function YourGamesPanel() {
  const supabase = useMemo(() => createClient(), []);
  const { user, isDemo, runOptimistic } = useApp();
  const query = useStaleQuery(`your-games:${user?.id}`, () => fetchProfileWithGames(supabase, user!.id, isDemo), Boolean(user), { staleTime: 60_000 });
  const data = query.data;
  const [listParent] = useAutoAnimate<HTMLDivElement>({ duration: 160, easing: 'cubic-bezier(.22, 1, .36, 1)' });
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [textFilter, setTextFilter] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [playableOnly, setPlayableOnly] = useState(false);
  const [shortOnly, setShortOnly] = useState(false);
  const [ratedOnly, setRatedOnly] = useState(false);
  const [grouped, setGrouped] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Game[]>([]);
  const [searchError, setSearchError] = useState('');
  const [platformQuery, setPlatformQuery] = useState('');
  const [platformSearching, setPlatformSearching] = useState(false);
  const [platformResults, setPlatformResults] = useState<UserPlatform[]>([]);
  const [platformError, setPlatformError] = useState('');
  const [progressTarget, setProgressTarget] = useState<{ item: LibraryGame; status: ProgressStatus } | null>(null);
  const [removeTarget, setRemoveTarget] = useState<LibraryGame | null>(null);
  const addDialog = useUrlDialog('add-my-game');
  const filterDialog = useUrlDialog('library-filters');
  const platformsDialog = useUrlDialog('library-platforms');

  const ownedPlatformIds = useMemo(() => new Set((data?.platforms || []).map(platform => platform.igdb_platform_id)), [data?.platforms]);
  const visible = useMemo(() => {
    const normalized = textFilter.trim().toLocaleLowerCase('pt-BR');
    const matches = (data?.library || []).filter(item => {
      const status = item.progress?.status || 'not_started';
      if (quickFilter === 'favorites' ? !item.favorite : quickFilter !== 'all' && status !== quickFilter) return false;
      if (normalized && !item.game.title.toLocaleLowerCase('pt-BR').includes(normalized)) return false;
      if (playableOnly && item.game.platform_ids?.length && !item.game.platform_ids.some(id => ownedPlatformIds.has(id))) return false;
      if (shortOnly && Number(item.game.duration_hours) > 12) return false;
      if (ratedOnly && item.game.average_rating == null) return false;
      return true;
    });
    return matches.sort((a, b) => sortMode === 'title'
      ? a.game.title.localeCompare(b.game.title, 'pt-BR')
      : sortMode === 'duration'
        ? a.game.duration_hours - b.game.duration_hours
        : sortMode === 'rating'
          ? Number(b.game.average_rating ?? -1) - Number(a.game.average_rating ?? -1)
          : (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }, [data?.library, ownedPlatformIds, playableOnly, quickFilter, ratedOnly, shortOnly, sortMode, textFilter]);

  const groups = grouped ? (['started', 'not_started', 'finished'] as ProgressStatus[]).map(status => ({ status, items: visible.filter(item => (item.progress?.status || 'not_started') === status) })).filter(group => group.items.length) : [{ status: null, items: visible }];

  async function addToMyGames(game: Game) {
    if (!data || data.library.some(item => item.game.id === game.id && item.inBacklog)) return;
    const existing = data.library.find(item => item.game.id === game.id);
    const entry: LibraryGame = existing ? { ...existing, inBacklog: true, updatedAt: new Date().toISOString() } : { game, inBacklog: true, favorite: false, progress: null, addedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const library = existing ? data.library.map(item => item.game.id === game.id ? entry : item) : [entry, ...data.library];
    const next = rebuild(data, library);
    if (isDemo) query.setData(next);
    else await runOptimistic('Adicionando a Meus Jogos…', () => query.setData(next), () => query.setData(data), () => supabase.from('backlogs').upsert({ user_id: user!.id, game_id: game.id }, { onConflict: 'user_id,game_id' }));
  }

  async function removeFromMyGames(item: LibraryGame) {
    if (!data) return;
    const changed = { ...item, inBacklog: false, updatedAt: new Date().toISOString() };
    const library = item.favorite || item.progress ? data.library.map(row => row.game.id === item.game.id ? changed : row) : data.library.filter(row => row.game.id !== item.game.id);
    const next = rebuild(data, library);
    setRemoveTarget(null);
    if (isDemo) query.setData(next);
    else await runOptimistic('Removendo de Meus Jogos…', () => query.setData(next), () => query.setData(data), () => supabase.from('backlogs').delete().eq('user_id', user!.id).eq('game_id', item.game.id));
  }

  async function toggleFavorite(item: LibraryGame) {
    if (!data) return;
    const favorite = !item.favorite;
    const next = rebuild(data, data.library.map(row => row.game.id === item.game.id ? { ...row, favorite, updatedAt: new Date().toISOString() } : row));
    if (isDemo) query.setData(next);
    else await runOptimistic(favorite ? 'Adicionando aos favoritos…' : 'Removendo dos favoritos…', () => query.setData(next), () => query.setData(data), () => favorite
      ? supabase.from('favorite_games').upsert({ user_id: user!.id, game_id: item.game.id }, { onConflict: 'user_id,game_id' })
      : supabase.from('favorite_games').delete().eq('user_id', user!.id).eq('game_id', item.game.id));
  }

  async function applyProgress() {
    if (!data || !progressTarget) return;
    const { item, status } = progressTarget;
    const now = new Date().toISOString();
    const progress = transitionProgress(item.progress, status, now);
    const next = rebuild(data, data.library.map(row => row.game.id === item.game.id ? { ...row, progress, updatedAt: now } : row));
    setProgressTarget(null);
    if (isDemo) query.setData(next);
    else await runOptimistic('Atualizando progresso…', () => query.setData(next), () => query.setData(data), () => supabase.from('game_progress').upsert({ user_id: user!.id, game_id: item.game.id, ...progress, updated_at: now }, { onConflict: 'user_id,game_id' }));
  }

  async function searchGames(event: React.FormEvent) {
    event.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true); setSearchError('');
    if (isDemo) { const { demoGames } = await import('@/lib/demo-data'); const normalized = searchQuery.toLocaleLowerCase('pt-BR'); setResults(demoGames.filter(game => game.title.toLocaleLowerCase('pt-BR').includes(normalized))); setSearching(false); return; }
    try { const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`); const payload = await response.json(); if (!response.ok) throw new Error(payload.error); setResults(payload); }
    catch (value) { setSearchError(value instanceof Error ? value.message : 'Não foi possível buscar jogos.'); }
    finally { setSearching(false); }
  }

  async function searchPlatforms(event: React.FormEvent) {
    event.preventDefault(); if (!platformQuery.trim()) return; setPlatformSearching(true); setPlatformError('');
    if (isDemo) { const available: UserPlatform[] = [{ igdb_platform_id: 130, name: 'Nintendo Switch', abbreviation: 'Switch' }, { igdb_platform_id: 6, name: 'PC (Microsoft Windows)', abbreviation: 'PC' }, { igdb_platform_id: 167, name: 'PlayStation 5', abbreviation: 'PS5' }, { igdb_platform_id: 169, name: 'Xbox Series X|S', abbreviation: 'Xbox' }]; const normalized = platformQuery.toLocaleLowerCase('pt-BR'); setPlatformResults(available.filter(platform => platform.name.toLocaleLowerCase('pt-BR').includes(normalized))); setPlatformSearching(false); return; }
    try { const response = await fetch(`/api/platforms/search?q=${encodeURIComponent(platformQuery)}`); const payload = await response.json(); if (!response.ok) throw new Error(payload.error); setPlatformResults(payload); }
    catch (value) { setPlatformError(value instanceof Error ? value.message : 'Não foi possível buscar consoles.'); }
    finally { setPlatformSearching(false); }
  }

  async function addPlatform(platform: UserPlatform) {
    if (!data || data.platforms.some(item => item.igdb_platform_id === platform.igdb_platform_id)) return;
    const next = { ...data, platforms: [...data.platforms, platform].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) };
    if (isDemo) query.setData(next); else await runOptimistic('Adicionando console…', () => query.setData(next), () => query.setData(data), () => supabase.from('user_platforms').upsert({ user_id: user!.id, igdb_platform_id: platform.igdb_platform_id, name: platform.name, abbreviation: platform.abbreviation ?? null, logo_url: platform.logo_url ?? null }, { onConflict: 'user_id,igdb_platform_id' }));
  }

  async function removePlatform(platform: UserPlatform) {
    if (!data) return;
    const next = { ...data, platforms: data.platforms.filter(item => item.igdb_platform_id !== platform.igdb_platform_id) };
    if (isDemo) query.setData(next); else await runOptimistic('Removendo console…', () => query.setData(next), () => query.setData(data), () => supabase.from('user_platforms').delete().eq('user_id', user!.id).eq('igdb_platform_id', platform.igdb_platform_id));
  }

  return <div className="mx-auto max-w-3xl animate-fade-in">
    <div className="mb-5 flex items-center justify-between gap-3"><h1 className="text-2xl font-black tracking-tight sm:text-3xl">Meus Jogos</h1><div className="flex gap-2">
      <Dialog open={platformsDialog.open} onOpenChange={open => open ? platformsDialog.show() : platformsDialog.close()}><DialogTrigger asChild><button aria-label="Gerenciar consoles" className="grid size-10 place-items-center rounded-xl border border-white/8 bg-white/[.035]"><Gamepad2 className="size-4" /></button></DialogTrigger><DialogContent title="Meus consoles"><form onSubmit={searchPlatforms} className="flex gap-2 border-b border-white/8 p-4"><input value={platformQuery} onChange={event => setPlatformQuery(event.target.value)} placeholder="Buscar console" className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/25 px-3 text-sm outline-none" /><button className="h-11 rounded-xl bg-violet-600 px-4 text-xs font-bold">Buscar</button></form><div className="max-h-[58dvh] space-y-2 overflow-y-auto p-4">{data?.platforms.map(platform => <div key={platform.igdb_platform_id} className="flex items-center gap-3 rounded-xl bg-white/[.035] p-3"><span className="min-w-0 flex-1 truncate text-sm font-bold">{platform.name}</span><button onClick={() => void removePlatform(platform)} aria-label={`Remover ${platform.name}`} className="grid size-8 place-items-center text-red-300"><X className="size-4" /></button></div>)}{platformSearching ? <Skeleton className="h-16 w-full" /> : platformError ? <p className="text-sm text-red-300">{platformError}</p> : platformResults.map(platform => <button key={platform.igdb_platform_id} disabled={data?.platforms.some(item => item.igdb_platform_id === platform.igdb_platform_id)} onClick={() => void addPlatform(platform)} className="flex w-full items-center justify-between rounded-xl bg-white/[.035] p-3 text-left text-sm font-bold disabled:text-emerald-400"><span className="truncate">{platform.name}</span><Plus className="size-4" /></button>)}</div></DialogContent></Dialog>
      <Dialog open={addDialog.open} onOpenChange={open => open ? addDialog.show() : addDialog.close()}><DialogTrigger asChild><button className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-xs font-extrabold"><Plus className="size-4" />Adicionar</button></DialogTrigger><DialogContent title="Adicionar a Meus Jogos"><form onSubmit={searchGames} className="flex gap-2 border-b border-white/8 p-4"><input autoFocus value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Nome do jogo" className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/25 px-3 text-sm outline-none" /><button className="h-11 rounded-xl bg-violet-600 px-4 text-xs font-bold">Buscar</button></form><div className="max-h-[60dvh] space-y-2 overflow-y-auto p-4">{searching ? <ListSkeleton count={3} /> : searchError ? <p className="text-sm text-red-300">{searchError}</p> : results.map(game => { const added = data?.library.some(item => item.game.id === game.id && item.inBacklog); return <GameListCard key={game.id} game={game} action={<button disabled={added} onClick={() => void addToMyGames(game)} className="rounded-lg bg-violet-500/15 px-3 py-2 text-[10px] font-bold text-violet-300 disabled:text-emerald-300">{added ? 'Adicionado' : 'Adicionar'}</button>} />; })}</div></DialogContent></Dialog>
    </div></div>

    <label className="relative block"><Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-600" /><input value={textFilter} onChange={event => setTextFilter(event.target.value)} placeholder="Buscar nos seus jogos" className="h-12 w-full rounded-2xl border border-white/8 bg-white/[.035] pl-10 pr-4 text-sm outline-none focus:border-violet-500" /></label>
    <div className="-mx-4 mt-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-8 sm:px-8 [&::-webkit-scrollbar]:hidden"><div className="flex w-max gap-2">{quickFilters.map(({ value, label, Icon }) => <button key={value} onClick={() => setQuickFilter(value)} data-selected={quickFilter === value} className="library-filter-chip inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold"><Icon className="size-3.5" />{label}</button>)}</div></div>
    <div className="my-4 flex items-center justify-between gap-2"><span className="text-[11px] font-bold text-zinc-500">{visible.length} {visible.length === 1 ? 'jogo' : 'jogos'}</span><div className="flex gap-2">
      <Dialog open={filterDialog.open} onOpenChange={open => open ? filterDialog.show() : filterDialog.close()}><DialogTrigger asChild><button className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/8 bg-white/[.035] px-3 text-[10px] font-bold"><Filter className="size-3.5" />Filtros</button></DialogTrigger><DialogContent title="Filtros"><div className="space-y-2 p-4">{[[playableOnly, setPlayableOnly, 'Nos meus consoles'], [shortOnly, setShortOnly, 'Até 12 horas'], [ratedOnly, setRatedOnly, 'Com nota'], [grouped, setGrouped, 'Agrupar por status']] .map(([checked, setter, label]) => <label key={label as string} className="flex items-center justify-between rounded-xl bg-white/[.035] px-3 py-3 text-sm font-bold"><span>{label as string}</span><input type="checkbox" checked={checked as boolean} onChange={event => (setter as (value: boolean) => void)(event.target.checked)} className="size-4 accent-violet-500" /></label>)}</div></DialogContent></Dialog>
      <DropdownMenu.Root><DropdownMenu.Trigger className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/8 bg-white/[.035] px-3 text-[10px] font-bold"><ArrowDownAZ className="size-3.5" />Ordenar<ChevronDown className="size-3" /></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content align="end" className="app-popup animated-popup z-[100] min-w-44 rounded-xl border border-white/10 bg-zinc-900 p-1.5 shadow-2xl">{([['recent', 'Atualizados'], ['title', 'Título'], ['duration', 'Duração'], ['rating', 'Nota']] as Array<[SortMode, string]>).map(([value, label]) => <DropdownMenu.Item key={value} onSelect={() => setSortMode(value)} className="flex items-center justify-between rounded-lg px-3 py-2.5 text-xs font-bold outline-none data-[highlighted]:bg-white/8">{label}{sortMode === value && <Check className="size-3.5" />}</DropdownMenu.Item>)}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
    </div></div>

    {query.isInitialLoading ? <ListSkeleton count={6} /> : visible.length ? <div ref={listParent} className="space-y-5">{groups.map(group => <section key={group.status || 'all'}>{group.status && <h2 className="mb-2 text-[10px] font-black uppercase tracking-[.16em] text-zinc-500">{statusLabel[group.status]}</h2>}<div className="space-y-2.5">{group.items.map(item => {
      const status = item.progress?.status || 'not_started';
      return <GameListCard key={item.game.id} game={item.game} action={<><span className={`library-status library-status-${status} mr-auto inline-flex items-center gap-1 text-[10px] font-bold`}>{statusLabel[status]}</span>{item.favorite && <Heart className="size-3.5 fill-current text-pink-400" />}<DropdownMenu.Root><DropdownMenu.Trigger aria-label={`Opções de ${item.game.title}`} className="grid size-8 place-items-center rounded-lg bg-white/[.04] text-zinc-400"><MoreHorizontal className="size-4" /></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={6} className="app-popup animated-popup z-[100] min-w-52 rounded-xl border border-white/10 bg-zinc-900 p-1.5 shadow-2xl outline-none"><DropdownMenu.Item onSelect={() => void toggleFavorite(item)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-bold outline-none data-[highlighted]:bg-white/8"><Heart className={`size-3.5 ${item.favorite ? 'fill-current text-pink-400' : ''}`} />{item.favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}</DropdownMenu.Item><DropdownMenu.Separator className="my-1 h-px bg-white/8" />{(['started', 'finished', 'not_started'] as ProgressStatus[]).map(nextStatus => <DropdownMenu.Item key={nextStatus} disabled={status === nextStatus} onSelect={() => setProgressTarget({ item, status: nextStatus })} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-bold outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-white/8">{statusLabel[nextStatus]}</DropdownMenu.Item>)}{item.inBacklog && <><DropdownMenu.Separator className="my-1 h-px bg-white/8" /><DropdownMenu.Item onSelect={() => setRemoveTarget(item)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-bold text-red-300 outline-none data-[highlighted]:bg-red-500/10"><Trash2 className="size-3.5" />Remover de Meus Jogos</DropdownMenu.Item></>}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root></>} />;
    })}</div></section>)}</div> : <div className="grid min-h-60 place-items-center rounded-3xl border border-dashed border-white/10 text-center"><div><SlidersHorizontal className="mx-auto size-8 text-zinc-700" /><h2 className="mt-3 text-sm font-bold">Nenhum jogo encontrado</h2></div></div>}

    <ProgressConfirmationDialog open={Boolean(progressTarget)} onOpenChange={open => { if (!open) setProgressTarget(null); }} game={progressTarget?.item.game || null} currentStatus={progressTarget?.item.progress?.status || 'not_started'} targetStatus={progressTarget?.status || 'not_started'} onConfirm={() => void applyProgress()} />
    <Dialog open={Boolean(removeTarget)} onOpenChange={open => { if (!open) setRemoveTarget(null); }}><DialogContent title="Remover de Meus Jogos" className="max-w-sm"><div className="p-4 text-sm text-zinc-400">{removeTarget?.game.title}</div><div className="flex gap-2 p-4 pt-0"><DialogClose className="h-10 flex-1 rounded-xl bg-white/5 text-xs font-bold">Cancelar</DialogClose><DialogClose onClick={() => removeTarget && void removeFromMyGames(removeTarget)} className="h-10 flex-1 rounded-xl bg-red-600 text-xs font-bold text-white">Remover</DialogClose></div></DialogContent></Dialog>
  </div>;
}

export default function YourGamesPage() { return <YourGamesPanel />; }
