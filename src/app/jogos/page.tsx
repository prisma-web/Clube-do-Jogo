'use client';

import { useMemo, useState } from 'react';
import { CalendarClock, Check, Filter, Flame, Search, Sparkles, Star } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { demoGames, demoProfiles } from '@/lib/demo-data';
import { fetchProfileWithGames } from '@/lib/data';
import { shiftMonth } from '@/lib/utils';
import type { DiscoverItem, DiscoverSource } from '@/lib/types';
import { useStaleQuery } from '@/hooks/use-stale-query';
import { useApp } from '@/components/app-provider';
import { DiscoverGameCard } from '@/components/discover-game-card';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { ListSkeleton } from '@/components/ui/skeleton';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { usePersistentState } from '@/hooks/use-persistent-state';

const sources: Array<{ value: DiscoverSource; label: string; Icon: typeof Flame }> = [
  { value: 'popular', label: 'Populares', Icon: Flame },
  { value: 'rated', label: 'Melhores notas', Icon: Star },
  { value: 'recent', label: 'Lançamentos', Icon: Sparkles },
  { value: 'anticipated', label: 'Em breve', Icon: CalendarClock },
];

const genres = [['', 'Todos'], ['12', 'RPG'], ['31', 'Aventura'], ['32', 'Indie'], ['8', 'Plataforma'], ['9', 'Puzzle'], ['15', 'Estratégia'], ['5', 'Tiro']];
const platforms = [['', 'Todas'], ['6', 'PC'], ['167', 'PlayStation 5'], ['169', 'Xbox Series'], ['130', 'Nintendo Switch']];

function demoDiscover(source: DiscoverSource, query: string, genre: string, platform: string, year: string): DiscoverItem[] {
  let games = [...demoGames];
  const normalized = query.toLocaleLowerCase('pt-BR');
  if (normalized) games = games.filter(game => [game.title, ...(game.genres || []), ...(game.platforms || [])].some(value => value.toLocaleLowerCase('pt-BR').includes(normalized)));
  if (genre) games = games.filter(game => (game.genres || []).some(value => value.toLocaleLowerCase('pt-BR').includes(genres.find(([id]) => id === genre)?.[1].toLocaleLowerCase('pt-BR') || '')));
  if (platform) games = games.filter(game => (game.platform_ids || []).includes(Number(platform)));
  if (year) games = games.filter(game => game.release_year === Number(year));
  if (source === 'rated' || source === 'popular') games.sort((a, b) => Number(b.average_rating || 0) - Number(a.average_rating || 0));
  if (source === 'recent' || source === 'anticipated') games.sort((a, b) => Number(b.release_year || 0) - Number(a.release_year || 0));
  if (source === 'friends') return games.map((game, index) => ({ game, activityCount: 1 + index % 4, people: demoProfiles.slice(1, 2 + index % 3).map(profile => profile.name || 'Membro') }));
  if (source === 'ranking') return games.map((game, index) => ({ game, activityCount: 1 + index % 5, addedAt: new Date(Date.now() - index * 3_600_000).toISOString() }));
  return games.map(game => ({ game }));
}

