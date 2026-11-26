import type { DiscoverItem, DiscoverSource, Game, GameMugshot, GotySearchGameResult, ProductUpdate, ProductUpdateHistory } from '@clube-do-jogo/domain';

export type ApiMethod = 'GET' | 'POST' | 'DELETE';

export interface ApiErrorBody {
  error: string;
}

export interface DiscoverRequestQuery {
  source?: DiscoverSource;
  q?: string;
  genre?: string;
  platform?: string;
  year?: string;
  month?: string;
  offset?: string;
  limit?: string;
}

export interface DiscoverResponse {
  items: DiscoverItem[];
  hasMore: boolean;
}

export interface SearchGamesRequestQuery {
  q: string;
}

export interface PlatformSearchRequestQuery {
  q: string;
}

export interface PlatformSearchResult {
  igdb_platform_id: number;
  name: string;
  abbreviation: string | null;
  logo_url: string | null;
}

export interface GameMugshotsResponse {
  mugshots: GameMugshot[];
}

export interface GotyResolveCoversRequest {
  limit?: number;
}

export interface GotyResolveCoversResponse {
  updated: number;
  remaining: number;
}

export interface GotySearchGamesRequestQuery {
  q?: string;
  includeAllYears?: 'true' | 'false';
  limit?: string;
}

export interface GotySearchGamesResponse {
  items: GotySearchGameResult[];
  source: 'igdb' | 'cache' | 'curated';
  only2026: boolean;
}

export interface PushSubscribeRequest {
  endpoint?: string;
  expirationTime?: number | null;
  keys?: { p256dh?: string; auth?: string };
}

export interface PushSubscribeResponse {
  ok: true;
}

export interface PushDispatchResult {
  sent: number;
  configured: boolean;
  native: { queued: number; configured: boolean; error?: string };
}

export interface PushNotConfigured {
  sent: number;
  configured: false;
}

export interface PushUnchanged {
  sent: number;
  changed: false;
}

export type PushVotingThresholdRequest =
  | { action: 'opened' | 'closed'; voteMonth: string }
  | { action: 'vote-saved'; voteMonth: string; gameId: string };

export type PushVotingThresholdResponse =
  | { changed: boolean }
  | PushNotConfigured
  | PushUnchanged
  | { changed: boolean; recipients: number; deliveries: PushDispatchResult[] };

export interface PushClubGameRequest {
  gameId: string;
  month: string;
}

export type PushClubGameResponse =
  | PushNotConfigured
  | PushUnchanged
  | PushDispatchResult
  | (PushDispatchResult & { changed: false });

export interface PushCommentRequest {
  commentId: string;
}

export type PushCommentResponse = PushNotConfigured | PushDispatchResult;

export interface PushRankingLeaderRequest {
  voteMonth: string;
  previousLeaderId: string | null;
  leaderId: string | null;
}

export type PushRankingLeaderResponse =
  | PushNotConfigured
  | PushUnchanged
  | (PushDispatchResult & { changed?: boolean });

export interface PushRewardsRequest {
  clubMonth: string;
}

export type PushRewardsResponse = PushNotConfigured | { sent: number } | PushDispatchResult;

export interface NativePushRegisterRequest {
  installationId: string;
  expoPushToken: string;
  projectId: string;
  platform: 'android' | 'ios';
}

export interface NativePushRegisterResponse {
  installation: {
    installationId: string;
    projectId: string;
    platform: 'android' | 'ios';
    linkedAt: string;
  };
  rotated: boolean;
  transferred: boolean;
}

export interface NativePushUnlinkRequest {
  installationId: string;
  expoPushToken: string;
}

export interface NativePushUnlinkResponse {
  unlinked: boolean;
}

export interface ProductUpdateResponse {
  history: ProductUpdateHistory | null;
  update: ProductUpdate | null;
}

interface RouteTypes<Query, Body, Response, ErrorStatus extends number> {
  query: Query;
  body: Body;
  response: Response;
  errorStatus: ErrorStatus;
}

