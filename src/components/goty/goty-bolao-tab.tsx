'use client';

import { useMemo, useState } from 'react';
import {
  Award,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Crown,
  Eye,
  Filter,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
  Unlock,
  XCircle,
} from 'lucide-react';
import {
  computeBolaoLeaderboard,
  computeBolaoProgress,
  isBolaoVotingOpen,
  type GotyCategory,
  type GotyCategorySection,
  type GotyEventStatus,
  type GotyFullState,
  type GotyLeaderboardEntry,
} from '@clube-do-jogo/domain';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { GotyPosterArt } from './goty-poster-art';
import { TgaEmblem } from './tga-emblem';

type BolaoView = 'ballot' | 'leaderboard' | 'admin';
type BallotFilter = 'all' | 'pending' | 'answered' | GotyCategorySection;

const FILTER_OPTIONS: Array<{ id: BallotFilter; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'pending', label: 'Pendentes' },
  { id: 'answered', label: 'Respondidas' },
  { id: 'main', label: 'Principais' },
  { id: 'craft', label: 'Arte & Técnica' },
  { id: 'genre', label: 'Gêneros' },
  { id: 'community_esports', label: 'Comunidade & Esports' },
];

function formatDateTimePt(value?: string | null): string {
  if (!value) return 'Sem prazo definido';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function toDatetimeLocalValue(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function GotyBolaoTab({
  state,
  userId,
  isAdmin,
  onSelectVote,
  onSetConfirmation,
  onAdminUpdateEvent,
  onAdminSetWinner,
  onAdminSyncCovers,
}: {
  state: GotyFullState;
  userId: string;
  isAdmin: boolean;
  onSelectVote: (categoryId: string, nomineeId: string) => Promise<void>;
  onSetConfirmation: (confirm: boolean) => Promise<void>;
  onAdminUpdateEvent: (patch: { status?: GotyEventStatus; votingClosesAt?: string | null; personalVotingOpen?: boolean }) => Promise<void>;
  onAdminSetWinner: (categoryId: string, winnerNomineeId: string | null) => Promise<void>;
  onAdminSyncCovers: () => Promise<void>;
}) {
  const [view, setView] = useState<BolaoView>('ballot');
  const [filter, setFilter] = useState<BallotFilter>('all');
  const [search, setSearch] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [inspectEntry, setInspectEntry] = useState<GotyLeaderboardEntry | null>(null);
  const [syncingCovers, setSyncingCovers] = useState(false);
  const [adminCategorySearch, setAdminCategorySearch] = useState('');
  const [deadlineDraft, setDeadlineDraft] = useState(() => toDatetimeLocalValue(state.event.voting_closes_at));
  const [confirming, setConfirming] = useState(false);

  const votingOpen = useMemo(() => isBolaoVotingOpen(state.event), [state.event]);
  const myVotes = useMemo(
    () => state.bolaoVotes.filter(vote => vote.user_id === userId),
    [state.bolaoVotes, userId],
  );
  const myVotesByCategory = useMemo(
    () => new Map(myVotes.map(vote => [vote.category_id, vote.nominee_id])),
    [myVotes],
  );
  const mySubmission = useMemo(
    () => state.bolaoSubmissions.find(item => item.user_id === userId) ?? null,
    [state.bolaoSubmissions, userId],
  );
  const isConfirmed = Boolean(mySubmission?.confirmed_at);

  const progress = useMemo(
    () => computeBolaoProgress(state.categories, myVotes),
    [state.categories, myVotes],
  );
  const announcedCount = useMemo(
    () => state.categories.filter(category => Boolean(category.winner_nominee_id)).length,
    [state.categories],
  );
  const leaderboard = useMemo(
    () => computeBolaoLeaderboard(state.categories, state.bolaoVotes, state.bolaoSubmissions, state.profiles),
    [state.categories, state.bolaoVotes, state.bolaoSubmissions, state.profiles],
  );
  const myLeaderboardEntry = useMemo(
    () => leaderboard.find(entry => entry.user_id === userId) ?? null,
    [leaderboard, userId],
  );

  const filteredCategories = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('pt-BR');
    return state.categories.filter(category => {
      const answered = myVotesByCategory.has(category.id);
      if (filter === 'pending' && answered) return false;
      if (filter === 'answered' && !answered) return false;
      if (filter !== 'all' && filter !== 'pending' && filter !== 'answered' && category.section !== filter) {
        return false;
      }
      if (!needle) return true;
      return (
        category.name.toLocaleLowerCase('pt-BR').includes(needle)
        || category.name_pt.toLocaleLowerCase('pt-BR').includes(needle)
        || category.nominees.some(nominee =>
          nominee.title.toLocaleLowerCase('pt-BR').includes(needle)
          || (nominee.subtitle || '').toLocaleLowerCase('pt-BR').includes(needle),
        )
      );
    });
  }, [filter, myVotesByCategory, search, state.categories]);

  const adminFilteredCategories = useMemo(() => {
    const needle = adminCategorySearch.trim().toLocaleLowerCase('pt-BR');
    if (!needle) return state.categories;
    return state.categories.filter(category =>
      category.name.toLocaleLowerCase('pt-BR').includes(needle)
      || category.name_pt.toLocaleLowerCase('pt-BR').includes(needle)
      || category.nominees.some(nominee => nominee.title.toLocaleLowerCase('pt-BR').includes(needle)),
    );
  }, [adminCategorySearch, state.categories]);

  const inspectedVotesByCategory = useMemo(() => {
    if (!inspectEntry) return new Map<string, string>();
    return new Map(
      state.bolaoVotes
        .filter(vote => vote.user_id === inspectEntry.user_id)
        .map(vote => [vote.category_id, vote.nominee_id]),
    );
  }, [inspectEntry, state.bolaoVotes]);

  async function handleConfirmToggle(confirm: boolean) {
    setConfirming(true);
    try {
      await onSetConfirmation(confirm);
      if (confirm) setReviewOpen(false);
    } finally {
      setConfirming(false);
    }
  }

  async function handleSyncCovers() {
    setSyncingCovers(true);
    try {
      await onAdminSyncCovers();
    } finally {
      setSyncingCovers(false);
    }
  }

  function jumpToCategory(categoryId: string) {
    setReviewOpen(false);
    setView('ballot');
    setFilter('all');
    setSearch('');
    window.setTimeout(() => {
      document.getElementById(`goty-cat-${categoryId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
  }

  return (
    <div className="space-y-6">
      {/* Sub-navegação interna do Bolão */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
        <div
          className={cn(
            'grid w-full gap-1 rounded-2xl border border-[#dfc06c]/20 bg-[#100f15] p-1 sm:inline-flex sm:w-auto',
            isAdmin ? 'grid-cols-3' : 'grid-cols-2',
          )}
        >
          <button
            type="button"
            onClick={() => setView('ballot')}
            className={cn(
              'inline-flex h-9 min-w-0 items-center justify-center gap-1 rounded-xl px-2 text-[11px] font-extrabold transition sm:gap-1.5 sm:px-3.5 sm:text-xs',
              view === 'ballot'
                ? 'bg-gradient-to-r from-[#d4ab48] to-[#f0d586] text-[#140f05] shadow-md'
                : 'text-[#b7ab8f] hover:text-[#f6ecd0]',
            )}
          >
            <ClipboardCheck className="size-3.5 shrink-0" />
            <span className="truncate">Palpites</span>
          </button>
          <button
            type="button"
            onClick={() => setView('leaderboard')}
            className={cn(
              'inline-flex h-9 min-w-0 items-center justify-center gap-1 rounded-xl px-2 text-[11px] font-extrabold transition sm:gap-1.5 sm:px-3.5 sm:text-xs',
              view === 'leaderboard'
                ? 'bg-gradient-to-r from-[#d4ab48] to-[#f0d586] text-[#140f05] shadow-md'
                : 'text-[#b7ab8f] hover:text-[#f6ecd0]',
            )}
          >
            <Trophy className="size-3.5 shrink-0" />
            <span className="truncate">Ranking</span>
            {announcedCount > 0 && (
              <span className="hidden rounded-full bg-black/25 px-1.5 py-0.5 text-[10px] sm:inline">
                {announcedCount}/30
              </span>
            )}
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setView('admin')}
              className={cn(
                'inline-flex h-9 min-w-0 items-center justify-center gap-1 rounded-xl px-2 text-[11px] font-extrabold transition sm:gap-1.5 sm:px-3.5 sm:text-xs',
                view === 'admin'
                  ? 'bg-gradient-to-r from-[#d4ab48] to-[#f0d586] text-[#140f05] shadow-md'
                  : 'text-[#b7ab8f] hover:text-[#f6ecd0]',
              )}
            >
              <ShieldCheck className="size-3.5 shrink-0" />
              <span className="truncate">Apuração</span>
            </button>
          )}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2 text-[11px] font-bold">
          {votingOpen ? (
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-emerald-200 sm:px-3">
              <Unlock className="size-3 shrink-0" />
              <span className="truncate">Bolão aberto · até {formatDateTimePt(state.event.voting_closes_at)}</span>
            </span>
          ) : (
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#dfc06c]/30 bg-[#dfc06c]/10 px-2.5 py-1 text-[#f2d68a] sm:px-3">
              <Lock className="size-3 shrink-0" />
              <span className="truncate">
                {state.event.status === 'results_published' ? 'Resultados oficiais publicados' : 'Bolão encerrado para palpites'}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Painel de progresso & revisão */}
      {view === 'ballot' && (
        <>
          <section className="goty-surface sticky top-[calc(4.15rem+env(safe-area-inset-top))] z-30 rounded-2xl border border-[#dfc06c]/25 bg-[#0e0d13]/95 px-3 py-2.5 shadow-[0_14px_38px_rgba(0,0,0,0.68)] backdrop-blur-xl min-[960px]:top-4 sm:rounded-3xl sm:p-5">
            <div className="flex items-center justify-between gap-2.5 sm:gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#e3c168] sm:tracking-[0.18em]">
                    Progresso
                  </span>
                  {isConfirmed ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/35 bg-emerald-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-200 sm:text-[10px]">
                      <CheckCircle2 className="size-2.5 sm:size-3" />
                      Confirmado
                    </span>
                  ) : progress.answered > 0 ? (
                    <span className="hidden items-center gap-1 rounded-full border border-[#dfc06c]/25 bg-[#dfc06c]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#efd68e] sm:inline-flex">
                      Rascunho salvo automaticamente
                    </span>
                  ) : null}
                  {announcedCount > 0 && myLeaderboardEntry && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-[#dfc06c]/35 bg-[#dfc06c]/15 px-2 py-0.5 text-[9px] font-black text-[#fae39f] sm:text-[10px]">
                      <Trophy className="size-2.5 sm:size-3" />
                      {myLeaderboardEntry.correctCount}/{announcedCount}
                    </span>
                  )}
                </div>

                <div className="mt-1.5 flex items-center gap-2 sm:mt-2 sm:gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.08] sm:h-2.5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#a87e24] via-[#e2bc5b] to-[#fff0b3] transition-all duration-500 ease-out"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                  <span className="shrink-0 text-[11px] font-black tabular-nums text-[#f9f1d8] sm:text-xs">
                    {progress.answered}/{progress.total}
                    <span className="ml-1 hidden text-[10px] font-bold text-[#a99c7f] sm:inline">({progress.percent}%)</span>
                  </span>
                </div>
              </div>

              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => setReviewOpen(true)}
                  className={cn(
                    'inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-[11px] font-black transition active:scale-[0.98] sm:h-10 sm:gap-2 sm:px-4 sm:text-xs',
                    votingOpen && !isConfirmed
                      ? 'bg-gradient-to-r from-[#c79933] via-[#e6c263] to-[#f4df9a] text-[#171106] shadow-[0_8px_24px_rgba(218,176,72,0.3)] hover:brightness-105'
                      : 'border border-[#dfc06c]/30 bg-[#181620] text-[#f4e4b5] hover:border-[#dfc06c]/55',
                  )}
                >
                  <Eye className="size-3.5 shrink-0" />
                  <span className="sm:hidden">{isConfirmed ? 'Ver' : votingOpen ? 'Revisar' : 'Palpites'}</span>
                  <span className="hidden sm:inline">
                    {isConfirmed ? 'Ver minhas previsões' : votingOpen ? 'Revisar e confirmar' : 'Consultar palpites'}
                  </span>
                </button>
              </div>
            </div>
          </section>

          {/* Busca e filtros de categoria */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#9d8f70]" />
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Filtrar categorias ou indicados…"
                className="h-11 w-full rounded-2xl border border-[#dfc06c]/18 bg-[#111017] pl-10 pr-4 text-sm text-[#faf4e4] placeholder:text-[#7f745c] outline-none transition focus:border-[#e3c168]/55"
              />
            </div>

            <div className="-mx-3.5 overflow-x-auto px-3.5 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
              <div className="flex w-max items-center gap-1.5">
                <Filter className="mr-1 size-3.5 text-[#9d8f70]" />
                {FILTER_OPTIONS.map(option => {
                  const count =
                    option.id === 'all'
                      ? state.categories.length
                      : option.id === 'pending'
                        ? progress.missingCategoryIds.length
                        : option.id === 'answered'
                          ? progress.answered
                          : state.categories.filter(cat => cat.section === option.id).length;
                  const active = filter === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setFilter(option.id)}
                      className={cn(
                        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold transition',
                        active
                          ? 'border-[#e8c66d]/60 bg-[#dfc06c]/18 text-[#fbf0cc]'
                          : 'border-white/10 bg-[#121118] text-[#a79c82] hover:border-[#dfc06c]/30 hover:text-[#eee3c3]',
                      )}
                    >
                      {option.label}
                      <span className="text-[10px] opacity-75">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Lista das 30 categorias oficiais */}
          {filteredCategories.length === 0 ? (
            <div className="grid min-h-52 place-items-center rounded-3xl border border-dashed border-[#dfc06c]/20 bg-[#0f0e14] p-8 text-center">
              <div>
                <Sparkles className="mx-auto size-7 text-[#c9a854]" />
                <p className="mt-2 text-sm font-extrabold text-[#f7efd7]">
                  Nenhuma categoria encontrada para este filtro
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setFilter('all');
                    setSearch('');
                  }}
                  className="mt-3 rounded-xl border border-[#dfc06c]/30 bg-[#dfc06c]/10 px-4 py-2 text-xs font-bold text-[#f3da91]"
                >
                  Mostrar todas as 30 categorias
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {filteredCategories.map(category => (
                <CategoryCard
                  key={category.id}
                  category={category}
                  selectedNomineeId={myVotesByCategory.get(category.id) ?? null}
                  votingOpen={votingOpen}
                  isConfirmed={isConfirmed}
                  onSelect={nomineeId => onSelectVote(category.id, nomineeId)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Classificação Geral & Desempenho Individual */}
      {view === 'leaderboard' && (
        <div className="space-y-6">
          {/* Card de desempenho individual */}
          <section className="goty-surface relative overflow-hidden rounded-3xl border border-[#dfc06c]/30 bg-gradient-to-br from-[#19150d] via-[#100f15] to-[#0a0a0e] p-5 sm:p-6">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-10 -top-10 size-44 rounded-full bg-[#dfc06c]/12 blur-3xl"
            />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-[#e5c369]">
                  <Award className="size-3.5" />
                  Seu Desempenho no Bolão
                </span>
                <h2 className="mt-1 text-xl font-black tracking-tight text-[#fff9e8] sm:text-2xl">
                  {announcedCount === 0
                    ? 'Aguardando os vencedores oficiais'
                    : myLeaderboardEntry
                      ? `${myLeaderboardEntry.correctCount} ${myLeaderboardEntry.correctCount === 1 ? 'acerto' : 'acertos'} em ${announcedCount} ${announcedCount === 1 ? 'categoria apurada' : 'categorias apuradas'}`
                      : 'Você ainda não registrou palpites'}
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-[#b7aa8c]">
                  {announcedCount === 0
                    ? 'Assim que um administrador registrar os vencedores oficiais após a premiação, a pontuação e o ranking serão calculados automaticamente.'
                    : myLeaderboardEntry
                      ? `Aproveitamento de ${myLeaderboardEntry.accuracyPercent}% · Posição atual: #${myLeaderboardEntry.rank}${myLeaderboardEntry.hitGoty ? ' · Acertou o Game of the Year!' : ''}`
                      : 'Volte na aba Meus palpites para preencher suas previsões.'}
                </p>
              </div>

              {myLeaderboardEntry && (
                <div className="grid grid-cols-3 gap-2 sm:w-72">
                  <div className="rounded-2xl border border-[#dfc06c]/20 bg-black/35 p-3 text-center">
                    <span className="block text-[9px] font-black uppercase tracking-wider text-[#a99b7c]">Posição</span>
                    <strong className="mt-1 block text-lg font-black text-[#f7de93]">#{myLeaderboardEntry.rank}</strong>
                  </div>
                  <div className="rounded-2xl border border-[#dfc06c]/20 bg-black/35 p-3 text-center">
                    <span className="block text-[9px] font-black uppercase tracking-wider text-[#a99b7c]">Acertos</span>
                    <strong className="mt-1 block text-lg font-black text-[#fff9e8]">{myLeaderboardEntry.correctCount}</strong>
                  </div>
                  <div className="rounded-2xl border border-[#dfc06c]/20 bg-black/35 p-3 text-center">
                    <span className="block text-[9px] font-black uppercase tracking-wider text-[#a99b7c]">Palpites</span>
                    <strong className="mt-1 block text-lg font-black text-[#d6cab0]">{myLeaderboardEntry.votedCount}/30</strong>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Pódio Top 3 quando já houver resultados apurados */}
          {announcedCount > 0 && leaderboard.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {leaderboard.slice(0, 3).map((entry, idx) => (
                <button
                  key={entry.user_id}
                  type="button"
                  onClick={() => setInspectEntry(entry)}
                  className={cn(
                    'goty-surface group relative overflow-hidden rounded-3xl border p-4 text-left transition hover:-translate-y-0.5',
                    idx === 0
                      ? 'border-[#f0cf72]/55 bg-gradient-to-b from-[#241c0d] to-[#0f0e14] shadow-[0_14px_40px_rgba(220,178,74,0.16)]'
                      : 'border-[#dfc06c]/20 bg-[#111017] hover:border-[#dfc06c]/40',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider',
                        idx === 0
                          ? 'bg-[#e8c362] text-[#171105]'
                          : idx === 1
                            ? 'bg-zinc-200/90 text-zinc-900'
                            : 'bg-amber-700/80 text-amber-100',
                      )}
                    >
                      {idx === 0 && <Crown className="size-3" />}
                      #{entry.rank} lugar
                    </span>
                    {entry.hitGoty && (
                      <span className="rounded-full border border-[#e8c362]/40 bg-[#e8c362]/15 px-2 py-0.5 text-[9px] font-black uppercase text-[#f6dc90]">
                        Acertou GOTY
                      </span>
                    )}
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <Avatar src={entry.profile.avatar_url} crop={entry.profile.avatar_crop} name={entry.profile.name} className="size-12 border-[#dfc06c]/35" />
                    <div className="min-w-0 flex-1">
                      <strong className="block truncate text-sm font-black text-[#fff9e8]">
                        {entry.profile.name || 'Membro'}
                      </strong>
                      <span className="block text-xs font-bold text-[#e5c36b]">
                        {entry.correctCount} {entry.correctCount === 1 ? 'acerto' : 'acertos'} ({entry.accuracyPercent}%)
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Tabela geral */}
          <section className="goty-surface overflow-hidden rounded-3xl border border-[#dfc06c]/20 bg-[#0f0e14]">
            <div className="flex items-center justify-between border-b border-[#dfc06c]/15 px-5 py-4">
              <div>
                <h3 className="text-sm font-black tracking-tight text-[#fff8e6]">Classificação Geral do Clube</h3>
                <p className="mt-0.5 text-[11px] text-[#a79c82]">
                  {leaderboard.length} {leaderboard.length === 1 ? 'participante' : 'participantes'} · Clique em alguém para ver os palpites
                </p>
              </div>
              <span className="rounded-full border border-[#dfc06c]/25 bg-[#dfc06c]/10 px-2.5 py-1 text-[10px] font-black text-[#f0d68c]">
                {announcedCount}/30 apuradas
              </span>
            </div>

            {leaderboard.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#9e9278]">
                Nenhum membro registrou palpites no Bolão 2026 ainda.
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {leaderboard.map(entry => {
                  const isMe = entry.user_id === userId;
                  return (
                    <button
                      key={entry.user_id}
                      type="button"
                      onClick={() => setInspectEntry(entry)}
                      className={cn(
                        'flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-[#dfc06c]/[0.06] sm:px-5',
                        isMe && 'bg-[#dfc06c]/[0.07]',
                      )}
                    >
                      <span className="w-8 shrink-0 text-center text-xs font-black tabular-nums text-[#e5c369]">
                        #{entry.rank}
                      </span>
                      <Avatar src={entry.profile.avatar_url} crop={entry.profile.avatar_crop} name={entry.profile.name} className="size-10 border-[#dfc06c]/25" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <strong className="truncate text-sm font-bold text-[#faf4e4]">
                            {entry.profile.name || 'Membro'}
                          </strong>
                          {isMe && (
                            <span className="rounded-full bg-[#dfc06c]/20 px-2 py-0.5 text-[9px] font-black uppercase text-[#f5dd95]">
                              Você
                            </span>
                          )}
                          {entry.hitGoty && announcedCount > 0 && (
                            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2 py-0.5 text-[9px] font-black text-emerald-200">
                              GOTY ✓
                            </span>
                          )}
                        </div>
                        <span className="block text-[11px] text-[#9b8f76]">
                          {entry.votedCount}/30 categorias preenchidas · {entry.confirmedAt ? 'Confirmado' : 'Em rascunho'}
                        </span>
                      </div>
                      <div className="shrink-0 text-right">
                        <strong className="block text-base font-black tabular-nums text-[#fff8e6]">
                          {entry.correctCount}
                          <span className="text-[11px] font-bold text-[#9b8f76]">/{announcedCount || 30}</span>
                        </strong>
                        <span className="block text-[10px] font-bold text-[#c7b588]">
                          {announcedCount > 0 ? `${entry.accuracyPercent}%` : 'Aguardando'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Painel Administrativo de Controle e Apuração Manual */}
      {view === 'admin' && isAdmin && (
        <div className="space-y-6">
          <section className="goty-surface rounded-3xl border border-[#dfc06c]/30 bg-[#100f15] p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-[#e5c369]">
                  <ShieldCheck className="size-3.5" />
                  Controle Administrativo · GOTY 2026
                </span>
                <h2 className="mt-1 text-lg font-black text-[#fff9e8]">
                  Abertura, encerramento e apuração oficial
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-[#a89c7f]">
                  Controle quando o Bolão aceita palpites e registre os vencedores oficiais após a cerimônia. O ranking do clube atualiza automaticamente.
                </p>
              </div>
              <button
                type="button"
                disabled={syncingCovers}
                onClick={() => void handleSyncCovers()}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#dfc06c]/30 bg-[#dfc06c]/10 px-3.5 text-xs font-extrabold text-[#f5dd95] transition hover:bg-[#dfc06c]/20 disabled:opacity-50"
              >
                <RefreshCw className={cn('size-3.5', syncingCovers && 'animate-spin')} />
                {syncingCovers ? 'Buscando capas…' : 'Atualizar capas via IGDB'}
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-[#b8aa8c]">
                  Status do Bolão GOTY
                </span>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {(
                    [
                      { value: 'open', label: 'Aberto', desc: 'Aceita votos' },
                      { value: 'locked', label: 'Encerrado', desc: 'Bloqueia edição' },
                      { value: 'results_published', label: 'Apurado', desc: 'Resultados finais' },
                    ] as const
                  ).map(option => {
                    const active = state.event.status === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => void onAdminUpdateEvent({ status: option.value })}
                        className={cn(
                          'rounded-xl border p-2.5 text-left transition',
                          active
                            ? 'border-[#e8c66d] bg-[#dfc06c]/20 text-[#fff8e4]'
                            : 'border-white/10 bg-white/[0.02] text-[#a79c82] hover:border-[#dfc06c]/35',
                        )}
                      >
                        <strong className="block text-xs font-black">{option.label}</strong>
                        <span className="block text-[10px] opacity-80">{option.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-[#b8aa8c]">
                  Prazo limite do Bolão & Seu GOTY
                </span>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    type="datetime-local"
                    value={deadlineDraft}
                    onChange={event => setDeadlineDraft(event.target.value)}
                    className="h-10 flex-1 rounded-xl border border-white/15 bg-[#16151e] px-3 text-xs font-semibold text-[#faf4e4] outline-none focus:border-[#e5c36b]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const iso = deadlineDraft ? new Date(deadlineDraft).toISOString() : null;
                      void onAdminUpdateEvent({ votingClosesAt: iso });
                    }}
                    className="h-10 shrink-0 rounded-xl bg-[#dfc06c] px-4 text-xs font-black text-[#171105] transition hover:brightness-105"
                  >
                    Salvar prazo
                  </button>
                </div>

                <label className="mt-3 flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-bold text-[#e7dcc0]">
                  <span>Permitir edições no “Seu GOTY” (independente do Bolão)</span>
                  <input
                    type="checkbox"
                    checked={state.event.personal_voting_open}
                    onChange={event => void onAdminUpdateEvent({ personalVotingOpen: event.target.checked })}
                    className="size-4 accent-[#dfc06c]"
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="goty-surface rounded-3xl border border-[#dfc06c]/20 bg-[#0f0e14] p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-black text-[#fff9e8]">
                  Registrar Vencedores Oficiais ({announcedCount}/30)
                </h3>
                <p className="mt-0.5 text-xs text-[#a5997d]">
                  Selecione o vencedor oficial de cada categoria. Você pode registrar aos poucos ou após a cerimônia.
                </p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#9d8f70]" />
                <input
                  value={adminCategorySearch}
                  onChange={event => setAdminCategorySearch(event.target.value)}
                  placeholder="Filtrar categoria…"
                  className="h-10 w-full rounded-xl border border-white/10 bg-[#15141c] pl-9 pr-3 text-xs text-[#faf4e4] outline-none focus:border-[#e5c36b]"
                />
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {adminFilteredCategories.map(category => (
                <div
                  key={category.id}
                  className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#14131b] p-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#c7b483]">
                      #{category.display_order} · {category.name}
                    </span>
                    <strong className="block truncate text-sm font-extrabold text-[#faf4e4]">
                      {category.name_pt}
                    </strong>
                  </div>
                  <div className="flex items-center gap-2 sm:w-80">
                    <select
                      aria-label={`Vencedor oficial de ${category.name}`}
                      value={category.winner_nominee_id || ''}
                      onChange={event => void onAdminSetWinner(category.id, event.target.value || null)}
                      className="h-10 flex-1 rounded-xl border border-[#dfc06c]/25 bg-[#0c0b10] px-3 text-xs font-bold text-[#faf4e4] outline-none focus:border-[#e5c36b]"
                    >
                      <option value="">— Ainda não definido —</option>
                      {category.nominees.map(nominee => (
                        <option key={nominee.id} value={nominee.id}>
                          {nominee.title}
                        </option>
                      ))}
                    </select>
                    {category.winner_nominee_id && (
                      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-300">
                        <Check className="size-4" />
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Modal de Revisão e Confirmação das Previsões */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent
          title={isConfirmed ? 'Suas previsões confirmadas' : 'Revisar meu Bolão GOTY 2026'}
          description={`${progress.answered} de ${progress.total} categorias preenchidas`}
          className="goty-dialog max-w-2xl border-[#dfc06c]/30 bg-[#0b0a0f] text-[#faf4e4]"
        >
          <div className="flex max-h-[calc(min(88dvh,760px)-88px)] flex-col">
            <div className="flex-1 space-y-2 overflow-y-auto p-4 sm:p-5">
              {!progress.isComplete && votingOpen && (
                <div className="mb-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3.5 text-xs leading-relaxed text-amber-100">
                  Você ainda tem <strong>{progress.missingCategoryIds.length}</strong>{' '}
                  {progress.missingCategoryIds.length === 1 ? 'categoria pendente' : 'categorias pendentes'}. Você pode confirmar agora ou clicar em qualquer pendência abaixo para responder.
                </div>
              )}

              {state.categories.map(category => {
                const chosenId = myVotesByCategory.get(category.id);
                const chosen = category.nominees.find(nominee => nominee.id === chosenId) ?? null;
                const winner = category.nominees.find(nominee => nominee.id === category.winner_nominee_id) ?? null;
                const hit = Boolean(winner && chosen && winner.id === chosen.id);
                const missed = Boolean(winner && chosen && winner.id !== chosen.id);

                return (
                  <div
                    key={category.id}
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-2.5',
                      chosen
                        ? 'border-[#dfc06c]/20 bg-[#14131b]'
                        : 'border-dashed border-amber-400/25 bg-amber-500/[0.04]',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="block text-[10px] font-black uppercase tracking-wider text-[#a99c7e]">
                        {category.display_order}. {category.name_pt}
                      </span>
                      {chosen ? (
                        <strong className="mt-0.5 block truncate text-xs font-extrabold text-[#fff8e6]">
                          {chosen.title}
                        </strong>
                      ) : (
                        <span className="mt-0.5 block text-xs font-semibold text-amber-200/80">
                          Sem palpite ainda
                        </span>
                      )}
                      {winner && (
                        <span className="mt-0.5 block text-[10px] font-bold text-[#e5c369]">
                          Oficial: {winner.title}
                        </span>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {hit && <CheckCircle2 className="size-4 text-emerald-400" />}
                      {missed && <XCircle className="size-4 text-red-400" />}
                      {votingOpen && (
                        <button
                          type="button"
                          onClick={() => jumpToCategory(category.id)}
                          className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold text-[#dfd2b0] hover:border-[#dfc06c]/40"
                        >
                          {chosen ? 'Alterar' : 'Responder'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#dfc06c]/15 bg-[#0f0e14] px-5 py-4">
              <div className="text-[11px] text-[#a79c82]">
                {isConfirmed && mySubmission?.confirmed_at
                  ? `Confirmado em ${formatDateTimePt(mySubmission.confirmed_at)}`
                  : 'Seus palpites já ficam salvos automaticamente no seu perfil.'}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReviewOpen(false)}
                  className="h-10 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-xs font-bold text-zinc-300 hover:bg-white/10"
                >
                  Fechar
                </button>
                {votingOpen && (
                  <button
                    type="button"
                    disabled={confirming || progress.answered === 0}
                    onClick={() => void handleConfirmToggle(!isConfirmed)}
                    className="h-10 rounded-xl bg-gradient-to-r from-[#c79933] via-[#e6c263] to-[#f4df9a] px-4 text-xs font-black text-[#171105] transition hover:brightness-105 disabled:opacity-50"
                  >
                    {confirming
                      ? 'Salvando…'
                      : isConfirmed
                        ? 'Reabrir rascunho'
                        : 'Confirmar Bolão'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de consulta das previsões de um participante */}
      <Dialog open={Boolean(inspectEntry)} onOpenChange={open => { if (!open) setInspectEntry(null); }}>
        <DialogContent
          title={inspectEntry ? `Palpites de ${inspectEntry.profile.name || 'Membro'}` : 'Palpites'}
          description={
            inspectEntry
              ? `${inspectEntry.correctCount} acertos · ${inspectEntry.votedCount}/30 categorias preenchidas`
              : undefined
          }
          className="goty-dialog max-w-2xl border-[#dfc06c]/30 bg-[#0b0a0f] text-[#faf4e4]"
        >
          {inspectEntry && (
            <div className="max-h-[calc(min(88dvh,760px)-88px)] space-y-2 overflow-y-auto p-4 sm:p-5">
              {state.categories.map(category => {
                const pickId = inspectedVotesByCategory.get(category.id);
                const pick = category.nominees.find(nominee => nominee.id === pickId) ?? null;
                const winner = category.nominees.find(nominee => nominee.id === category.winner_nominee_id) ?? null;
                const isHit = Boolean(winner && pick && winner.id === pick.id);
                const isMiss = Boolean(winner && pick && winner.id !== pick.id);
                return (
                  <div
                    key={category.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#14131b] px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <span className="block text-[10px] font-black uppercase tracking-wider text-[#a79c82]">
                        {category.display_order}. {category.name_pt}
                      </span>
                      <strong className="mt-0.5 block truncate text-xs font-extrabold text-[#faf4e4]">
                        {pick ? pick.title : 'Sem palpite'}
                      </strong>
                      {winner && (
                        <span className="mt-0.5 block text-[10px] font-bold text-[#e5c369]">
                          Vencedor oficial: {winner.title}
                        </span>
                      )}
                    </div>
                    {isHit && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-black text-emerald-300">
                        <Check className="size-3" /> Acertou
                      </span>
                    )}
                    {isMiss && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-500/15 px-2.5 py-1 text-[10px] font-black text-red-300">
                        <XCircle className="size-3" /> Errou
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategoryCard({
  category,
  selectedNomineeId,
  votingOpen,
  isConfirmed,
  onSelect,
}: {
  category: GotyCategory;
  selectedNomineeId: string | null;
  votingOpen: boolean;
  isConfirmed: boolean;
  onSelect: (nomineeId: string) => Promise<void>;
}) {
  const isGoty = category.slug === 'game-of-the-year';
  const selectedNominee = category.nominees.find(nominee => nominee.id === selectedNomineeId) ?? null;
  const officialWinner = category.nominees.find(nominee => nominee.id === category.winner_nominee_id) ?? null;
  const isAnswered = Boolean(selectedNominee);
  const didHit = Boolean(officialWinner && selectedNominee && officialWinner.id === selectedNominee.id);
  const didMiss = Boolean(officialWinner && selectedNominee && officialWinner.id !== selectedNominee.id);

  return (
    <article
      id={`goty-cat-${category.id}`}
      className={cn(
        'goty-surface relative overflow-hidden rounded-[22px] border p-3.5 transition sm:rounded-[26px] sm:p-6',
        isGoty
          ? 'border-[#e8c66d]/55 bg-gradient-to-br from-[#1d170b] via-[#111016] to-[#0a0a0f] shadow-[0_22px_65px_rgba(0,0,0,0.65),0_0_40px_rgba(220,178,74,0.12)]'
          : isAnswered
            ? 'border-[#dfc06c]/30 bg-[#100f15]'
            : 'border-white/[0.08] bg-[#0d0c12]',
      )}
    >
      {isGoty && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-12 opacity-[0.06]"
        >
          <TgaEmblem className="size-48" />
        </div>
      )}

      <div className="relative space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] sm:tracking-[0.14em]',
                isGoty
                  ? 'bg-gradient-to-r from-[#d4aa47] to-[#f4df9b] text-[#171105]'
                  : 'border border-[#dfc06c]/25 bg-[#dfc06c]/10 text-[#e8ca77]',
              )}
            >
              {isGoty && <Crown className="size-3 shrink-0" />}
              {isGoty ? 'Principal' : `Cat. ${category.display_order}`}
            </span>
            <span className="hidden truncate text-[11px] font-bold text-[#9a8e74] sm:inline">{category.name}</span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {didHit ? (
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-emerald-400/35 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-200">
                <CheckCircle2 className="size-3" /> Acertou!
              </span>
            ) : didMiss ? (
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-red-400/30 bg-red-500/12 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-red-200">
                <XCircle className="size-3" /> Errou
              </span>
            ) : isAnswered ? (
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-[#dfc06c]/35 bg-[#dfc06c]/14 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[#f5dd95]">
                <Check className="size-3 stroke-[3]" /> {isConfirmed ? 'Confirmado' : 'Salvo'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[#9c9077]">
                <CalendarClock className="size-3" /> Pendente
              </span>
            )}
          </div>
        </div>

        <div className="min-w-0">
          <h3 className={cn('font-black tracking-tight text-[#fff9ea]', isGoty ? 'text-lg sm:text-2xl' : 'text-base sm:text-lg')}>
            {category.name_pt}
          </h3>
          <p className="mt-0.5 text-[10px] font-bold text-[#9a8e74] sm:hidden">{category.name}</p>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[#a89c7f]">
            {category.description}
          </p>
        </div>
      </div>

      <div
        className={cn(
          'relative mt-4 grid gap-2.5 sm:gap-3',
          isGoty
            ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'
            : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
        )}
      >
        {category.nominees.map(nominee => {
          const isSelected = nominee.id === selectedNomineeId;
          const isOfficialWinner = nominee.id === category.winner_nominee_id;
          return (
            <button
              key={nominee.id}
              type="button"
              disabled={!votingOpen}
              aria-pressed={isSelected}
              onClick={() => void onSelect(nominee.id)}
              className={cn(
                'group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f1d37e] disabled:cursor-default',
                isSelected
                  ? 'border-[#f0cf72] bg-[#1d180d] shadow-[0_0_0_1px_rgba(240,207,114,0.4),0_14px_30px_rgba(218,176,72,0.18)]'
                  : 'border-white/[0.08] bg-[#13121a] hover:border-[#dfc06c]/40 hover:-translate-y-0.5',
                isOfficialWinner && 'ring-2 ring-emerald-400/70',
              )}
            >
              <div className="relative aspect-[3/4] w-full overflow-hidden">
                <GotyPosterArt
                  title={nominee.title}
                  subtitle={nominee.subtitle}
                  imageUrl={nominee.image_url}
                  kind={nominee.nominee_kind}
                  className="size-full"
                />

                {isOfficialWinner && (
                  <span className="absolute left-2 top-2 z-20 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-950 shadow-lg">
                    <Crown className="size-2.5" /> Vencedor
                  </span>
                )}

                {isSelected && (
                  <span className="absolute right-2 top-2 z-20 grid size-6 place-items-center rounded-full bg-gradient-to-br from-[#f6e09c] to-[#c79831] text-[#171105] shadow-lg">
                    <Check className="size-3.5 stroke-[3]" />
                  </span>
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col justify-between p-2.5">
                <strong className="line-clamp-2 break-words text-xs font-extrabold leading-snug text-[#fbf5e3]">
                  {nominee.title}
                </strong>
                {nominee.subtitle && (
                  <span className="mt-1 line-clamp-1 break-words text-[10px] font-medium text-[#9f937a]">
                    {nominee.subtitle}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </article>
  );
}