export default function AllGamesPage() {
  const supabase = useMemo(() => createClient(), []);
  const { user, isDemo, selectedMonth, runOptimistic, notify } = useApp();
  const [source, setSource] = usePersistentState<DiscoverSource>('discover:source:v2', 'popular');
  const [draftSearch, setDraftSearch] = useState('');
  const search = useDebouncedValue(draftSearch.trim(), 350);
  const [genre, setGenre] = usePersistentState('discover:genre', '');
  const [platform, setPlatform] = usePersistentState('discover:platform', '');
  const [year, setYear] = usePersistentState('discover:year', '');
  const [pagination, setPagination] = useState<{ key: string; items: DiscoverItem[]; hasMore: boolean }>({ key: '', items: [], hasMore: false });
  const [loadingMore, setLoadingMore] = useState(false);
  const [localLibrary, setLocalLibrary] = useState<string[]>([]);
  const [localRanking, setLocalRanking] = useState<string[]>([]);
  const voteMonth = shiftMonth(selectedMonth, 1);
  const queryKey = `${source}:${search}:${genre}:${platform}:${year}:${voteMonth}`;
  const catalog = useStaleQuery(`discover:${queryKey}`, async () => {
    if (isDemo) return { items: demoDiscover(source, search, genre, platform, year), hasMore: false };
    const params = new URLSearchParams({ source, q: search, genre, platform, year, month: voteMonth, limit: '24' });
    const response = await fetch(`/api/discover?${params}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar os jogos.');
    return payload as { items: DiscoverItem[]; hasMore: boolean };
  });
  const library = useStaleQuery(`discover-library:${user?.id}:${voteMonth}`, () => fetchProfileWithGames(supabase, user!.id, isDemo, voteMonth), Boolean(user));
  const extra = pagination.key === queryKey ? pagination.items : [];
  const items = [...(catalog.data?.items || []), ...extra];
  const hasMore = pagination.key === queryKey ? pagination.hasMore : Boolean(catalog.data?.hasMore);
  const myGameIds = new Set([...(library.data?.library.filter(item => item.inBacklog).map(item => item.game.id) || []), ...localLibrary]);
  const rankingIds = new Set([...(library.data?.rankingGameIds || []), ...localRanking]);

  async function loadMore() {
    if (isDemo || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ source, q: search, genre, platform, year, month: voteMonth, limit: '24', offset: String(items.length) });
      const response = await fetch(`/api/discover?${params}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar mais jogos.');
      setPagination({ key: queryKey, items: [...extra, ...payload.items], hasMore: payload.hasMore });
    } finally { setLoadingMore(false); }
  }

  async function addToMyGames(item: DiscoverItem) {
    if (myGameIds.has(item.game.id)) return;
    const previous = localLibrary;
    const next = [...previous, item.game.id];
    const apply = () => setLocalLibrary(next);
    const rollback = () => setLocalLibrary(previous);
    if (isDemo) { apply(); notify('Adicionado a Meus Jogos'); return; }
    const saved = await runOptimistic('Adicionando a Meus Jogos…', apply, rollback, () => supabase.from('backlogs').upsert({ user_id: user!.id, game_id: item.game.id }, { onConflict: 'user_id,game_id' }));
    if (saved) notify('Adicionado a Meus Jogos');
  }

  async function addToRanking(item: DiscoverItem) {
    if (rankingIds.has(item.game.id)) return;
    const previous = localRanking;
    const next = [...previous, item.game.id];
    const apply = () => setLocalRanking(next);
    const rollback = () => setLocalRanking(previous);
    if (isDemo) { apply(); notify('Adicionado ao ranking como Jogaria'); return; }
    const saved = await runOptimistic('Adicionando ao ranking…', apply, rollback, () => supabase.from('votes').upsert({ user_id: user!.id, game_id: item.game.id, vote_month: voteMonth, choice: 'would_play' }, { onConflict: 'user_id,game_id,vote_month' }));
    if (saved) notify('Adicionado ao ranking como Jogaria');
  }

  return (
    <div className="mx-auto max-w-5xl animate-fade-in">
      <div className="mb-5 flex items-center justify-between gap-3"><h1 className="text-2xl font-black tracking-tight sm:text-3xl">Todos os jogos</h1><Dialog><DialogTrigger asChild><button className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/8 bg-white/[.035] px-3 text-[11px] font-bold"><Filter className="size-4" />Filtros{(genre || platform || year) && <span className="grid size-4 place-items-center rounded-full bg-violet-500 text-[8px] text-white">{[genre, platform, year].filter(Boolean).length}</span>}</button></DialogTrigger><DialogContent title="Filtros"><div className="grid gap-4 p-4"><label className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Gênero<select value={genre} onChange={event => setGenre(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm font-semibold text-zinc-200 outline-none">{genres.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Plataforma<select value={platform} onChange={event => setPlatform(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm font-semibold text-zinc-200 outline-none">{platforms.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Ano<input type="number" inputMode="numeric" min="1970" max="2035" value={year} onChange={event => setYear(event.target.value)} placeholder="Todos" className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm font-semibold text-zinc-200 outline-none" /></label>{(genre || platform || year) && <button onClick={() => { setGenre(''); setPlatform(''); setYear(''); }} className="h-10 rounded-xl bg-white/5 text-xs font-bold text-zinc-400">Limpar filtros</button>}</div></DialogContent></Dialog></div>
      <div className="relative"><Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-600" /><input value={draftSearch} onChange={event => setDraftSearch(event.target.value)} placeholder="Buscar jogos, gêneros ou plataformas" className="h-12 w-full rounded-2xl border border-white/8 bg-white/[.035] pl-10 pr-4 text-sm outline-none focus:border-violet-500" /></div>
      <div className="-mx-4 mt-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-8 sm:px-8 [&::-webkit-scrollbar]:hidden"><div className="flex w-max gap-2">{sources.map(({ value, label, Icon }) => <button key={value} onClick={() => setSource(value)} data-selected={source === value} className="library-filter-chip inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold"><Icon className="size-3.5" />{label}</button>)}</div></div>
      <div className="my-5 flex items-center justify-between"><span className="text-[10px] font-black uppercase tracking-[.14em] text-zinc-600">{items.length} jogos</span>{(genre || platform || year) && <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-300"><Check className="size-3" />Filtros ativos</span>}</div>
      {catalog.isInitialLoading ? <ListSkeleton count={8} /> : catalog.error ? <div className="grid min-h-60 place-items-center rounded-3xl border border-dashed border-red-400/15 p-8 text-center text-sm text-red-200">{catalog.error.message}</div> : items.length ? <><div className="discover-grid grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 md:grid-cols-5 min-[1180px]:grid-cols-6">{items.map(item => <DiscoverGameCard key={item.game.id} item={item} inMyGames={myGameIds.has(item.game.id)} inRanking={rankingIds.has(item.game.id)} onAddToMyGames={() => void addToMyGames(item)} onAddToRanking={() => void addToRanking(item)} />)}</div>{hasMore && <button disabled={loadingMore} onClick={() => void loadMore()} className="mt-8 h-11 w-full rounded-xl border border-white/8 bg-white/[.035] text-xs font-bold disabled:opacity-50">{loadingMore ? 'Carregando…' : 'Carregar mais'}</button>}</> : <div className="grid min-h-60 place-items-center rounded-3xl border border-dashed border-white/10 text-center text-sm text-zinc-500">Nenhum jogo encontrado</div>}
    </div>
  );
}