export interface ApiContracts {
  discover: RouteTypes<DiscoverRequestQuery, never, DiscoverResponse, 401 | 500>;
  searchGames: RouteTypes<SearchGamesRequestQuery, never, Game[], 400 | 401 | 500>;
  searchPlatforms: RouteTypes<PlatformSearchRequestQuery, never, PlatformSearchResult[], 400 | 401 | 500>;
  gameMedia: RouteTypes<never, never, Game, 401 | 404>;
  gameMugshots: RouteTypes<never, never, GameMugshotsResponse, 401 | 404>;
  gotyResolveCovers: RouteTypes<never, GotyResolveCoversRequest, GotyResolveCoversResponse, 401 | 500>;
  gotySearchGames: RouteTypes<GotySearchGamesRequestQuery, never, GotySearchGamesResponse, 401 | 500>;
  pushSubscribe: RouteTypes<never, PushSubscribeRequest, PushSubscribeResponse, 400 | 401 | 500>;
  pushVotingThreshold: RouteTypes<never, PushVotingThresholdRequest, PushVotingThresholdResponse, 400 | 401 | 500>;
  pushClubGame: RouteTypes<never, PushClubGameRequest, PushClubGameResponse, 400 | 401 | 403 | 500>;
  pushComment: RouteTypes<never, PushCommentRequest, PushCommentResponse, 400 | 401 | 404>;
  pushRankingLeader: RouteTypes<never, PushRankingLeaderRequest, PushRankingLeaderResponse, 400 | 401 | 500>;
  pushRewards: RouteTypes<never, PushRewardsRequest, PushRewardsResponse, 400 | 401 | 403 | 500>;
  pushNativeRegister: RouteTypes<never, NativePushRegisterRequest, NativePushRegisterResponse, 400 | 401 | 500 | 503>;
  pushNativeUnlink: RouteTypes<never, NativePushUnlinkRequest, NativePushUnlinkResponse, 400 | 401 | 500>;
  productUpdate: RouteTypes<never, never, ProductUpdateResponse, never>;
}

export type ApiRouteKey = keyof ApiContracts;
export type ApiRequestQuery<K extends ApiRouteKey> = ApiContracts[K]['query'];
export type ApiRequestBody<K extends ApiRouteKey> = ApiContracts[K]['body'];
export type ApiResponse<K extends ApiRouteKey> = ApiContracts[K]['response'];
export type ApiErrorStatus<K extends ApiRouteKey> = ApiContracts[K]['errorStatus'];
export type ApiResult<K extends ApiRouteKey> = ApiResponse<K> | ApiErrorBody;

type AllKeys<T> = T extends unknown ? keyof T : never;
type ValueAt<T, P extends PropertyKey> = T extends unknown ? (P extends keyof T ? T[P] : never) : never;

export type Unvalidated<T> = [T] extends [readonly unknown[]]
  ? unknown
  : [T] extends [object]
    ? { [P in AllKeys<T>]?: Unvalidated<NonNullable<ValueAt<T, P>>> }
    : unknown;

export type ApiUntrustedBody<K extends ApiRouteKey> = Unvalidated<ApiRequestBody<K>>;

export interface ApiSearchParams<K extends ApiRouteKey> {
  get(name: Extract<keyof ApiRequestQuery<K>, string>): string | null;
}

export function normalizeSearchQuery(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function withQuery(path: string, query: object): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined) params.append(name, String(value));
  }
  return `${path}?${params.toString()}`;
}

function gamePath(gameId: string, leaf: 'media' | 'mugshots') {
  return `/api/games/${encodeURIComponent(gameId)}/${leaf}`;
}

export const apiRoutes = {
  discover: { method: 'GET', path: (query: DiscoverRequestQuery) => withQuery('/api/discover', query) },
  searchGames: { method: 'GET', path: (query: SearchGamesRequestQuery) => withQuery('/api/search', { q: normalizeSearchQuery(query.q) }) },
  searchPlatforms: { method: 'GET', path: (query: PlatformSearchRequestQuery) => withQuery('/api/platforms/search', { q: normalizeSearchQuery(query.q) }) },
  gameMedia: { method: 'POST', path: (gameId: string) => gamePath(gameId, 'media') },
  gameMugshots: { method: 'GET', path: (gameId: string) => gamePath(gameId, 'mugshots') },
  gotyResolveCovers: { method: 'POST', path: '/api/goty/resolve-covers' },
  gotySearchGames: { method: 'GET', path: (query: GotySearchGamesRequestQuery) => withQuery('/api/goty/search-games', query) },
  pushSubscribe: { method: 'POST', path: '/api/push/subscribe' },
  pushVotingThreshold: { method: 'POST', path: '/api/push/voting-threshold' },
  pushClubGame: { method: 'POST', path: '/api/push/club-game' },
  pushComment: { method: 'POST', path: '/api/push/comment' },
  pushRankingLeader: { method: 'POST', path: '/api/push/ranking-leader' },
  pushRewards: { method: 'POST', path: '/api/push/rewards' },
  pushNativeRegister: { method: 'POST', path: '/api/push/native-installations' },
  pushNativeUnlink: { method: 'DELETE', path: '/api/push/native-installations' },
  productUpdate: { method: 'GET', path: '/api/product-update' },
} as const satisfies { [K in ApiRouteKey]: { method: ApiMethod; path: string | ((...args: never[]) => string) } };
