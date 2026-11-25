import type { DataSupabaseClient, Json } from './supabase';
import {
  byChoice,
  choiceParticipants,
  compareRankingItems,
  countChoices,
  isVoteChoice,
  legacyPlaytimePoints,
  normalizeAvatarCrop,
  rankingScore,
  shiftMonth,
  transitionProgress,
  voteChoices,
} from '@clube-do-jogo/domain';
import type {
  AdminUser,
  AppRole,
  ClubComment,
  ClubCycle,
  CommentReaction,
  DiscoverItem,
  DiscoverSource,
  Game,
  GameProgress,
  GameMugshot,
  LibraryGame,
  LocalNote,
  Profile,
  ProfileWithGames,
  ProgressStatus,
  RankingFormula,
  RankingItem,
  RatingCriterion,
  RatingDetails,
  RatingMode,
  RewardGrant,
  StoredProgress,
  UserPlatform,
  VoteChoice,
  VoteParticipant,
  VoteReason,
} from '@clube-do-jogo/domain';
import { readApiJson, type ApiTransport } from './api';
import { apiRoutes, type ApiResponse, type Unvalidated } from './api-contracts';
import { DemoStore, type DemoVote } from './demo';
import { DataError, requireValue, withDataErrors } from './errors';
import type { GameMediaQuery } from './media';
import type {
  PlatformSearchQuery,
  ProfilePatch,
  ProfileUpdateInput,
  UserPlatformInput,
  UserPlatformMutation,
  UserPlatformRemoval,
} from './profiles';

const ratingCriteria: RatingCriterion[] = ['graphics', 'gameplay', 'story', 'music', 'fun'];

export interface DataScope {
  userId: string;
  isDemo: boolean;
}

export interface RankingQuery extends DataScope {
  month: string;
  historical?: boolean;
}

export interface GameQuery extends DataScope {
  gameId: string;
}

export interface GameOfMonthQuery extends DataScope {
  month: string;
}

export interface LibraryQuery extends DataScope {
  profileId: string;
  voteMonth?: string;
}

export interface ProgressQuery extends DataScope {
  gameId: string;
  month?: string;
  historical?: boolean;
}

export interface DiscoveryQuery extends DataScope {
  source: DiscoverSource;
  search?: string;
  month?: string;
}

export interface GameSearchQuery extends DataScope {
  query: string;
}

export interface DiscoveryFilters {
  search?: string;
  genre?: number;
  platform?: number;
  year?: number;
  month?: string;
}

export interface DiscoveryPageQuery extends DataScope {
  source: DiscoverSource;
  filters?: DiscoveryFilters;
  offset?: number;
  limit?: number;
}

export interface DiscoveryPage {
  items: DiscoverItem[];
  hasMore: boolean;
}

export interface VoteInput extends DataScope {
  month: string;
  historical?: boolean;
  gameId: string;
  choice: VoteChoice | null;
  reason?: VoteReason | null;
  reasonText?: string;
}

export interface ProgressInput extends DataScope {
  gameId: string;
  status: ProgressStatus;
  historical?: boolean;
}

export interface RatingInput extends DataScope {
  gameId: string;
  historical?: boolean;
  rating: number | null;
  ratingMode: RatingMode;
  ratingDetails?: RatingDetails | null;
}

export interface BacklogInput extends DataScope {
  gameId: string;
  inBacklog: boolean;
}

export interface FavoriteInput extends DataScope {
  gameId: string;
  favorite: boolean;
}

export interface CycleState {
  cycles: ClubCycle[];
  months: string[];
  activeMonth: string;
}

export interface SessionProfile {
  profile: Profile | null;
  isAdmin: boolean;
}

export interface SessionProfileOptions {
  ignoreErrors?: boolean;
}

export interface UserGameRow {
  userId: string;
  gameId: string;
}

export interface VoteRowKey extends UserGameRow {
  voteMonth: string;
}

export interface VoteRowInput extends VoteRowKey {
  choice: VoteChoice;
  reason?: VoteReason | null;
  reasonText?: string | null;
}

export interface ProgressRowInput extends UserGameRow {
  progress: StoredProgress;
  updatedAt: string;
}

export interface RatingRowInput extends UserGameRow {
  rating: number | null;
  ratingMode: RatingMode;
  ratingDetails: RatingDetails | null;
}

export interface UserPlatformRowInput {
  userId: string;
  platform: UserPlatform;
}

export interface UserPlatformRowKey {
  userId: string;
  igdbPlatformId: number;
}

export interface ProfileFieldsInput {
  userId: string;
  patch: ProfilePatch;
}

export interface GameAudienceQuery extends UserGameRow {
  voteMonth: string;
}

export interface GameAudience {
  voters: Profile[];
  completed: Profile[];
  choiceProfiles: Record<VoteChoice, VoteParticipant[]>;
  myChoice: VoteChoice | null;
  myReason: VoteReason | null;
  myReasonText: string | null;
  votedByMe: boolean;
  completedByMe: boolean;
  inBacklog: boolean;
  favorite: boolean;
}

export interface CommentTimelineQuery {
  userId: string;
  gameId: string;
  clubMonth: string;
}

export interface CommentRowInput {
  userId: string;
  gameId: string;
  clubMonth: string;
  parentId: string | null;
  body: string;
}

export interface CommentReactionRowInput {
  userId: string;
  commentId: string;
  emoji: string;
  gameId: string;
  clubMonth: string;
  enabled: boolean;
}

export interface OwnCommentKey {
  userId: string;
  commentId: string;
}

export interface NoteSnapshotsQuery extends UserGameRow {
  month: string;
}

export interface DataClientOptions {
  supabase?: DataSupabaseClient | null;
  api?: ApiTransport | null;
  demo?: DemoStore;
  rankingFormula?: RankingFormula;
}

type RawVote = {
  game_id: string;
  user_id: string;
  choice: VoteChoice | null;
  reason: VoteReason | null;
  reason_text: string | null;
  created_at: string;
};

type RawSnapshot = {
  game_id: string;
  vote_count: number;
  completed_count: number;
  voter_ids: string[];
  completed_user_ids: string[];
  playtime_points: number;
  rating_multiplier: number;
  total_points: number;
  finalized_at?: string;
  legacy_total_points?: number | null;
  would_play_count?: number;
  neutral_count?: number;
  would_not_play_count?: number;
  would_play_user_ids?: string[];
  neutral_user_ids?: string[];
  would_not_play_user_ids?: string[];
  games: Game | null;
};

type RawProgress = {
  id: string;
  user_id: string;
  game_id: string;
  status: ProgressStatus;
  rating: number | null;
  rating_mode?: RatingMode;
  rating_details?: RatingDetails | null;
  started_at: string | null;
  finished_at: string | null;
  updated_at?: string;
};

function fallbackProfile(id: string): Profile {
  return { id, name: 'Membro', avatar_url: null };
}

function profileMap(profiles: Profile[]) {
  return new Map(profiles.map(profile => [profile.id, profile]));
}

function asProfiles(value: unknown): Profile[] {
  return Array.isArray(value) ? value as Profile[] : [];
}

