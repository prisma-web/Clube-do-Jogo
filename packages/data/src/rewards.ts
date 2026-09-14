import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
  SupabaseClient,
} from '@supabase/supabase-js';
import {
  demoGames,
  demoMonths,
  demoProgress,
} from '@clube-do-jogo/domain/demo';
import type { ClubReward, RewardGrant } from '@clube-do-jogo/domain';
import { isRewardEligibility } from '@clube-do-jogo/domain/rewards';
import type { DataScope } from './client';
import { DataError, withDataErrors } from './errors';

export type RewardsQuery = DataScope;

export interface RewardAcknowledgeInput extends RewardsQuery {
  grantId: string;
}

export interface RewardRealtimeEvent {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  grantId: string;
  userId: string | null;
  key: string;
}

export interface RewardsSubscriptionOptions extends RewardsQuery {
  onEvent(event: RewardRealtimeEvent): void;
  onStatus?(status: string): void;
}

export interface RewardsClient {
  read(input: RewardsQuery): Promise<RewardGrant[]>;
  acknowledge(input: RewardAcknowledgeInput): Promise<void>;
  subscribe(input: RewardsSubscriptionOptions): () => void;
}

export interface RewardsClientOptions {
  supabase?: SupabaseClient | null;
  demo?: boolean;
}

type Row = Record<string, unknown>;
type Cycle = NonNullable<RewardGrant['reward']['cycle']>;

const REWARD_SELECT = 'id, reward_id, granted_at, seen_at, reward:club_rewards(id, club_month, code, kind, name, description, theme_id, image_url, eligibility, cycle:club_months(month, game:games(title, image_url)))';
const DEMO_REWARD_MONTH = '2026-07';
const DEMO_REWARD_ID = 'demo-ori-reward';
const DEMO_THEME_REWARD_ID = 'demo-ori-theme';

function validateScope(input: RewardsQuery, operation: string) {
  if (!input || typeof input !== 'object') throw new DataError(operation, 'O contexto da recompensa é inválido.');
  if (typeof input.userId !== 'string' || !input.userId.trim()) throw new DataError(operation, 'A conta não foi informada.');
  if (typeof input.isDemo !== 'boolean') throw new DataError(operation, 'O modo da sessão é inválido.');
}

function validateMode(input: RewardsQuery, demo: boolean, operation: string) {
  validateScope(input, operation);
  if (input.isDemo !== demo) throw new DataError(operation, 'O modo da sessão não corresponde ao cliente de recompensas.');
}

function requiredString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function nullableString(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return value === null ? null : undefined;
  return typeof value === 'string' ? value : undefined;
}

function asObject(value: unknown): Row | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Row;
}

function relationObject(value: unknown): Row | null {
  if (Array.isArray(value)) return asObject(value[0]);
  return asObject(value);
}

function parseCycle(value: unknown): Cycle | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const row = relationObject(value);
  if (!row) return undefined;
  const month = requiredString(row.month);
  if (!month) return undefined;
  const gameRow = relationObject(row.game);
  if (!gameRow) return { month };
  const title = requiredString(gameRow.title);
  const imageUrl = nullableString(gameRow.image_url);
  if (!title || typeof imageUrl !== 'string') return { month };
  return { month, game: { title, image_url: imageUrl } };
}

function parseReward(value: unknown): (ClubReward & { cycle?: Cycle | null }) | null {
  const row = relationObject(value);
  if (!row) return null;
  const id = requiredString(row.id);
  const clubMonth = requiredString(row.club_month);
  const code = requiredString(row.code);
  const kind = row.kind;
  const name = requiredString(row.name);
  const description = nullableString(row.description);
  const themeId = nullableString(row.theme_id);
  const imageUrl = nullableString(row.image_url);
  if (!id || !clubMonth || !code || kind !== 'theme' || !name
    || description === undefined || themeId === undefined || imageUrl === undefined) return null;
  const eligibility = row.eligibility === undefined
    ? undefined
    : isRewardEligibility(row.eligibility) ? row.eligibility : null;
  if (row.eligibility !== undefined && eligibility === null) return null;
  const cycle = parseCycle(row.cycle);
  if (row.cycle !== undefined && cycle === undefined) return null;
  return {
    id,
    club_month: clubMonth,
    code,
    kind,
    name,
    description,
    theme_id: themeId,
    image_url: imageUrl,
    ...(eligibility ? { eligibility } : {}),
    ...(cycle !== undefined ? { cycle } : {}),
  };
}

