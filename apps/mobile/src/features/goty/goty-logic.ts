// Lógica pura da experiência GOTY 2026 no app (sem dependências de React Native),
// espelhando as regras de src/components/goty/* da web.
import {
  GOTY_2026_CURATED_CATALOG,
  GOTY_2026_EDITION_YEAR,
  type GotyBolaoSubmission,
  type GotyBolaoVote,
  type GotyCategory,
  type GotyCategorySection,
  type GotyEventStatus,
  type GotyFullState,
  type GotyPersonalPick,
  type GotySearchGameResult,
} from '@clube-do-jogo/domain';
import { demoGames } from '@clube-do-jogo/domain/demo';

export type GotyTab = 'bolao' | 'seu-goty';
export type BolaoView = 'ballot' | 'leaderboard' | 'admin';
export type BallotFilter = 'all' | 'pending' | 'answered' | GotyCategorySection;
export type PersonalSubView = 'mine' | 'wall';

export interface GotyEventPatch {
  status?: GotyEventStatus;
  votingClosesAt?: string | null;
  personalVotingOpen?: boolean;
}

export const BALLOT_FILTER_OPTIONS: ReadonlyArray<{ id: BallotFilter; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'pending', label: 'Pendentes' },
  { id: 'answered', label: 'Respondidas' },
  { id: 'main', label: 'Principais' },
  { id: 'craft', label: 'Arte & Técnica' },
  { id: 'genre', label: 'Gêneros' },
  { id: 'community_esports', label: 'Comunidade & Esports' },
];

export const EVENT_STATUS_OPTIONS: ReadonlyArray<{ value: GotyEventStatus; label: string; desc: string }> = [
  { value: 'open', label: 'Aberto', desc: 'Aceita votos' },
  { value: 'locked', label: 'Encerrado', desc: 'Bloqueia edição' },
  { value: 'results_published', label: 'Apurado', desc: 'Resultados finais' },
];

const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const pad = (value: number) => String(value).padStart(2, '0');

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseGotyTab(value: unknown): GotyTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'seu-goty' ? 'seu-goty' : 'bolao';
}

/** "10 de dezembro de 2026" — data da cerimônia no fuso local do aparelho. */
export function formatCeremonyDate(value?: string | null): string {
  const date = parseDate(value);
  if (!date) return '10 de dezembro de 2026';
  return `${pad(date.getDate())} de ${MONTHS_LONG[date.getMonth()]} de ${date.getFullYear()}`;
}