function validateRatingValue(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10) {
    throw new DataError('salvar avaliação', `${label} deve estar entre 0 e 10.`);
  }
  return value;
}

function normalizeRatingDetails(value: RatingDetails | null | undefined): RatingDetails | null {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new DataError('salvar avaliação', 'Os critérios da avaliação são inválidos.');
  }
  const normalized: RatingDetails = {};
  for (const [key, criterionValue] of Object.entries(value as Record<string, unknown>)) {
    if (!ratingCriteria.includes(key as RatingCriterion)) {
      throw new DataError('salvar avaliação', `O critério de avaliação “${key}” não é válido.`);
    }
    normalized[key as RatingCriterion] = validateRatingValue(criterionValue, `A nota de ${key}`);
  }
  return normalized;
}

function normalizePageOffset(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function normalizePageLimit(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value) || value === 0) return 24;
  return Math.min(40, Math.max(1, Math.floor(value)));
}

function dedupeDiscoveryItems(items: DiscoverItem[]) {
  const seen = new Set<string>();
  return items.filter(item => {
    if (!item || !item.game || seen.has(item.game.id)) return false;
    seen.add(item.game.id);
    return true;
  });
}

function discoveryPageFromPayload(payload: unknown): DiscoveryPage {
  if (Array.isArray(payload)) {
    return { items: dedupeDiscoveryItems(payload as DiscoverItem[]), hasMore: false };
  }
  if (!payload || typeof payload !== 'object') return { items: [], hasMore: false };
  const record = payload as Unvalidated<ApiResponse<'discover'>>;
  return {
    items: Array.isArray(record.items) ? dedupeDiscoveryItems(record.items as DiscoverItem[]) : [],
    hasMore: record.hasMore === true,
  };
}

function gamesFromSearchPayload(payload: unknown): Game[] {
  if (!Array.isArray(payload)) return [];
  const seen = new Set<string>();
  const games: Game[] = [];
  for (const value of payload) {
    if (!value || typeof value !== 'object') continue;
    const game = value as Game;
    if (typeof game.id !== 'string' || typeof game.title !== 'string' || seen.has(game.id)) continue;
    seen.add(game.id);
    games.push(game);
  }
  return games;
}

function normalizeProfileText(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new DataError('atualizar perfil', `${label} é inválido.`);
  const normalized = value.trim();
  return normalized || null;
}

function normalizeProfilePatch(patch: ProfilePatch): ProfilePatch {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new DataError('atualizar perfil', 'As alterações do perfil são inválidas.');
  }
  const knownFields = new Set(['name', 'bio', 'avatar_url', 'avatar_crop']);
  for (const key of Object.keys(patch)) {
    if (!knownFields.has(key)) throw new DataError('atualizar perfil', `O campo “${key}” não pode ser alterado.`);
  }
  const normalized: ProfilePatch = {};
  if (patch.name !== undefined) normalized.name = normalizeProfileText(patch.name, 'O nome');
  if (patch.bio !== undefined) normalized.bio = normalizeProfileText(patch.bio, 'A descrição');
  if (patch.avatar_url !== undefined) normalized.avatar_url = normalizeProfileText(patch.avatar_url, 'A URL do avatar');
  if (patch.avatar_crop !== undefined) {
    if (patch.avatar_crop !== null && (typeof patch.avatar_crop !== 'object' || Array.isArray(patch.avatar_crop))) {
      throw new DataError('atualizar perfil', 'O enquadramento do avatar é inválido.');
    }
    normalized.avatar_crop = patch.avatar_crop ? normalizeAvatarCrop(patch.avatar_crop) : null;
  }
  return normalized;
}

type ProfilePatchRow = Omit<ProfilePatch, 'avatar_crop'> & { avatar_crop?: Json };

function profilePatchRow(patch: ProfilePatch): ProfilePatchRow {
  return patch as ProfilePatchRow;
}

function normalizePlatformInput(platform: UserPlatformInput): UserPlatformInput {
  if (!platform || typeof platform !== 'object' || Array.isArray(platform)) {
    throw new DataError('salvar console', 'Os dados do console são inválidos.');
  }
  if (!Number.isInteger(platform.igdb_platform_id) || platform.igdb_platform_id <= 0) {
    throw new DataError('salvar console', 'O identificador do console é inválido.');
  }
  if (typeof platform.name !== 'string' || !platform.name.trim()) {
    throw new DataError('salvar console', 'O nome do console é obrigatório.');
  }
  const optionalText = (value: string | null | undefined) => {
    if (value == null) return null;
    if (typeof value !== 'string') throw new DataError('salvar console', 'Os dados do console são inválidos.');
    return value.trim() || null;
  };
  return {
    igdb_platform_id: platform.igdb_platform_id,
    name: platform.name.trim(),
    abbreviation: optionalText(platform.abbreviation),
    logo_url: optionalText(platform.logo_url),
  };
}

function platformItemsFromPayload(payload: unknown): UserPlatform[] {
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && 'items' in payload && Array.isArray((payload as { items?: unknown }).items)
      ? (payload as { items: unknown[] }).items
      : [];
  return rows.flatMap(value => {
    if (!value || typeof value !== 'object') return [];
    const row = value as Partial<UserPlatformInput>;
    const platformId = row.igdb_platform_id;
    if (typeof platformId !== 'number' || !Number.isInteger(platformId) || platformId <= 0 || typeof row.name !== 'string' || !row.name.trim()) return [];
    return [{
      igdb_platform_id: platformId,
      name: row.name.trim(),
      abbreviation: typeof row.abbreviation === 'string' ? row.abbreviation.trim() || null : null,
      logo_url: typeof row.logo_url === 'string' ? row.logo_url.trim() || null : null,
    } satisfies UserPlatform];
  });
}

function mugshotsFromPayload(payload: unknown): GameMugshot[] {
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && 'mugshots' in payload && Array.isArray((payload as Unvalidated<ApiResponse<'gameMugshots'>>).mugshots)
      ? (payload as { mugshots: unknown[] }).mugshots
      : [];
  return rows.flatMap(value => {
    if (!value || typeof value !== 'object') return [];
    const row = value as Partial<GameMugshot>;
    const id = row.id;
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0 || typeof row.name !== 'string' || !row.name.trim() || typeof row.image_url !== 'string' || !row.image_url.trim()) return [];
    return [{ id, name: row.name.trim(), image_url: row.image_url.trim() }];
  });
}