function parseGrant(value: unknown): RewardGrant | null {
  const row = asObject(value);
  if (!row) return null;
  const id = requiredString(row.id);
  const rewardId = requiredString(row.reward_id);
  const grantedAt = requiredString(row.granted_at);
  const seenAt = nullableString(row.seen_at);
  const reward = parseReward(row.reward);
  if (!id || !rewardId || !grantedAt || seenAt === undefined || !reward) return null;
  return { id, reward_id: rewardId, granted_at: grantedAt, seen_at: seenAt, reward };
}

async function authenticatedClient(supabase: SupabaseClient, userId: string, operation: string) {
  if (!supabase.auth) throw new DataError(operation, 'Configure o Supabase para acessar suas recompensas.');
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user || data.user.id !== userId) throw new DataError(operation, 'Sua sessão não está autorizada para essa operação.');
  return supabase;
}

async function readRemote(supabase: SupabaseClient, input: RewardsQuery): Promise<RewardGrant[]> {
  const client = await authenticatedClient(supabase, input.userId, 'ler recompensas');
  const { data, error } = await client
    .from('user_reward_grants')
    .select(REWARD_SELECT)
    .eq('user_id', input.userId)
    .order('granted_at', { ascending: false });
  if (error) throw error;
  return (data || [])
    .map(parseGrant)
    .filter((grant): grant is RewardGrant => Boolean(grant));
}

function demoEligible(userId: string) {
  const cycleIndex = demoMonths.indexOf(DEMO_REWARD_MONTH);
  return cycleIndex > 0 && demoProgress.some(progress =>
    progress.user_id === userId
      && progress.game_id === demoGames[0]?.id
      && progress.status === 'finished',
  );
}

function demoGrant(seen: boolean): RewardGrant {
  const game = demoGames[0];
  return {
    id: DEMO_REWARD_ID,
    reward_id: DEMO_THEME_REWARD_ID,
    granted_at: '2026-07-31T23:59:59.000Z',
    seen_at: seen ? '2026-09-10T00:00:00.000Z' : null,
    reward: {
      id: DEMO_THEME_REWARD_ID,
      club_month: DEMO_REWARD_MONTH,
      code: `${DEMO_REWARD_MONTH}-theme-ori`,
      kind: 'theme',
      name: 'Tema Floresta de Nibel',
      description: 'Uma floresta noturna iluminada por espíritos e vida bioluminescente.',
      theme_id: 'ori',
      image_url: null,
      cycle: {
        month: DEMO_REWARD_MONTH,
        game: game ? { title: game.title, image_url: game.image_url } : null,
      },
    },
  };
}

function eventFromPayload(
  payload: RealtimePostgresChangesPayload<Row>,
  input: RewardsQuery,
): RewardRealtimeEvent | null {
  const eventType = payload.eventType;
  if (eventType !== 'INSERT' && eventType !== 'UPDATE' && eventType !== 'DELETE') return null;
  const row = asObject(eventType === 'DELETE' ? payload.old : payload.new);
  if (!row) return null;
  const grantId = requiredString(row.id);
  if (!grantId) return null;
  const userId = nullableString(row.user_id) ?? null;
  if (eventType !== 'DELETE' && userId !== input.userId) return null;
  if (userId && userId !== input.userId) return null;
  const version = [row.seen_at, row.granted_at, row.updated_at]
    .map(value => typeof value === 'string' ? value : '')
    .join(':');
  return {
    eventType,
    grantId,
    userId,
    key: `user_reward_grants:${eventType}:${grantId}:${version}`,
  };
}