/** "10 dez 2026, 20:59" ou "Sem prazo definido". */
export function formatDateTimePt(value?: string | null): string {
  if (!value) return 'Sem prazo definido';
  const date = parseDate(value);
  if (!date) return value;
  return `${pad(date.getDate())} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Valor editável do prazo no formato DD/MM/AAAA HH:mm (horário local). */
export function formatDeadlineInput(iso?: string | null): string {
  const date = parseDate(iso);
  if (!date) return '';
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export type DeadlineParseResult = { ok: true; iso: string | null } | { ok: false; error: string };

/** Converte DD/MM/AAAA HH:mm (local) em ISO; texto vazio remove o prazo. */
export function parseDeadlineInput(text: string): DeadlineParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, iso: null };
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2}))?$/);
  if (!match) return { ok: false, error: 'Use o formato DD/MM/AAAA HH:mm.' };
  const [, dd, mm, yyyy, hh = '23', min = '59'] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  const hours = Number(hh);
  const minutes = Number(min);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hours > 23 || minutes > 59) {
    return { ok: false, error: 'Data ou horário inválido.' };
  }
  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return { ok: false, error: 'Data inexistente no calendário.' };
  }
  return { ok: true, iso: date.toISOString() };
}

export function normalizeSearchText(value: string): string {
  const base = value.trim();
  const decomposed = typeof base.normalize === 'function' ? base.normalize('NFD') : base;
  return decomposed.replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

export function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));
}

export function categoryMatchesSearch(category: GotyCategory, needle: string): boolean {
  if (!needle) return true;
  return (
    normalizeSearchText(category.name).includes(needle)
    || normalizeSearchText(category.name_pt).includes(needle)
    || category.nominees.some(nominee =>
      normalizeSearchText(nominee.title).includes(needle)
      || normalizeSearchText(nominee.subtitle || '').includes(needle),
    )
  );
}

export function filterBallotCategories(
  categories: readonly GotyCategory[],
  votedCategoryIds: ReadonlySet<string> | ReadonlyMap<string, unknown>,
  filter: BallotFilter,
  search: string,
): GotyCategory[] {
  const needle = normalizeSearchText(search);
  return categories.filter(category => {
    const answered = votedCategoryIds.has(category.id);
    if (filter === 'pending' && answered) return false;
    if (filter === 'answered' && !answered) return false;
    if (filter !== 'all' && filter !== 'pending' && filter !== 'answered' && category.section !== filter) return false;
    return categoryMatchesSearch(category, needle);
  });
}

export function ballotFilterCount(
  filter: BallotFilter,
  categories: readonly GotyCategory[],
  answeredCount: number,
): number {
  if (filter === 'all') return categories.length;
  if (filter === 'answered') return answeredCount;
  if (filter === 'pending') return categories.length - answeredCount;
  return categories.filter(category => category.section === filter).length;
}

// ---------- Transformações otimistas (mesmas regras de goty-experience.tsx) ----------

export function applyBolaoVote(
  state: GotyFullState,
  userId: string,
  categoryId: string,
  nomineeId: string,
  now = new Date().toISOString(),
): GotyFullState {
  const vote: GotyBolaoVote = {
    edition_year: GOTY_2026_EDITION_YEAR,
    user_id: userId,
    category_id: categoryId,
    nominee_id: nomineeId,
    updated_at: now,
  };
  return {
    ...state,
    bolaoVotes: [
      ...state.bolaoVotes.filter(item => !(item.user_id === userId && item.category_id === categoryId)),
      vote,
    ],
  };
}

export function applyBolaoConfirmation(
  state: GotyFullState,
  userId: string,
  confirm: boolean,
  now = new Date().toISOString(),
): GotyFullState {
  const submission: GotyBolaoSubmission = {
    edition_year: GOTY_2026_EDITION_YEAR,
    user_id: userId,
    confirmed_at: confirm ? now : null,
    updated_at: now,
  };
  return {
    ...state,
    bolaoSubmissions: [...state.bolaoSubmissions.filter(item => item.user_id !== userId), submission],
  };
}

export function applyPersonalPick(
  state: GotyFullState,
  userId: string,
  categoryId: string,
  game: GotySearchGameResult,
  now = new Date().toISOString(),
): GotyFullState {
  const pick: GotyPersonalPick = {
    edition_year: GOTY_2026_EDITION_YEAR,
    user_id: userId,
    category_id: categoryId,
    game_id: game.id,
    igdb_id: game.igdb_id ?? null,
    game_title: game.title,
    game_image_url: game.image_url ?? null,
    game_release_year: game.effective_release_year ?? game.release_year ?? 2026,
    game_platforms: game.platforms || [],
    game_genres: game.genres || [],
    release_eligibility: game.release_eligibility,
    updated_at: now,
  };
  return {
    ...state,
    personalPicks: [
      ...state.personalPicks.filter(item => !(item.user_id === userId && item.category_id === categoryId)),
      pick,
    ],
  };
}

export function removePersonalPick(state: GotyFullState, userId: string, categoryId: string): GotyFullState {
  return {
    ...state,
    personalPicks: state.personalPicks.filter(item => !(item.user_id === userId && item.category_id === categoryId)),
  };
}

export function applyEventPatch(state: GotyFullState, patch: GotyEventPatch): GotyFullState {
  return {
    ...state,
    event: {
      ...state.event,
      status: patch.status ?? state.event.status,
      voting_closes_at: patch.votingClosesAt !== undefined ? patch.votingClosesAt : state.event.voting_closes_at,
      personal_voting_open: patch.personalVotingOpen ?? state.event.personal_voting_open,
    },
  };
}

export function applyCategoryWinner(
  state: GotyFullState,
  userId: string,
  categoryId: string,
  winnerNomineeId: string | null,
  now = new Date().toISOString(),
): GotyFullState {
  return {
    ...state,
    categories: state.categories.map(category =>
      category.id === categoryId
        ? {
            ...category,
            winner_nominee_id: winnerNomineeId,
            winner_set_at: winnerNomineeId ? now : null,
            winner_set_by: winnerNomineeId ? userId : null,
          }
        : category,
    ),
  };
}

// ---------- Capas dos indicados (POST /api/goty/resolve-covers) ----------

export function hasUnresolvedGameCovers(state: GotyFullState): boolean {
  return state.categories.some(category =>
    category.nominees.some(nominee => nominee.game_query && !nominee.image_url),
  );
}

export interface ResolveCoversBatchOptions {
  /** Executa uma chamada POST /api/goty/resolve-covers e devolve o payload JSON. */
  requestBatch: (limit: number) => Promise<{ updated?: number; remaining?: number }>;
  limit: number;
  maxAttempts?: number;
  isCancelled?: () => boolean;
  /** Chamado sempre que um lote atualizou pelo menos uma capa. */
  onBatchUpdated?: (updated: number) => Promise<void> | void;
}

/** Resolve capas em lotes até não restar pendências (máx. 6 tentativas, igual à web). */
export async function resolveCoversInBatches(options: ResolveCoversBatchOptions): Promise<number> {
  const maxAttempts = options.maxAttempts ?? 6;
  let totalUpdated = 0;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (options.isCancelled?.()) break;
    const payload = await options.requestBatch(options.limit);
    const updated = Number(payload.updated || 0);
    totalUpdated += updated;
    if (updated > 0 && !options.isCancelled?.()) await options.onBatchUpdated?.(updated);
    if (!payload.remaining || payload.remaining <= 0) break;
  }
  return totalUpdated;
}

// ---------- Busca de jogos (fallback/demo de /api/goty/search-games) ----------

export const GOTY_SEARCH_LIMIT = 18;

export function searchGotyDemoCatalog(query: string, includeAllYears: boolean, limit = GOTY_SEARCH_LIMIT): GotySearchGameResult[] {
  const needle = normalizeSearchText(query);
  const pool: GotySearchGameResult[] = [
    ...GOTY_2026_CURATED_CATALOG,
    ...(includeAllYears
      ? demoGames.map(game => ({
          ...game,
          release_eligibility: game.release_year === 2026 ? ('commercial_2026' as const) : ('manual_override' as const),
          effective_release_year: game.release_year ?? null,
          effective_release_date: game.release_year ? `${game.release_year}` : null,
          eligibility_label: game.release_year === 2026 ? 'Lançamento 2026' : `Lançado em ${game.release_year || '—'}`,
          is_eligible_2026: game.release_year === 2026,
        }))
      : []),
  ];
  if (!needle) return pool.slice(0, limit);
  return pool
    .filter(game =>
      normalizeSearchText(game.title).includes(needle)
      || (game.genres || []).some(genre => normalizeSearchText(genre).includes(needle))
      || (game.platforms || []).some(platform => normalizeSearchText(platform).includes(needle)),
    )
    .slice(0, limit);
}

export function buildSearchGamesPath(query: string, includeAllYears: boolean, limit = GOTY_SEARCH_LIMIT): string {
  const params = new URLSearchParams({
    q: query.trim(),
    includeAllYears: String(includeAllYears),
    limit: String(limit),
  });
  return `/api/goty/search-games?${params.toString()}`;
}

/** Linha de metadados: "Lançamento 2026 · Ação · PS5". */
export function pickMetaLine(
  pick: Pick<GotyPersonalPick, 'game_release_year' | 'game_genres' | 'game_platforms'>,
  options: { yearPrefix?: string; genres?: number; platforms?: number } = {},
): string {
  return [
    pick.game_release_year ? `${options.yearPrefix ?? ''}${pick.game_release_year}` : null,
    ...(pick.game_genres || []).slice(0, options.genres ?? 2),
    ...(pick.game_platforms || []).slice(0, options.platforms ?? 2),
  ]
    .filter(Boolean)
    .join(' · ');
}

export function titleKey(title: string): string {
  return title.trim().toLocaleLowerCase('pt-BR');
}

export function monogram(title: string): string {
  const words = title
    .replace(/[^a-zA-Z0-9À-ÿ\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '26';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

export function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

/** Decide se o badge flutuante deve aparecer na rota atual. */
export function shouldShowGotyBadge(pathname: string): boolean {
  return !(pathname === '/goty-2026' || pathname.startsWith('/goty-2026/'));
}

const TAB_ROUTES = new Set(['/', '/jogo-do-mes', '/ranking', '/jogos', '/seus-jogos', '/perfil']);

/** Rotas que exibem a tab bar inferior (o badge precisa ficar acima dela). */
export function isTabBarRoute(pathname: string): boolean {
  return TAB_ROUTES.has(pathname);
}

/** Altura padrão da tab bar do expo-router, sem o inset inferior. */
export const GOTY_BADGE_TAB_BAR_HEIGHT = 56;
/** Respiro entre o badge e a tab bar (ou a borda inferior). */
export const GOTY_BADGE_GAP = 12;
/** Altura do badge: emblema de 36 + padding vertical de 5 + borda de 1. */
export const GOTY_BADGE_HEIGHT = 48;

/**
 * Distância do badge à borda inferior da tela. Nas abas ele fica acima da tab bar;
 * nas telas empilhadas, perto da borda, respeitando o inset do sistema.
 */
export function gotyBadgeBottomOffset(pathname: string, insetBottom: number): number {
  return isTabBarRoute(pathname)
    ? insetBottom + GOTY_BADGE_TAB_BAR_HEIGHT + GOTY_BADGE_GAP
    : Math.max(16, insetBottom + GOTY_BADGE_GAP);
}

/**
 * Folga que o fim de uma lista rolável precisa para o último item não ficar embaixo do
 * badge. Nas abas o conteúdo termina na tab bar, então o inset e a barra já ficaram
 * de fora; nas telas empilhadas o conteúdo vai até a borda da tela. Zero onde o badge
 * não aparece.
 */
export function gotyBadgeClearance(pathname: string, insetBottom: number): number {
  if (!shouldShowGotyBadge(pathname)) return 0;
  const aboveContentEnd = isTabBarRoute(pathname)
    ? GOTY_BADGE_GAP
    : gotyBadgeBottomOffset(pathname, insetBottom);
  return aboveContentEnd + GOTY_BADGE_HEIGHT + GOTY_BADGE_GAP;
}