function rankingFromRows(
  games: Game[],
  votes: RawVote[],
  completed: Array<{ game_id: string; user_id: string }>,
  backlogIds: Set<string>,
  profiles: Profile[],
  userId: string,
  formula: RankingFormula,
) {
  const profilesById = profileMap(profiles);
  return games.map(game => {
    const gameVotes = votes.filter(vote => vote.game_id === game.id && isVoteChoice(vote.choice));
    const gameCompleted = completed.filter(item => item.game_id === game.id);
    const choiceProfiles = byChoice<VoteParticipant[]>(choice => gameVotes
      .filter(vote => vote.choice === choice)
      .map(vote => ({
        ...(profilesById.get(vote.user_id) || fallbackProfile(vote.user_id)),
        reason: vote.reason,
        reasonText: vote.reason_text,
      })));
    const choiceCounts = countChoices(choiceProfiles);
    const myVote = gameVotes.find(vote => vote.user_id === userId);
    const myChoice = myVote?.choice || null;
    const voters = choiceParticipants(choiceProfiles);
    const addedAt = gameVotes.reduce((earliest, vote) => !earliest || vote.created_at < earliest ? vote.created_at : earliest, '');
    return {
      game,
      addedAt,
      choiceCounts,
      choiceProfiles,
      myChoice,
      myReason: myVote?.reason || null,
      myReasonText: myVote?.reason_text || null,
      votesCount: voters.length,
      completedCount: gameCompleted.length,
      voters,
      completedBy: gameCompleted.map(item => profilesById.get(item.user_id) || fallbackProfile(item.user_id)),
      playtimePoints: legacyPlaytimePoints(Number(game.duration_hours)),
      ratingMultiplier: Number(game.average_rating ?? 50) / 100,
      totalPoints: rankingScore(formula, game, choiceCounts, gameCompleted.length),
      legacyTotalPoints: rankingScore('legacy', game, choiceCounts, gameCompleted.length),
      votedByMe: myChoice !== null,
      completedByMe: gameCompleted.some(item => item.user_id === userId),
      inBacklog: backlogIds.has(game.id),
    } satisfies RankingItem;
  }).sort(compareRankingItems);
}

function snapshotRanking(
  rows: RawSnapshot[],
  profiles: Profile[],
  backlogIds: Set<string>,
  userId: string,
  formula: RankingFormula,
  month: string,
) {
  const profilesById = profileMap(profiles);
  return rows.filter(row => row.games).map(row => {
    const game = row.games as Game;
    const choiceIds: Record<VoteChoice, string[]> = {
      would_play: row.would_play_user_ids || row.voter_ids || [],
      neutral: row.neutral_user_ids || [],
      would_not_play: row.would_not_play_user_ids || [],
    };
    const choiceCounts: Record<VoteChoice, number> = {
      would_play: row.would_play_count ?? choiceIds.would_play.length,
      neutral: row.neutral_count ?? choiceIds.neutral.length,
      would_not_play: row.would_not_play_count ?? choiceIds.would_not_play.length,
    };
    const myChoice = voteChoices.find(choice => choiceIds[choice].includes(userId)) || null;
    const legacyTotalPoints = Number(row.legacy_total_points ?? row.total_points);
    return {
      game,
      addedAt: row.finalized_at || `${month}-01T00:00:00.000Z`,
      choiceCounts,
      choiceProfiles: byChoice<VoteParticipant[]>(choice => choiceIds[choice].map(id => profilesById.get(id) || fallbackProfile(id))),
      myChoice,
      myReason: null,
      myReasonText: null,
      votesCount: Number(row.vote_count),
      completedCount: Number(row.completed_count),
      voters: (row.voter_ids || []).map(id => profilesById.get(id) || fallbackProfile(id)),
      completedBy: (row.completed_user_ids || []).map(id => profilesById.get(id) || fallbackProfile(id)),
      playtimePoints: Number(row.playtime_points),
      ratingMultiplier: Number(row.rating_multiplier),
      totalPoints: rankingScore(formula, game, choiceCounts, Number(row.completed_count)),
      legacyTotalPoints,
      votedByMe: myChoice !== null,
      completedByMe: (row.completed_user_ids || []).includes(userId),
      inBacklog: backlogIds.has(row.game_id),
    } satisfies RankingItem;
  }).sort(compareRankingItems);
}

function libraryFromRows(
  profile: Profile | null,
  backlogRows: Array<{ created_at: string; games: Game | null }>,
  progressRows: Array<RawProgress & { games: Game | null }>,
  favoriteRows: Array<{ created_at: string; games: Game | null }>,
  votes: Array<{ game_id: string; user_id: string }>,
  platforms: UserPlatform[],
): ProfileWithGames {
  const gameMap = new Map<string, LibraryGame>();
  backlogRows.forEach(row => {
    if (!row.games) return;
    const game = row.games;
    gameMap.set(game.id, { game, inBacklog: true, favorite: false, progress: null, addedAt: row.created_at, updatedAt: row.created_at });
  });
  progressRows.forEach(row => {
    if (!row.games) return;
    const current = gameMap.get(row.games.id);
    gameMap.set(row.games.id, {
      game: row.games,
      inBacklog: current?.inBacklog || false,
      favorite: current?.favorite || false,
      progress: {
        status: row.status,
        rating: row.rating,
        rating_mode: row.rating_mode,
        rating_details: row.rating_details,
        started_at: row.started_at,
        finished_at: row.finished_at,
      },
      addedAt: current?.addedAt || row.started_at || row.updated_at || null,
      updatedAt: row.updated_at || row.started_at || null,
    });
  });
  favoriteRows.forEach(row => {
    if (!row.games) return;
    const current = gameMap.get(row.games.id);
    gameMap.set(row.games.id, {
      game: row.games,
      inBacklog: current?.inBacklog || false,
      favorite: true,
      progress: current?.progress || null,
      addedAt: current?.addedAt || row.created_at,
      updatedAt: current?.updatedAt || row.created_at,
    });
  });
  return {
    profile,
    backlog: Array.from(gameMap.values()).filter(item => item.inBacklog).map(item => item.game),
    completed: Array.from(gameMap.values()).filter(item => item.progress?.status === 'finished').map(item => item.game),
    favorites: Array.from(gameMap.values()).filter(item => item.favorite).map(item => item.game),
    library: Array.from(gameMap.values()).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')),
    votedGameIds: votes.filter(item => item.user_id === profile?.id).map(item => item.game_id),
    rankingGameIds: Array.from(new Set(votes.map(item => item.game_id))),
    platforms,
  };
}

function supabaseError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return Object.assign(new Error(String((error as { message: unknown }).message)), error);
  }
  return new Error(String(error));
}

const REWARD_GRANTS_SELECT = 'id, reward_id, granted_at, seen_at, reward:club_rewards(id, club_month, code, kind, name, description, theme_id, image_url, cycle:club_months(month, game:games(title, image_url)))';

type TimelineCommentRow = Omit<ClubComment, 'profile' | 'reactions' | 'replies'>;
type TimelineReactionRow = { comment_id: string; emoji: string; user_id: string };