type RewardSubscription = {
  channel: RealtimeChannel | null;
  listeners: Set<RewardsSubscriptionOptions>;
  seen: Set<string>;
  status?: string;
};

const subscriptions = new WeakMap<SupabaseClient, Map<string, RewardSubscription>>();
let subscriptionId = 0;

function subscribeRemote(supabase: SupabaseClient, input: RewardsSubscriptionOptions): () => void {
  let accounts = subscriptions.get(supabase);
  if (!accounts) {
    accounts = new Map();
    subscriptions.set(supabase, accounts);
  }
  let subscription = accounts.get(input.userId);
  if (subscription) {
    subscription.listeners.add(input);
    if (subscription.status) input.onStatus?.(subscription.status);
  } else {
    const created: RewardSubscription = { channel: null, listeners: new Set([input]), seen: new Set() };
    subscription = created;
    accounts.set(input.userId, created);
    created.channel = supabase
      .channel(`reward-grants:${input.userId}:${++subscriptionId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'user_reward_grants', filter: `user_id=eq.${input.userId}`,
      }, payload => {
        const event = eventFromPayload(payload, input);
        if (!event || created.seen.has(event.key)) return;
        created.seen.add(event.key);
        if (created.seen.size > 500) created.seen.delete(created.seen.values().next().value as string);
        for (const listener of created.listeners) listener.onEvent(event);
      })
      .subscribe(status => {
        created.status = status;
        for (const listener of created.listeners) listener.onStatus?.(status);
      });
  }
  const current = subscription;
  return () => {
    if (!current.listeners.delete(input) || current.listeners.size > 0) return;
    accounts.delete(input.userId);
    if (current.channel) void supabase.removeChannel(current.channel);
  };
}

export function createRewardsClient(options: RewardsClientOptions = {}): RewardsClient {
  const demo = options.demo === true;
  const seenDemoGrants = new Set<string>();
  const read = (input: RewardsQuery) => {
    validateMode(input, demo, 'ler recompensas');
    if (demo) return Promise.resolve(demoEligible(input.userId) ? [demoGrant(seenDemoGrants.has(input.userId))] : []);
    if (!options.supabase) return Promise.reject(new DataError('ler recompensas', 'Configure o Supabase para acessar suas recompensas.'));
    return withDataErrors('ler recompensas', 'Não foi possível carregar suas recompensas.', () => readRemote(options.supabase as SupabaseClient, input));
  };
  const acknowledge = (input: RewardAcknowledgeInput) => {
    validateMode(input, demo, 'reconhecer recompensa');
    if (typeof input.grantId !== 'string' || !input.grantId.trim()) {
      return Promise.reject(new DataError('reconhecer recompensa', 'A recompensa não foi informada.'));
    }
    if (demo) {
      if (!demoEligible(input.userId) || input.grantId !== DEMO_REWARD_ID) {
        return Promise.reject(new DataError('reconhecer recompensa', 'Recompensa não encontrada.'));
      }
      seenDemoGrants.add(input.userId);
      return Promise.resolve();
    }
    if (!options.supabase) return Promise.reject(new DataError('reconhecer recompensa', 'Configure o Supabase para acessar suas recompensas.'));
    return withDataErrors('reconhecer recompensa', 'Não foi possível reconhecer a recompensa.', async () => {
      const client = await authenticatedClient(options.supabase as SupabaseClient, input.userId, 'reconhecer recompensa');
      const { error } = await client.rpc('acknowledge_reward_grant', { target_grant_id: input.grantId });
      if (error) throw error;
    });
  };
  const subscribe = (input: RewardsSubscriptionOptions) => {
    validateMode(input, demo, 'assinar recompensas');
    if (demo) return () => undefined;
    if (!options.supabase) return () => undefined;
    return subscribeRemote(options.supabase as SupabaseClient, input);
  };
  return { read, acknowledge, subscribe };
}