function commentTimelineFromRows(
  comments: TimelineCommentRow[],
  reactions: TimelineReactionRow[],
  profiles: Profile[],
  userId: string,
): ClubComment[] {
  const profilesById = profileMap(profiles);
  const reactionMap = new Map<string, Map<string, Profile[]>>();
  reactions.forEach(reaction => {
    if (!reactionMap.has(reaction.comment_id)) reactionMap.set(reaction.comment_id, new Map());
    const byEmoji = reactionMap.get(reaction.comment_id)!;
    const people = byEmoji.get(reaction.emoji) || [];
    people.push(profilesById.get(reaction.user_id) || fallbackProfile(reaction.user_id));
    byEmoji.set(reaction.emoji, people);
  });
  const mapped = comments.map((comment): ClubComment => ({
    ...comment,
    profile: profilesById.get(comment.user_id) || fallbackProfile(comment.user_id),
    reactions: Array.from(reactionMap.get(comment.id)?.entries() || []).map(([emoji, users]): CommentReaction => ({ emoji, users, reactedByMe: users.some(person => person.id === userId) })),
    replies: [],
  }));
  const roots = mapped.filter(comment => !comment.parent_id);
  mapped.filter(comment => comment.parent_id).forEach(reply => {
    const direct = mapped.find(comment => comment.id === reply.parent_id);
    const root = direct?.parent_id ? roots.find(comment => comment.id === direct.parent_id) : roots.find(comment => comment.id === reply.parent_id);
    root?.replies.push(reply);
  });
  return roots;
}

export class DataClient {
  readonly demo: DemoStore;
  readonly rankingFormula: RankingFormula;
  private readonly supabase: DataSupabaseClient | null;
  private readonly api: ApiTransport | null;

  constructor(options: DataClientOptions = {}) {
    this.supabase = options.supabase || null;
    this.api = options.api || null;
    this.demo = options.demo || new DemoStore();
    this.rankingFormula = options.rankingFormula || 'preference';
  }

  private client(operation: string) {
    if (!this.supabase) {
      throw new DataError(operation, 'Configure o Supabase para acessar sua conta.');
    }
    return this.supabase;
  }

  private transport(operation: string) {
    if (!this.api) {
      throw new DataError(operation, 'Configure a URL da API para explorar jogos.');
    }
    return this.api;
  }

  private async authenticatedClient(operation: string, userId: string) {
    const client = this.client(operation);
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    if (!data.user || data.user.id !== userId) {
      throw new DataError(operation, 'Sua sessão não está autorizada para essa operação.');
    }
    return client;
  }

  async readCycles(isDemo: boolean): Promise<CycleState> {
    if (isDemo) {
      const cycles = this.demo.readCycles();
      return { cycles, months: cycles.map(cycle => cycle.month), activeMonth: cycles.find(cycle => cycle.status === 'active')?.month || '' };
    }
    return withDataErrors('ler ciclos', 'Não foi possível carregar os ciclos do clube.', async () => {
      const { data, error } = await this.client('ler ciclos')
        .from('club_months')
        .select('month, game_id, status, started_at, closed_at, selected_by, game:games (*)')
        .order('month', { ascending: false });
      if (error) throw error;
      const cycles = (data || []) as unknown as ClubCycle[];
      const activeMonth = cycles.find(cycle => cycle.status === 'active')?.month || cycles[0]?.month || '';
      return { cycles, months: cycles.map(cycle => cycle.month), activeMonth };
    });
  }

  private readSessionProfileRows(userId: string) {
    const client = this.client('ler perfil');
    return Promise.all([
      client.from('profiles').select('*').eq('id', userId).maybeSingle(),
      client.from('user_roles').select('role').eq('user_id', userId).maybeSingle(),
    ]);
  }

  async readSessionProfile(userId: string, isDemo: boolean, options: SessionProfileOptions = {}): Promise<SessionProfile> {
    if (isDemo) return { profile: this.demo.readProfile(userId), isAdmin: this.demo.readRole(userId) === 'admin' };
    if (options.ignoreErrors) {
      const [{ data: profile }, { data: role }] = await this.readSessionProfileRows(userId);
      return { profile: (profile as Profile | null) || null, isAdmin: role?.role === 'admin' };
    }
    return withDataErrors('ler perfil', 'Não foi possível carregar o perfil da conta.', async () => {
      const [{ data: profile, error: profileError }, { data: role, error: roleError }] = await this.readSessionProfileRows(userId);
      if (profileError) throw profileError;
      if (roleError) throw roleError;
      return { profile: profile as Profile | null, isAdmin: role?.role === 'admin' };
    });
  }

  async readProfile(profileId: string, isDemo: boolean): Promise<Profile | null> {
    return (await this.readSessionProfile(profileId, isDemo)).profile;
  }

  async updateProfile(input: ProfileUpdateInput): Promise<Profile> {
    const patch = normalizeProfilePatch(input.patch);
    if (input.isDemo) return this.demo.updateProfile(input.userId, patch);
    return withDataErrors('atualizar perfil', 'Não foi possível atualizar seu perfil.', async () => {
      const client = await this.authenticatedClient('atualizar perfil', input.userId);
      const { data, error } = await client.from('profiles')
        .update({ ...profilePatchRow(patch), updated_at: new Date().toISOString() })
        .eq('id', input.userId)
        .select('*')
        .single();
      if (error) throw error;
      return data as Profile;
    });
  }

  async readRanking(input: RankingQuery): Promise<RankingItem[]> {
    if (input.isDemo) return this.demo.readRanking(input.userId, this.rankingFormula);
    return withDataErrors('ler ranking', 'Não foi possível carregar o ranking.', async () => {
      const client = this.client('ler ranking');
      if (input.historical) {
        const { data, error } = await client.from('ranking_snapshots')
          .select('*, games (*)')
          .eq('voting_month', input.month)
          .order('position');
        if (error) throw error;
        const rows = (data || []) as unknown as RawSnapshot[];
        const ids = Array.from(new Set(rows.flatMap(row => [
          ...(row.would_play_user_ids || row.voter_ids || []),
          ...(row.neutral_user_ids || []),
          ...(row.would_not_play_user_ids || []),
          ...(row.completed_user_ids || []),
        ])));
        const profiles = ids.length
          ? await client.from('profiles').select('id, name, avatar_url, avatar_crop').in('id', ids)
          : { data: [], error: null };
        if (profiles.error) throw profiles.error;
        const gameIds = rows.map(row => row.game_id);
        const backlog = gameIds.length
          ? await client.from('backlogs').select('game_id').eq('user_id', input.userId).in('game_id', gameIds)
          : { data: [], error: null };
        if (backlog.error) throw backlog.error;
        return snapshotRanking(
          rows,
          asProfiles(profiles.data),
          new Set((backlog.data || []).map(item => item.game_id)),
          input.userId,
          this.rankingFormula,
          input.month,
        );
      }

      const voteMonth = shiftMonth(input.month, 1);
      const { data: rawVotes, error: votesError } = await client.from('votes')
        .select('game_id, user_id, choice, reason, reason_text, created_at')
        .eq('vote_month', voteMonth);
      if (votesError) throw votesError;
      const votes = ((rawVotes || []) as RawVote[]).filter(vote => isVoteChoice(vote.choice));
      const gameIds = Array.from(new Set(votes.map(vote => vote.game_id)));
      if (!gameIds.length) return [];
      const [{ data: completed, error: completedError }, { data: games, error: gamesError }, { data: backlog, error: backlogError }] = await Promise.all([
        client.from('game_progress').select('game_id, user_id').eq('status', 'finished').in('game_id', gameIds),
        client.from('games').select('*').in('id', gameIds),
        client.from('backlogs').select('game_id').eq('user_id', input.userId).in('game_id', gameIds),
      ]);
      if (completedError) throw completedError;
      if (gamesError) throw gamesError;
      if (backlogError) throw backlogError;
      const participantIds = Array.from(new Set([
        ...votes.map(vote => vote.user_id),
        ...((completed || []) as Array<{ user_id: string }>).map(item => item.user_id),
      ]));
      const profiles = participantIds.length
        ? await client.from('profiles').select('id, name, avatar_url, avatar_crop').in('id', participantIds)
        : { data: [], error: null };
      if (profiles.error) throw profiles.error;
      return rankingFromRows(
        (games || []) as Game[],
        votes,
        (completed || []) as Array<{ game_id: string; user_id: string }>,
        new Set((backlog || []).map(item => item.game_id)),
        asProfiles(profiles.data),
        input.userId,
        this.rankingFormula,
      );
    });
  }

  async readGame(input: GameQuery): Promise<Game | null> {
    if (input.isDemo) return this.demo.readGame(input.gameId);
    return withDataErrors('ler jogo', 'Não foi possível carregar o jogo.', async () => {
      const { data, error } = await this.client('ler jogo').from('games').select('*').eq('id', input.gameId).maybeSingle();
      if (error) throw error;
      return data as Game | null;
    });
  }

  async readGameMedia(input: GameMediaQuery): Promise<Game | null> {
    if (!input.gameId.trim()) throw new DataError('carregar mídia', 'O jogo não foi informado.');
    if (input.isDemo) return this.demo.readGame(input.gameId);
    return withDataErrors('carregar mídia', 'Não foi possível carregar a mídia do jogo.', async () => {
      const payload = await readApiJson<ApiResponse<'gameMedia'> | null>(
        this.transport('carregar mídia'),
        apiRoutes.gameMedia.path(input.gameId),
        { method: apiRoutes.gameMedia.method },
      );
      return payload;
    });
  }

  async readGameMugshots(input: GameMediaQuery): Promise<GameMugshot[]> {
    if (!input.gameId.trim()) throw new DataError('carregar personagens', 'O jogo não foi informado.');
    if (input.isDemo) return this.demo.readGameMugshots(input.gameId);
    return withDataErrors('carregar personagens', 'Não foi possível carregar os personagens do jogo.', async () => {
      const payload = await readApiJson<unknown>(
        this.transport('carregar personagens'),
        apiRoutes.gameMugshots.path(input.gameId),
        { method: apiRoutes.gameMugshots.method },
      );
      return mugshotsFromPayload(payload);
    });
  }

  async readGameOfMonth(input: GameOfMonthQuery): Promise<Game | null> {
    if (input.isDemo) {
      const cycle = this.demo.readCycles().find(item => item.month === input.month);
      return cycle ? this.demo.readGame(cycle.game_id) : null;
    }
    return withDataErrors('ler jogo do mês', 'Não foi possível carregar o jogo do mês.', async () => {
      const { data, error } = await this.client('ler jogo do mês').from('club_months')
        .select('game_id, games (*)')
        .eq('month', input.month)
        .maybeSingle();
      if (error) throw error;
      return (data?.games || null) as unknown as Game | null;
    });
  }

  async readUserPlatforms(userId: string, isDemo: boolean): Promise<UserPlatform[]> {
    if (isDemo) return this.demo.readUserPlatforms(userId);
    return withDataErrors('ler consoles', 'Não foi possível carregar seus consoles.', async () => {
      const { data, error } = await this.client('ler consoles').from('user_platforms')
        .select('id, user_id, igdb_platform_id, name, abbreviation, logo_url')
        .eq('user_id', userId)
        .order('name');
      if (error) throw error;
      return (data || []) as UserPlatform[];
    });
  }

  async searchPlatforms(input: PlatformSearchQuery): Promise<UserPlatform[]> {
    const query = input.query.trim();
    if (!query) throw new DataError('buscar consoles', 'Informe um console para buscar.');
    if (input.isDemo) return this.demo.searchPlatforms(query, input.userId);
    return withDataErrors('buscar consoles', 'Não foi possível buscar consoles.', async () => {
      const payload = await readApiJson<unknown>(
        this.transport('buscar consoles'),
        apiRoutes.searchPlatforms.path({ q: query }),
        { method: apiRoutes.searchPlatforms.method },
      );
      return platformItemsFromPayload(payload);
    });
  }

  async setUserPlatform(input: UserPlatformMutation): Promise<void> {
    const platform = normalizePlatformInput(input.platform);
    if (input.isDemo) {
      this.demo.setUserPlatform(input.userId, platform);
      return;
    }
    await withDataErrors('salvar console', 'Não foi possível adicionar o console.', async () => {
      const client = await this.authenticatedClient('salvar console', input.userId);
      const { error } = await client.from('user_platforms').insert({
        user_id: input.userId,
        igdb_platform_id: platform.igdb_platform_id,
        name: platform.name,
        abbreviation: platform.abbreviation,
        logo_url: platform.logo_url,
      });
      if (error && error.code !== '23505') throw error;
    });
  }

  async removeUserPlatform(input: UserPlatformRemoval): Promise<void> {
    if (!Number.isInteger(input.igdbPlatformId) || input.igdbPlatformId <= 0) {
      throw new DataError('remover console', 'O identificador do console é inválido.');
    }
    if (input.isDemo) {
      this.demo.removeUserPlatform(input.userId, input.igdbPlatformId);
      return;
    }
    await withDataErrors('remover console', 'Não foi possível remover o console.', async () => {
      const client = await this.authenticatedClient('remover console', input.userId);
      const { error } = await client.from('user_platforms')
        .delete()
        .eq('user_id', input.userId)
        .eq('igdb_platform_id', input.igdbPlatformId);
      if (error) throw error;
    });
  }

  async readLibrary(input: LibraryQuery): Promise<ProfileWithGames> {
    if (input.isDemo) return this.demo.readLibrary(input.profileId);
    return withDataErrors('ler biblioteca', 'Não foi possível carregar a biblioteca.', async () => {
      const client = this.client('ler biblioteca');
      const [{ data: profile, error: profileError }, { data: backlog, error: backlogError }, { data: progress, error: progressError }, { data: favorites, error: favoritesError }, votesResponse, platforms] = await Promise.all([
        client.from('profiles').select('*').eq('id', input.profileId).maybeSingle(),
        client.from('backlogs').select('created_at, games (*)').eq('user_id', input.profileId).order('created_at', { ascending: false }),
        client.from('game_progress').select('id, user_id, game_id, status, rating, rating_mode, rating_details, started_at, finished_at, updated_at, games (*)').eq('user_id', input.profileId).order('updated_at', { ascending: false }),
        client.from('favorite_games').select('created_at, games (*)').eq('user_id', input.profileId).order('created_at', { ascending: false }),
        input.voteMonth
          ? client.from('votes').select('game_id, user_id').eq('vote_month', input.voteMonth)
          : Promise.resolve({ data: [], error: null }),
        this.readUserPlatforms(input.profileId, false),
      ]);
      if (profileError) throw profileError;
      if (backlogError) throw backlogError;
      if (progressError) throw progressError;
      if (favoritesError) throw favoritesError;
      if (votesResponse.error) throw votesResponse.error;
      return libraryFromRows(
        profile as Profile | null,
        (backlog || []) as unknown as Array<{ created_at: string; games: Game | null }>,
        (progress || []) as unknown as Array<RawProgress & { games: Game | null }>,
        (favorites || []) as unknown as Array<{ created_at: string; games: Game | null }>,
        (votesResponse.data || []) as Array<{ game_id: string; user_id: string }>,
        platforms,
      );
    });
  }

  async readProgress(input: ProgressQuery): Promise<GameProgress[]> {
    if (input.isDemo) return this.demo.readProgress(input.userId, input.gameId);
    return withDataErrors('ler progresso', 'Não foi possível carregar o progresso.', async () => {
      const client = this.client('ler progresso');
      if (input.historical) {
        if (!input.month) throw new DataError('ler progresso', 'O mês histórico não foi informado.');
        const { data, error } = await client.from('cycle_progress_snapshots')
          .select('*, profile:profiles!cycle_progress_snapshots_user_id_fkey (id, name, avatar_url, avatar_crop)')
          .eq('cycle_month', input.month)
          .eq('game_id', input.gameId);
        if (error) throw error;
        return (data || []) as unknown as GameProgress[];
      }
      const [{ data: profiles, error: profilesError }, { data: progress, error: progressError }] = await Promise.all([
        client.from('profiles').select('id, name, avatar_url, avatar_crop').order('name'),
        client.from('game_progress').select('*').eq('game_id', input.gameId),
      ]);
      if (profilesError) throw profilesError;
      if (progressError) throw progressError;
      const progressMap = new Map(((progress || []) as RawProgress[]).map(item => [item.user_id, item]));
      return asProfiles(profiles).map(profile => {
        const row = progressMap.get(profile.id);
        return {
          id: row?.id || `new-${profile.id}`,
          user_id: profile.id,
          game_id: input.gameId,
          status: row?.status || 'not_started',
          rating: row?.rating ?? null,
          rating_mode: row?.rating_mode || 'simple',
          rating_details: row?.rating_details || null,
          started_at: row?.started_at || null,
          finished_at: row?.finished_at || null,
          profile,
        } satisfies GameProgress;
      });
    });
  }

  async readDiscoveryPage(input: DiscoveryPageQuery): Promise<DiscoveryPage> {
    const offset = normalizePageOffset(input.offset);
    const limit = normalizePageLimit(input.limit);
    const filters = input.filters || {};
    if (input.isDemo) {
      return this.demo.readDiscoveryPage(input.userId, input.source, filters, offset, limit);
    }
    return withDataErrors('explorar jogos', 'Não foi possível carregar a descoberta.', async () => {
      const path = apiRoutes.discover.path({
        source: input.source,
        offset: String(offset),
        limit: String(limit),
        q: filters.search?.trim() || undefined,
        genre: filters.genre !== undefined ? String(filters.genre) : undefined,
        platform: filters.platform !== undefined ? String(filters.platform) : undefined,
        year: filters.year !== undefined ? String(filters.year) : undefined,
        month: filters.month?.trim() || undefined,
      });
      const payload = await readApiJson<unknown>(this.transport('explorar jogos'), path, { method: apiRoutes.discover.method });
      return discoveryPageFromPayload(payload);
    });
  }

  async searchGames(input: GameSearchQuery): Promise<Game[]> {
    const query = typeof input.query === 'string' ? input.query.trim() : '';
    if (!query) return [];
    if (input.isDemo) return this.demo.searchGames(query);
    return withDataErrors('buscar jogos', 'Não foi possível buscar jogos.', async () => {
      const payload = await readApiJson<unknown>(this.transport('buscar jogos'), apiRoutes.searchGames.path({ q: query }), { method: apiRoutes.searchGames.method });
      return gamesFromSearchPayload(payload);
    });
  }

  async readDiscovery(input: DiscoveryQuery): Promise<DiscoverItem[]> {
    const page = await this.readDiscoveryPage({
      userId: input.userId,
      isDemo: input.isDemo,
      source: input.source,
      filters: { search: input.search, month: input.month },
      offset: 0,
      limit: 24,
    });
    return page.items;
  }

  async setVote(input: VoteInput): Promise<void> {
    if (input.historical) throw new DataError('salvar voto', 'O histórico é somente leitura.');
    const voteMonth = shiftMonth(input.month, 1);
    const negative = input.choice === 'would_not_play';
    const reason = negative ? input.reason || null : null;
    const reasonText = negative ? input.reasonText?.trim() || null : null;
    if (input.isDemo) {
      const vote: DemoVote | null = input.choice ? { choice: input.choice, reason, reasonText } : null;
      this.demo.setVote(input.userId, input.gameId, vote);
      return;
    }
    await withDataErrors('salvar voto', 'Não foi possível salvar seu voto.', async () => {
      const client = await this.authenticatedClient('salvar voto', input.userId);
      if (!input.choice) {
        const { error } = await client.from('votes').delete()
          .eq('user_id', input.userId)
          .eq('game_id', input.gameId)
          .eq('vote_month', voteMonth);
        if (error) throw error;
        return;
      }
      const { error } = await client.from('votes').upsert({
        user_id: input.userId,
        game_id: input.gameId,
        vote_month: voteMonth,
        choice: input.choice,
        reason,
        reason_text: reasonText,
      }, { onConflict: 'user_id,game_id,vote_month' });
      if (error) throw error;
    });
  }

  async setProgress(input: ProgressInput): Promise<void> {
    if (input.historical) throw new DataError('salvar progresso', 'O histórico é somente leitura.');
    if (input.isDemo) {
      const existing = this.demo.currentProgress(input.userId, input.gameId);
      this.demo.setProgress(input.userId, input.gameId, transitionProgress(existing, input.status));
      return;
    }
    await withDataErrors('salvar progresso', 'Não foi possível salvar o progresso.', async () => {
      const client = await this.authenticatedClient('salvar progresso', input.userId);
      const { data: existing, error: existingError } = await client.from('game_progress')
        .select('status, rating, rating_mode, rating_details, started_at, finished_at')
        .eq('user_id', input.userId)
        .eq('game_id', input.gameId)
        .maybeSingle();
      if (existingError) throw existingError;
      const now = new Date().toISOString();
      const next = transitionProgress(existing as GameProgress | null, input.status, now);
      const { error } = await client.from('game_progress').upsert({
        user_id: input.userId,
        game_id: input.gameId,
        ...next,
        updated_at: now,
      }, { onConflict: 'user_id,game_id' });
      if (error) throw error;
    });
  }

  async setRating(input: RatingInput): Promise<void> {
    if (input.historical) throw new DataError('salvar avaliação', 'O histórico é somente leitura.');
    if (input.ratingMode !== 'simple' && input.ratingMode !== 'detailed') {
      throw new DataError('salvar avaliação', 'O modo da avaliação é inválido.');
    }
    const rating = validateRatingValue(input.rating, 'A nota');
    const ratingDetails = normalizeRatingDetails(input.ratingDetails);
    if (input.isDemo) {
      this.demo.setRating(input.userId, input.gameId, rating, input.ratingMode, ratingDetails);
      return;
    }
    await withDataErrors('salvar avaliação', 'Não foi possível salvar sua avaliação.', async () => {
      const client = await this.authenticatedClient('salvar avaliação', input.userId);
      const { data: existing, error: existingError } = await client.from('game_progress')
        .select('status, started_at, finished_at')
        .eq('user_id', input.userId)
        .eq('game_id', input.gameId)
        .maybeSingle();
      if (existingError) throw existingError;
      const { error } = await client.from('game_progress').upsert({
        user_id: input.userId,
        game_id: input.gameId,
        status: (existing as { status?: ProgressStatus } | null)?.status || 'not_started',
        rating,
        rating_mode: input.ratingMode,
        rating_details: ratingDetails,
        started_at: (existing as { started_at?: string | null } | null)?.started_at || null,
        finished_at: (existing as { finished_at?: string | null } | null)?.finished_at || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,game_id' });
      if (error) throw error;
    });
  }

  async setBacklog(input: BacklogInput): Promise<void> {
    if (input.isDemo) {
      this.demo.setBacklog(input.userId, input.gameId, input.inBacklog);
      return;
    }
    await withDataErrors(input.inBacklog ? 'adicionar à biblioteca' : 'remover da biblioteca', input.inBacklog ? 'Não foi possível adicionar o jogo à biblioteca.' : 'Não foi possível remover o jogo da biblioteca.', async () => {
      const client = await this.authenticatedClient(input.inBacklog ? 'adicionar à biblioteca' : 'remover da biblioteca', input.userId);
      if (input.inBacklog) {
        const { error } = await client.from('backlogs').insert({ user_id: input.userId, game_id: input.gameId });
        if (error && error.code !== '23505') throw error;
        return;
      }
      const { error } = await client.from('backlogs').delete().eq('user_id', input.userId).eq('game_id', input.gameId);
      if (error) throw error;
    });
  }

  async setFavorite(input: FavoriteInput): Promise<void> {
    if (input.isDemo) {
      this.demo.setFavorite(input.userId, input.gameId, input.favorite);
      return;
    }
    await withDataErrors(input.favorite ? 'adicionar favorito' : 'remover favorito', input.favorite ? 'Não foi possível adicionar o favorito.' : 'Não foi possível remover o favorito.', async () => {
      const client = await this.authenticatedClient(input.favorite ? 'adicionar favorito' : 'remover favorito', input.userId);
      if (input.favorite) {
        const { error } = await client.from('favorite_games').insert({ user_id: input.userId, game_id: input.gameId });
        if (error && error.code !== '23505') throw error;
        return;
      }
      const { error } = await client.from('favorite_games').delete().eq('user_id', input.userId).eq('game_id', input.gameId);
      if (error) throw error;
    });
  }

  async upsertVote(input: VoteRowInput): Promise<void> {
    const { error } = await this.client('salvar voto').from('votes').upsert({
      user_id: input.userId,
      game_id: input.gameId,
      vote_month: input.voteMonth,
      choice: input.choice,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(input.reasonText !== undefined ? { reason_text: input.reasonText } : {}),
    }, { onConflict: 'user_id,game_id,vote_month' });
    if (error) throw supabaseError(error);
  }

  async deleteVote(input: VoteRowKey): Promise<void> {
    const { error } = await this.client('remover voto').from('votes').delete()
      .eq('user_id', input.userId)
      .eq('game_id', input.gameId)
      .eq('vote_month', input.voteMonth);
    if (error) throw supabaseError(error);
  }

  async upsertBacklog(input: UserGameRow): Promise<void> {
    const { error } = await this.client('adicionar à biblioteca').from('backlogs')
      .upsert({ user_id: input.userId, game_id: input.gameId }, { onConflict: 'user_id,game_id' });
    if (error) throw supabaseError(error);
  }

  async deleteBacklog(input: UserGameRow): Promise<void> {
    const { error } = await this.client('remover da biblioteca').from('backlogs').delete()
      .eq('user_id', input.userId)
      .eq('game_id', input.gameId);
    if (error) throw supabaseError(error);
  }

  async upsertFavorite(input: UserGameRow): Promise<void> {
    const { error } = await this.client('adicionar favorito').from('favorite_games')
      .upsert({ user_id: input.userId, game_id: input.gameId }, { onConflict: 'user_id,game_id' });
    if (error) throw supabaseError(error);
  }

  async deleteFavorite(input: UserGameRow): Promise<void> {
    const { error } = await this.client('remover favorito').from('favorite_games').delete()
      .eq('user_id', input.userId)
      .eq('game_id', input.gameId);
    if (error) throw supabaseError(error);
  }

  async upsertProgress(input: ProgressRowInput): Promise<void> {
    const { progress } = input;
    const { error } = await this.client('salvar progresso').from('game_progress').upsert({
      user_id: input.userId,
      game_id: input.gameId,
      status: progress.status,
      rating: progress.rating,
      rating_mode: progress.rating_mode,
      rating_details: progress.rating_details,
      started_at: progress.started_at,
      finished_at: progress.finished_at,
      updated_at: input.updatedAt,
    }, { onConflict: 'user_id,game_id' });
    if (error) throw supabaseError(error);
  }

  async updateRating(input: RatingRowInput): Promise<void> {
    const { error } = await this.client('salvar avaliação').from('game_progress')
      .update({ rating: input.rating, rating_mode: input.ratingMode, rating_details: input.ratingDetails, updated_at: new Date().toISOString() })
      .eq('user_id', input.userId)
      .eq('game_id', input.gameId);
    if (error) throw supabaseError(error);
  }

  async upsertUserPlatform(input: UserPlatformRowInput): Promise<void> {
    const { platform } = input;
    const { error } = await this.client('salvar console').from('user_platforms').upsert({
      user_id: input.userId,
      igdb_platform_id: platform.igdb_platform_id,
      name: platform.name,
      abbreviation: platform.abbreviation ?? null,
      logo_url: platform.logo_url ?? null,
    }, { onConflict: 'user_id,igdb_platform_id' });
    if (error) throw supabaseError(error);
  }

  async deleteUserPlatform(input: UserPlatformRowKey): Promise<void> {
    const { error } = await this.client('remover console').from('user_platforms').delete()
      .eq('user_id', input.userId)
      .eq('igdb_platform_id', input.igdbPlatformId);
    if (error) throw supabaseError(error);
  }

  async updateProfileFields(input: ProfileFieldsInput): Promise<void> {
    const { error } = await this.client('atualizar perfil').from('profiles')
      .update({ ...profilePatchRow(input.patch), updated_at: new Date().toISOString() })
      .eq('id', input.userId);
    if (error) throw supabaseError(error);
  }

  async readRewardGrants(userId: string): Promise<RewardGrant[]> {
    const { data, error } = await this.client('ler recompensas')
      .from('user_reward_grants')
      .select(REWARD_GRANTS_SELECT)
      .eq('user_id', userId)
      .order('granted_at', { ascending: false });
    if (error) throw supabaseError(error);
    return (data || []) as unknown as RewardGrant[];
  }

  async readGameAudience(input: GameAudienceQuery): Promise<GameAudience> {
    const client = this.client('ler participantes do jogo');
    const [{ data: votes, error: votesError }, { data: completed, error: completedError }, { data: backlog }, { data: favorite }] = await Promise.all([
      client.from('votes').select('user_id, choice, reason, reason_text').eq('game_id', input.gameId).eq('vote_month', input.voteMonth),
      client.from('game_progress').select('user_id').eq('game_id', input.gameId).eq('status', 'finished'),
      client.from('backlogs').select('id').eq('game_id', input.gameId).eq('user_id', input.userId).maybeSingle(),
      client.from('favorite_games').select('id').eq('game_id', input.gameId).eq('user_id', input.userId).maybeSingle(),
    ]);
    if (votesError) throw supabaseError(votesError);
    if (completedError) throw supabaseError(completedError);
    const voteRows = (votes || []) as Array<{ user_id: string; choice: VoteChoice | null; reason: VoteReason | null; reason_text: string | null }>;
    const completedRows = (completed || []) as Array<{ user_id: string }>;
    const ids = Array.from(new Set([...voteRows.map(item => item.user_id), ...completedRows.map(item => item.user_id)]));
    let profiles: Profile[] = [];
    if (ids.length) {
      const response = await client.from('profiles').select('id, name, avatar_url, avatar_crop').in('id', ids);
      if (response.error) throw supabaseError(response.error);
      profiles = response.data as Profile[];
    }
    const profilesById = profileMap(profiles);
    const validVotes = voteRows.filter(item => isVoteChoice(item.choice));
    const choiceProfiles = byChoice<VoteParticipant[]>(choice => validVotes
      .filter(item => item.choice === choice)
      .map(item => ({ ...(profilesById.get(item.user_id) || fallbackProfile(item.user_id)), reason: item.reason, reasonText: item.reason_text })));
    const myVote = validVotes.find(item => item.user_id === input.userId);
    return {
      voters: choiceParticipants(choiceProfiles),
      completed: completedRows.map(item => profilesById.get(item.user_id) || fallbackProfile(item.user_id)),
      choiceProfiles,
      myChoice: myVote?.choice ?? null,
      myReason: myVote?.reason || null,
      myReasonText: myVote?.reason_text || null,
      votedByMe: Boolean(myVote),
      completedByMe: completedRows.some(item => item.user_id === input.userId),
      inBacklog: Boolean(backlog),
      favorite: Boolean(favorite),
    };
  }

  async readCommentTimeline(input: CommentTimelineQuery): Promise<ClubComment[]> {
    const client = this.client('ler comentários');
    const [{ data: comments, error: commentsError }, { data: reactions, error: reactionsError }] = await Promise.all([
      client.from('club_comments').select('*').eq('game_id', input.gameId).eq('club_month', input.clubMonth).order('created_at'),
      client.from('comment_reactions').select('comment_id, emoji, user_id').eq('game_id', input.gameId).eq('club_month', input.clubMonth),
    ]);
    if (commentsError) throw supabaseError(commentsError);
    if (reactionsError) throw supabaseError(reactionsError);
    const commentRows = (comments || []) as unknown as TimelineCommentRow[];
    const reactionRows = (reactions || []) as unknown as TimelineReactionRow[];
    const userIds = Array.from(new Set([...commentRows.map(comment => comment.user_id), ...reactionRows.map(reaction => reaction.user_id)]));
    const { data: profiles, error: profilesError } = userIds.length
      ? await client.from('profiles').select('id, name, avatar_url, avatar_crop').in('id', userIds)
      : { data: [], error: null };
    if (profilesError) throw supabaseError(profilesError);
    return commentTimelineFromRows(commentRows, reactionRows, (profiles || []) as Profile[], input.userId);
  }

  async insertComment(input: CommentRowInput): Promise<string | null> {
    const { data, error } = await this.client('publicar comentário')
      .from('club_comments')
      .insert({ user_id: input.userId, game_id: input.gameId, club_month: input.clubMonth, parent_id: input.parentId, body: input.body })
      .select('id')
      .single();
    if (error) throw supabaseError(error);
    return (data as { id?: string } | null)?.id || null;
  }

  async writeCommentReaction(input: CommentReactionRowInput): Promise<void> {
    const client = this.client('salvar reação');
    const { error } = input.enabled
      ? await client.from('comment_reactions').insert({ comment_id: input.commentId, user_id: input.userId, emoji: input.emoji, game_id: input.gameId, club_month: input.clubMonth })
      : await client.from('comment_reactions').delete().eq('comment_id', input.commentId).eq('user_id', input.userId).eq('emoji', input.emoji);
    if (error) throw supabaseError(error);
  }

  async deleteOwnComment(input: OwnCommentKey): Promise<void> {
    const { error } = await this.client('apagar comentário').from('club_comments').delete()
      .eq('id', input.commentId)
      .eq('user_id', input.userId);
    if (error) throw supabaseError(error);
  }

  async readMembersWithRoles(): Promise<AdminUser[]> {
    const client = this.client('ler usuários');
    const [{ data: profiles, error: profilesError }, { data: roles, error: rolesError }] = await Promise.all([
      client.from('profiles').select('id, name, email, avatar_url, avatar_crop, bio, created_at').order('name'),
      client.from('user_roles').select('user_id, role'),
    ]);
    if (profilesError) throw supabaseError(profilesError);
    if (rolesError) throw supabaseError(rolesError);
    const roleMap = new Map(((roles || []) as Array<{ user_id: string; role: string }>).map(item => [item.user_id, item.role as AppRole]));
    return ((profiles || []) as Profile[]).map(profile => ({ ...profile, role: roleMap.get(profile.id) || 'member' })) as AdminUser[];
  }

  async readNoteSnapshots(input: NoteSnapshotsQuery): Promise<LocalNote[]> {
    const { data, error } = await this.client('ler anotações')
      .from('cycle_note_snapshots')
      .select('*')
      .eq('user_id', input.userId)
      .eq('cycle_month', input.month)
      .eq('game_id', input.gameId)
      .order('created_at');
    if (error) throw supabaseError(error);
    return ((data || []) as Array<{ note_id: string; user_id: string; game_id: string; body: string; image_data_url: string | null; created_at: string; updated_at: string }>)
      .map(note => ({ id: note.note_id, userId: note.user_id, gameId: note.game_id, body: note.body, imageDataUrl: note.image_data_url || undefined, createdAt: note.created_at, updatedAt: note.updated_at } satisfies LocalNote));
  }

  resetDemo() {
    this.demo.reset();
  }
}

export function createDataClient(options: DataClientOptions = {}) {
  return new DataClient(options);
}

export function requireClient(client: DataClient | null | undefined, operation = 'acessar os dados') {
  return requireValue(client, operation, 'A camada de dados não foi configurada.');
}
