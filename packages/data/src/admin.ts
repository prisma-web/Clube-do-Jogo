import type { SupabaseClient } from '@supabase/supabase-js';
import { demoProfiles } from '@clube-do-jogo/domain/demo';
import { monthKey, shiftMonth } from '@clube-do-jogo/domain';
import type { AdminUser, AppRole, ClubCycle, Game } from '@clube-do-jogo/domain';
import { DemoStore } from './demo';
import { DataError, withDataErrors } from './errors';

export interface AdminScope {
  userId: string;
  isDemo: boolean;
}

export type AdminMutationOutcome = 'applied' | 'reconciled';
export type ClubGameChangeMode = 'current' | 'next';

export interface AdminRoleChangeInput extends AdminScope {
  targetUserId: string;
  role: AppRole;
}

export interface AdminRoleChangeResult {
  targetUserId: string;
  role: AppRole;
  outcome: AdminMutationOutcome;
}

export interface AdminGameOptionsQuery extends AdminScope {
  search?: string;
  limit?: number;
}

export interface ClubGameCycleBaseline {
  month: string;
  gameId: string;
  updatedAt: string | null;
}

export interface ClubGameChangePreview {
  gameId: string;
  mode: ClubGameChangeMode;
  activeCycle: ClubGameCycleBaseline | null;
  targetMonth: string;
}

export interface PreviewClubGameChangeInput extends AdminScope {
  gameId: string;
  mode: ClubGameChangeMode;
}

export interface SetClubGameInput extends AdminScope {
  preview: ClubGameChangePreview;
}

export interface ClubGameChangeResult {
  month: string;
  gameId: string;
  status: 'active';
  undoEventId?: string;
  outcome: AdminMutationOutcome;
}

export interface ClubGameUndoPreview {
  event_id: string;
  cycle_month: string;
  action: 'created' | 'game_changed';
  comments: number;
  reactions: number;
  votes: number;
  ranking_rows: number;
  progress_snapshots: number;
  note_snapshots: number;
  reward_grants: number;
}

export interface PreviewClubGameUndoInput extends AdminScope {
  eventId: string;
}

export interface UndoClubGameChangeInput extends AdminScope {
  preview: ClubGameUndoPreview;
  forceDelete: boolean;
}

export interface ClubGameUndoResult {
  month?: string;
  status: 'active' | 'removed';
  redoEventId: string;
  previousUndoEventId?: string;
  redoExpiresAt: string;
  outcome: AdminMutationOutcome;
}

export interface RedoClubGameChangeInput extends AdminScope {
  eventId: string;
}

export interface AdminDataClientOptions {
  supabase?: SupabaseClient | null;
  demo?: DemoStore;
  demoScope?: string;
  now?: () => Date;
  randomId?: () => string;
}

type ActiveCycleRow = {
  month: string;
  game_id: string;
  updated_at: string | null;
};

type CycleEventRow = {
  id: string;
  cycle_month: string;
  action: 'created' | 'game_changed' | 'closed';
  previous_game_id: string | null;
  game_id: string;
  created_at: string;
  reverted_at: string | null;
  redo_invalidated_at: string | null;
};

type DemoCycleEvent = CycleEventRow & {
  beforeCycles: ClubCycle[];
  afterCycles: ClubCycle[];
};

type DemoAdminState = {
  users: AdminUser[];
  cycles: ClubCycle[];
  events: DemoCycleEvent[];
};

const pendingByOwner = new WeakMap<object, Map<string, Promise<unknown>>>();
const demoStates = new WeakMap<DemoStore, Map<string, DemoAdminState>>();
let demoEventSequence = 0;
const DEFAULT_GAME_OPTIONS_LIMIT = 25;
const MAX_GAME_OPTIONS_LIMIT = 40;

function cloneCycle(cycle: ClubCycle): ClubCycle {
  return { ...cycle, game: cycle.game ? { ...cycle.game } : cycle.game };
}

function cloneCycles(cycles: ClubCycle[]): ClubCycle[] {
  return cycles.map(cloneCycle);
}

function cloneAdminUser(user: AdminUser): AdminUser {
  return { ...user, avatar_crop: user.avatar_crop ? { ...user.avatar_crop } : user.avatar_crop };
}

function gameOptionsLimit(value: number | undefined): number {
  if (!Number.isFinite(value) || !value || value < 1) return DEFAULT_GAME_OPTIONS_LIMIT;
  return Math.min(MAX_GAME_OPTIONS_LIMIT, Math.floor(value));
}

function gameOptionsSearch(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function escapeIlike(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

function compareGameOptions(left: Game, right: Game): number {
  return left.title.localeCompare(right.title, 'pt-BR') || left.id.localeCompare(right.id);
}

function cloneGame(game: Game): Game {
  return {
    ...game,
    screenshot_urls: game.screenshot_urls ? [...game.screenshot_urls] : game.screenshot_urls,
    genres: game.genres ? [...game.genres] : game.genres,
    platforms: game.platforms ? [...game.platforms] : game.platforms,
    platform_ids: game.platform_ids ? [...game.platform_ids] : game.platform_ids,
  };
}

function responseError(response: { error: unknown }): void {
  if (response.error) throw response.error;
}

function rpcError(operation: string, fallback: string, value: unknown): DataError {
  const message = value && typeof value === 'object' && 'message' in value
    ? String((value as { message: unknown }).message)
    : '';
  return new DataError(operation, message || fallback, value);
}

function requiredString(value: unknown, operation: string, field: string): string {
  if (typeof value !== 'string' || !value) throw new DataError(operation, `A resposta administrativa não contém ${field}.`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function count(value: unknown, operation: string, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new DataError(operation, `A resposta administrativa contém ${field} inválido.`);
  return parsed;
}

function parseRole(value: unknown): AppRole {
  if (value === 'admin' || value === 'member') return value;
  if (value == null) return 'member';
  throw new DataError('ler cargos', 'O servidor retornou um cargo inválido.');
}

function parseUndoPreview(value: unknown): ClubGameUndoPreview | null {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new DataError('pré-visualizar reversão', 'A prévia de reversão retornada pelo servidor é inválida.');
  }
  const row = value as Record<string, unknown>;
  if (row.error === 'unauthorized') throw new DataError('pré-visualizar reversão', 'Somente administradores podem revisar esta decisão.');
  if (row.action !== 'created' && row.action !== 'game_changed') {
    throw new DataError('pré-visualizar reversão', 'A ação retornada pelo servidor não pode ser revertida.');
  }
  return {
    event_id: requiredString(row.event_id, 'pré-visualizar reversão', 'o evento'),
    cycle_month: requiredString(row.cycle_month, 'pré-visualizar reversão', 'o ciclo'),
    action: row.action,
    comments: count(row.comments, 'pré-visualizar reversão', 'comentários'),
    reactions: count(row.reactions, 'pré-visualizar reversão', 'reações'),
    votes: count(row.votes, 'pré-visualizar reversão', 'votos'),
    ranking_rows: count(row.ranking_rows, 'pré-visualizar reversão', 'posições do ranking'),
    progress_snapshots: count(row.progress_snapshots, 'pré-visualizar reversão', 'snapshots de progresso'),
    note_snapshots: count(row.note_snapshots, 'pré-visualizar reversão', 'snapshots de notas'),
    reward_grants: count(row.reward_grants ?? 0, 'pré-visualizar reversão', 'recompensas'),
  };
}

function sameUndoPreview(left: ClubGameUndoPreview, right: ClubGameUndoPreview): boolean {
  return Object.keys(left).every(key => left[key as keyof ClubGameUndoPreview] === right[key as keyof ClubGameUndoPreview]);
}

function parseCycleEvent(value: unknown): CycleEventRow | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (row.action !== 'created' && row.action !== 'game_changed' && row.action !== 'closed') return null;
  if (typeof row.id !== 'string' || typeof row.cycle_month !== 'string' || typeof row.game_id !== 'string' || typeof row.created_at !== 'string') return null;
  return {
    id: row.id,
    cycle_month: row.cycle_month,
    action: row.action,
    previous_game_id: typeof row.previous_game_id === 'string' ? row.previous_game_id : null,
    game_id: row.game_id,
    created_at: row.created_at,
    reverted_at: typeof row.reverted_at === 'string' ? row.reverted_at : null,
    redo_invalidated_at: typeof row.redo_invalidated_at === 'string' ? row.redo_invalidated_at : null,
  };
}

function parseChangeResult(value: unknown, operation: string, outcome: AdminMutationOutcome): ClubGameChangeResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DataError(operation, 'O servidor não confirmou a decisão de ciclo.');
  }
  const row = value as Record<string, unknown>;
  if (row.status !== 'active') throw new DataError(operation, 'O servidor retornou um estado de ciclo inválido.');
  return {
    month: requiredString(row.month, operation, 'o mês'),
    gameId: requiredString(row.game_id, operation, 'o jogo'),
    status: 'active',
    undoEventId: optionalString(row.undo_event_id),
    outcome,
  };
}

function parseUndoResult(value: unknown): ClubGameUndoResult {
  const operation = 'desfazer decisão de ciclo';
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DataError(operation, 'O servidor não confirmou a reversão.');
  }
  const row = value as Record<string, unknown>;
  if (row.status !== 'active' && row.status !== 'removed') {
    throw new DataError(operation, 'O servidor retornou um estado de reversão inválido.');
  }
  return {
    month: optionalString(row.month),
    status: row.status,
    redoEventId: requiredString(row.redo_event_id, operation, 'o evento de redo'),
    previousUndoEventId: optionalString(row.previous_undo_event_id),
    redoExpiresAt: requiredString(row.redo_expires_at, operation, 'o prazo de redo'),
    outcome: 'applied',
  };
}

function cycleBaseline(row: ActiveCycleRow | null): ClubGameCycleBaseline | null {
  return row ? { month: row.month, gameId: row.game_id, updatedAt: row.updated_at } : null;
}

function sameBaseline(left: ClubGameCycleBaseline | null, right: ActiveCycleRow | null): boolean {
  if (!left || !right) return left === null && right === null;
  return left.month === right.month && left.gameId === right.game_id && left.updatedAt === right.updated_at;
}

function matchesChange(preview: ClubGameChangePreview, active: ActiveCycleRow | null): boolean {
  return Boolean(active && active.game_id === preview.gameId && active.month === preview.targetMonth);
}

function newestUndoEvent(events: CycleEventRow[], month: string, gameId: string): CycleEventRow | undefined {
  return events.find(event =>
    event.cycle_month === month
    && event.game_id === gameId
    && event.reverted_at === null
    && (event.action === 'created' || event.action === 'game_changed'));
}

function plusFiveMinutes(value: string): string {
  return new Date(new Date(value).getTime() + 5 * 60_000).toISOString();
}

function once<T>(owner: object, key: string, task: () => Promise<T>): Promise<T> {
  let pending = pendingByOwner.get(owner);
  if (!pending) {
    pending = new Map();
    pendingByOwner.set(owner, pending);
  }
  const existing = pending.get(key);
  if (existing) return existing as Promise<T>;
  const operation = task().finally(() => pending?.delete(key));
  pending.set(key, operation);
  return operation;
}

export class AdminDataClient {
  private readonly supabase: SupabaseClient | null;
  private readonly demo: DemoStore;
  private readonly demoScope: string;
  private readonly now: () => Date;
  private readonly randomId: () => string;

  constructor(options: AdminDataClientOptions = {}) {
    this.supabase = options.supabase || null;
    this.demo = options.demo || new DemoStore();
    this.demoScope = options.demoScope || 'default';
    this.now = options.now || (() => new Date());
    this.randomId = options.randomId || (() => `demo-cycle-${this.now().getTime()}-${++demoEventSequence}`);
  }

  private client(operation: string): SupabaseClient {
    if (!this.supabase) throw new DataError(operation, 'Configure o Supabase para usar a administração.');
    return this.supabase;
  }

  private async authenticatedClient(operation: string, userId: string): Promise<SupabaseClient> {
    const client = this.client(operation);
    const response = await client.auth.getUser();
    responseError(response);
    if (!response.data.user || response.data.user.id !== userId) {
      throw new DataError(operation, 'Sua sessão mudou. Entre novamente antes de continuar.');
    }
    return client;
  }

  private async requireAdmin(client: SupabaseClient, operation: string): Promise<void> {
    const response = await client.rpc('is_admin');
    if (response.error) throw rpcError(operation, 'Não foi possível confirmar seu acesso administrativo.', response.error);
    if (response.data !== true) throw new DataError(operation, 'Somente administradores podem concluir esta ação.');
  }

  private demoState(): DemoAdminState {
    let scopes = demoStates.get(this.demo);
    if (!scopes) {
      scopes = new Map();
      demoStates.set(this.demo, scopes);
    }
    let state = scopes.get(this.demoScope);
    if (!state) {
      state = {
        users: demoProfiles.map(profile => cloneAdminUser({ ...profile, role: this.demo.readRole(profile.id) })),
        cycles: cloneCycles(this.demo.readCycles()),
        events: [],
      };
      scopes.set(this.demoScope, state);
    }
    return state;
  }

  private requireDemoAdmin(state: DemoAdminState, userId: string, operation: string): void {
    if (state.users.find(user => user.id === userId)?.role !== 'admin') {
      throw new DataError(operation, 'Somente administradores podem concluir esta ação.');
    }
  }

  private async readRole(client: SupabaseClient, targetUserId: string): Promise<AppRole> {
    const response = await client.from('user_roles').select('role').eq('user_id', targetUserId).maybeSingle();
    responseError(response);
    return parseRole((response.data as { role?: unknown } | null)?.role);
  }

  private async readActiveCycle(client: SupabaseClient): Promise<ActiveCycleRow | null> {
    const response = await client.from('club_months')
      .select('month, game_id, updated_at')
      .eq('status', 'active')
      .maybeSingle();
    responseError(response);
    if (!response.data) return null;
    const row = response.data as Record<string, unknown>;
    return {
      month: requiredString(row.month, 'ler ciclo ativo', 'o mês'),
      game_id: requiredString(row.game_id, 'ler ciclo ativo', 'o jogo'),
      updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
    };
  }

  private async readEvents(client: SupabaseClient): Promise<CycleEventRow[]> {
    const response = await client.from('club_cycle_events')
      .select('id, cycle_month, action, previous_game_id, game_id, created_at, reverted_at, redo_invalidated_at')
      .order('created_at', { ascending: false });
    responseError(response);
    return (Array.isArray(response.data) ? response.data : []).flatMap(value => {
      const event = parseCycleEvent(value);
      return event ? [event] : [];
    });
  }

  private async liveUndoPreview(client: SupabaseClient, eventId: string): Promise<ClubGameUndoPreview | null> {
    const response = await client.rpc('get_club_game_undo_preview', { change_event_id: eventId });
    if (response.error) throw rpcError('pré-visualizar reversão', 'Não foi possível carregar a prévia de reversão.', response.error);
    return parseUndoPreview(response.data);
  }

  async readAdminUsers(scope: AdminScope): Promise<AdminUser[]> {
    if (scope.isDemo) {
      const state = this.demoState();
      this.requireDemoAdmin(state, scope.userId, 'ler usuários administrativos');
      return state.users.map(cloneAdminUser);
    }
    return withDataErrors('ler usuários administrativos', 'Não foi possível carregar os usuários.', async () => {
      const client = await this.authenticatedClient('ler usuários administrativos', scope.userId);
      await this.requireAdmin(client, 'ler usuários administrativos');
      const [profiles, roles] = await Promise.all([
        client.from('profiles').select('id, name, email, avatar_url, avatar_crop, bio, created_at').order('name'),
        client.from('user_roles').select('user_id, role'),
      ]);
      responseError(profiles);
      responseError(roles);
      const roleMap = new Map((Array.isArray(roles.data) ? roles.data : []).flatMap(value => {
        if (!value || typeof value !== 'object') return [];
        const row = value as Record<string, unknown>;
        return typeof row.user_id === 'string' ? [[row.user_id, parseRole(row.role)] as const] : [];
      }));
      return (Array.isArray(profiles.data) ? profiles.data : []).flatMap(value => {
        if (!value || typeof value !== 'object') return [];
        const row = value as Partial<AdminUser>;
        if (typeof row.id !== 'string') return [];
        return [{ ...row, id: row.id, name: row.name ?? null, avatar_url: row.avatar_url ?? null, role: roleMap.get(row.id) || 'member' } as AdminUser];
      });
    });
  }

  async readGameOptions(input: AdminGameOptionsQuery): Promise<Game[]> {
    const operation = 'buscar jogos administrativos';
    const search = gameOptionsSearch(input.search);
    const limit = gameOptionsLimit(input.limit);
    if (input.isDemo) {
      const state = this.demoState();
      this.requireDemoAdmin(state, input.userId, operation);
      const page = this.demo.readDiscoveryPage(input.userId, 'friends', {}, 0, MAX_GAME_OPTIONS_LIMIT);
      return page.items
        .map(item => item.game)
        .filter(game => !search || game.title.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))
        .sort(compareGameOptions)
        .slice(0, limit)
        .map(cloneGame);
    }
    return withDataErrors(operation, 'Não foi possível buscar jogos no catálogo.', async () => {
      const client = await this.authenticatedClient(operation, input.userId);
      await this.requireAdmin(client, operation);
      let query = client.from('games').select('*');
      if (search) query = query.ilike('title', `%${escapeIlike(search)}%`);
      const response = await query
        .order('title', { ascending: true })
        .order('id', { ascending: true })
        .limit(limit);
      responseError(response);
      return (Array.isArray(response.data) ? response.data : []) as Game[];
    });
  }

  async setUserRole(input: AdminRoleChangeInput): Promise<AdminRoleChangeResult> {
    if (input.isDemo) {
      const state = this.demoState();
      this.requireDemoAdmin(state, input.userId, 'alterar cargo');
      const current = state.users.find(user => user.id === input.targetUserId);
      if (!current) throw new DataError('alterar cargo', 'Usuário não encontrado.');
      if (current.role === input.role) return { targetUserId: current.id, role: current.role, outcome: 'reconciled' };
      if (current.role === 'admin' && input.role === 'member' && state.users.filter(user => user.role === 'admin').length <= 1) {
        throw new DataError('alterar cargo', 'O sistema precisa manter pelo menos um administrador.');
      }
      current.role = input.role;
      this.demo.setRole(current.id, input.role);
      return { targetUserId: current.id, role: current.role, outcome: 'applied' };
    }
    const owner = this.client('alterar cargo');
    return once(owner, `role:${input.userId}:${input.targetUserId}:${input.role}`, () => withDataErrors('alterar cargo', 'Não foi possível alterar o cargo.', async () => {
      const client = await this.authenticatedClient('alterar cargo', input.userId);
      await this.requireAdmin(client, 'alterar cargo');
      if (await this.readRole(client, input.targetUserId) === input.role) {
        return { targetUserId: input.targetUserId, role: input.role, outcome: 'reconciled' };
      }
      const response = await client.rpc('set_user_role', { target_user_id: input.targetUserId, new_role: input.role });
      if (response.error) {
        if (await this.readRole(client, input.targetUserId) === input.role) {
          return { targetUserId: input.targetUserId, role: input.role, outcome: 'reconciled' };
        }
        throw rpcError('alterar cargo', 'Não foi possível alterar o cargo.', response.error);
      }
      return { targetUserId: input.targetUserId, role: input.role, outcome: 'applied' };
    }));
  }

  async previewClubGameChange(input: PreviewClubGameChangeInput): Promise<ClubGameChangePreview> {
    if (input.isDemo) {
      const state = this.demoState();
      this.requireDemoAdmin(state, input.userId, 'pré-visualizar decisão de ciclo');
      const active = state.cycles.find(cycle => cycle.status === 'active') || null;
      return {
        gameId: input.gameId,
        mode: input.mode,
        activeCycle: active ? { month: active.month, gameId: active.game_id, updatedAt: active.started_at || null } : null,
        targetMonth: active
          ? input.mode === 'next' ? shiftMonth(active.month, 1) : active.month
          : shiftMonth(monthKey(this.now()), input.mode === 'next' ? 1 : 0),
      };
    }
    return withDataErrors('pré-visualizar decisão de ciclo', 'Não foi possível preparar a decisão de ciclo.', async () => {
      const client = await this.authenticatedClient('pré-visualizar decisão de ciclo', input.userId);
      await this.requireAdmin(client, 'pré-visualizar decisão de ciclo');
      const active = await this.readActiveCycle(client);
      return {
        gameId: input.gameId,
        mode: input.mode,
        activeCycle: cycleBaseline(active),
        targetMonth: active
          ? input.mode === 'next' ? shiftMonth(active.month, 1) : active.month
          : shiftMonth(monthKey(this.now()), input.mode === 'next' ? 1 : 0),
      };
    });
  }

  private reconciledChange(preview: ClubGameChangePreview, active: ActiveCycleRow | null, events: CycleEventRow[]): ClubGameChangeResult | null {
    if (!matchesChange(preview, active) || !active) return null;
    const event = newestUndoEvent(events, active.month, preview.gameId);
    const changed = preview.mode === 'next' || preview.activeCycle?.gameId !== preview.gameId;
    return { month: active.month, gameId: active.game_id, status: 'active', undoEventId: changed ? event?.id : undefined, outcome: 'reconciled' };
  }

  private async setClubGameLive(input: SetClubGameInput): Promise<ClubGameChangeResult> {
    const client = await this.authenticatedClient('definir jogo do clube', input.userId);
    await this.requireAdmin(client, 'definir jogo do clube');
    const active = await this.readActiveCycle(client);
    if (matchesChange(input.preview, active)) {
      const alreadyApplied = this.reconciledChange(input.preview, active, await this.readEvents(client));
      if (alreadyApplied) return alreadyApplied;
    }
    if (!sameBaseline(input.preview.activeCycle, active)) {
      throw new DataError('definir jogo do clube', 'O ciclo mudou desde a prévia. Revise a decisão antes de confirmar.');
    }
    const response = await client.rpc('set_club_game', {
      selected_game_id: input.preview.gameId,
      mode: input.preview.mode,
    });
    if (response.error) {
      const reconciled = this.reconciledChange(input.preview, await this.readActiveCycle(client), await this.readEvents(client));
      if (reconciled) return reconciled;
      throw rpcError('definir jogo do clube', 'Não foi possível definir o jogo do clube.', response.error);
    }
    return parseChangeResult(response.data, 'definir jogo do clube', 'applied');
  }

  private setClubGameDemo(input: SetClubGameInput): ClubGameChangeResult {
    const state = this.demoState();
    this.requireDemoAdmin(state, input.userId, 'definir jogo do clube');
    const active = state.cycles.find(cycle => cycle.status === 'active') || null;
    const activeRow = active ? { month: active.month, game_id: active.game_id, updated_at: active.started_at || null } : null;
    const reconciled = this.reconciledChange(input.preview, activeRow, state.events);
    if (reconciled) return reconciled;
    if (!sameBaseline(input.preview.activeCycle, activeRow)) {
      throw new DataError('definir jogo do clube', 'O ciclo mudou desde a prévia. Revise a decisão antes de confirmar.');
    }
    const beforeCycles = cloneCycles(state.cycles);
    const now = this.now().toISOString();
    const targetMonth = input.preview.targetMonth;
    let action: 'created' | 'game_changed';
    let previousGameId: string | null = null;
    if (input.preview.mode === 'current' && active) {
      action = 'game_changed';
      previousGameId = active.game_id;
      active.game_id = input.preview.gameId;
      active.selected_by = input.userId;
    } else {
      action = 'created';
      if (active) {
        active.status = 'closed';
        active.closed_at = now;
      }
      state.cycles.unshift({
        month: targetMonth,
        game_id: input.preview.gameId,
        status: 'active',
        started_at: now,
        selected_by: input.userId,
      });
    }
    state.events.forEach(event => {
      if (event.reverted_at && !event.redo_invalidated_at) event.redo_invalidated_at = now;
    });
    const event: DemoCycleEvent = {
      id: this.randomId(),
      cycle_month: targetMonth,
      action,
      previous_game_id: previousGameId,
      game_id: input.preview.gameId,
      created_at: now,
      reverted_at: null,
      redo_invalidated_at: null,
      beforeCycles,
      afterCycles: cloneCycles(state.cycles),
    };
    state.events.unshift(event);
    this.demo.setCycles(state.cycles);
    return { month: targetMonth, gameId: input.preview.gameId, status: 'active', undoEventId: event.id, outcome: 'applied' };
  }

  async setClubGame(input: SetClubGameInput): Promise<ClubGameChangeResult> {
    const owner = input.isDemo ? this.demo : this.client('definir jogo do clube');
    const key = `set-game:${this.demoScope}:${input.userId}:${JSON.stringify(input.preview)}`;
    return once(owner, key, () => input.isDemo
      ? Promise.resolve(this.setClubGameDemo(input))
      : withDataErrors('definir jogo do clube', 'Não foi possível definir o jogo do clube.', () => this.setClubGameLive(input)));
  }

  async previewClubGameUndo(input: PreviewClubGameUndoInput): Promise<ClubGameUndoPreview | null> {
    if (input.isDemo) {
      const state = this.demoState();
      this.requireDemoAdmin(state, input.userId, 'pré-visualizar reversão');
      const event = state.events.find(item => item.id === input.eventId && item.reverted_at === null);
      return event ? {
        event_id: event.id,
        cycle_month: event.cycle_month,
        action: event.action === 'game_changed' ? 'game_changed' : 'created',
        comments: 0,
        reactions: 0,
        votes: 0,
        ranking_rows: 0,
        progress_snapshots: 0,
        note_snapshots: 0,
        reward_grants: 0,
      } : null;
    }
    return withDataErrors('pré-visualizar reversão', 'Não foi possível carregar a prévia de reversão.', async () => {
      const client = await this.authenticatedClient('pré-visualizar reversão', input.userId);
      await this.requireAdmin(client, 'pré-visualizar reversão');
      return this.liveUndoPreview(client, input.eventId);
    });
  }

  private previousUndoEvent(events: CycleEventRow[], event: CycleEventRow): CycleEventRow | undefined {
    const cycleMonth = event.action === 'created' ? shiftMonth(event.cycle_month, -1) : event.cycle_month;
    return events.find(candidate =>
      candidate.id !== event.id
      && candidate.reverted_at === null
      && (candidate.action === 'created' || candidate.action === 'game_changed')
      && candidate.cycle_month === cycleMonth
      && candidate.created_at < event.created_at);
  }

  private reconciledUndo(events: CycleEventRow[], active: ActiveCycleRow | null, eventId: string): ClubGameUndoResult | null {
    const event = events.find(candidate => candidate.id === eventId);
    if (!event?.reverted_at) return null;
    const previous = this.previousUndoEvent(events, event);
    return {
      status: active ? 'active' : 'removed',
      month: active?.month,
      redoEventId: event.id,
      previousUndoEventId: previous?.id,
      redoExpiresAt: plusFiveMinutes(event.reverted_at),
      outcome: 'reconciled',
    };
  }

  private async undoLive(input: UndoClubGameChangeInput): Promise<ClubGameUndoResult> {
    const client = await this.authenticatedClient('desfazer decisão de ciclo', input.userId);
    await this.requireAdmin(client, 'desfazer decisão de ciclo');
    const [events, active] = await Promise.all([this.readEvents(client), this.readActiveCycle(client)]);
    const reconciled = this.reconciledUndo(events, active, input.preview.event_id);
    if (reconciled) return reconciled;
    const currentPreview = await this.liveUndoPreview(client, input.preview.event_id);
    if (!currentPreview || !sameUndoPreview(input.preview, currentPreview)) {
      throw new DataError('desfazer decisão de ciclo', 'A prévia mudou. Revise os dados antes de confirmar a reversão.');
    }
    const response = await client.rpc('undo_club_game_change', {
      change_event_id: input.preview.event_id,
      force_delete: input.forceDelete,
    });
    if (response.error) {
      const [nextEvents, nextActive] = await Promise.all([this.readEvents(client), this.readActiveCycle(client)]);
      const afterError = this.reconciledUndo(nextEvents, nextActive, input.preview.event_id);
      if (afterError) return afterError;
      throw rpcError('desfazer decisão de ciclo', 'Não foi possível desfazer a decisão de ciclo.', response.error);
    }
    return parseUndoResult(response.data);
  }

  private undoDemo(input: UndoClubGameChangeInput): ClubGameUndoResult {
    const state = this.demoState();
    this.requireDemoAdmin(state, input.userId, 'desfazer decisão de ciclo');
    const event = state.events.find(item => item.id === input.preview.event_id);
    if (!event) throw new DataError('desfazer decisão de ciclo', 'Esta decisão não está disponível para reversão.');
    const active = state.cycles.find(cycle => cycle.status === 'active') || null;
    const reconciled = this.reconciledUndo(
      state.events,
      active ? { month: active.month, game_id: active.game_id, updated_at: active.started_at || null } : null,
      event.id,
    );
    if (reconciled) return reconciled;
    const currentPreview = {
      event_id: event.id,
      cycle_month: event.cycle_month,
      action: event.action === 'game_changed' ? 'game_changed' as const : 'created' as const,
      comments: 0,
      reactions: 0,
      votes: 0,
      ranking_rows: 0,
      progress_snapshots: 0,
      note_snapshots: 0,
      reward_grants: 0,
    };
    if (!sameUndoPreview(input.preview, currentPreview)) {
      throw new DataError('desfazer decisão de ciclo', 'A prévia mudou. Revise os dados antes de confirmar a reversão.');
    }
    state.cycles = cloneCycles(event.beforeCycles);
    this.demo.setCycles(state.cycles);
    event.reverted_at = this.now().toISOString();
    const previous = this.previousUndoEvent(state.events, event);
    return {
      month: state.cycles.find(cycle => cycle.status === 'active')?.month,
      status: state.cycles.some(cycle => cycle.status === 'active') ? 'active' : 'removed',
      redoEventId: event.id,
      previousUndoEventId: previous?.id,
      redoExpiresAt: plusFiveMinutes(event.reverted_at),
      outcome: 'applied',
    };
  }

  async undoClubGameChange(input: UndoClubGameChangeInput): Promise<ClubGameUndoResult> {
    const owner = input.isDemo ? this.demo : this.client('desfazer decisão de ciclo');
    return once(owner, `undo:${this.demoScope}:${input.userId}:${input.preview.event_id}`, () => input.isDemo
      ? Promise.resolve(this.undoDemo(input))
      : withDataErrors('desfazer decisão de ciclo', 'Não foi possível desfazer a decisão de ciclo.', () => this.undoLive(input)));
  }

  private reconciledRedo(events: CycleEventRow[], active: ActiveCycleRow | null, eventId: string): ClubGameChangeResult | null {
    const event = events.find(candidate => candidate.id === eventId);
    if (!event?.reverted_at || !event.redo_invalidated_at || !active) return null;
    if (active.month !== event.cycle_month || active.game_id !== event.game_id) return null;
    const currentEvent = newestUndoEvent(events, active.month, active.game_id);
    if (!currentEvent || currentEvent.id === event.id) return null;
    return { month: active.month, gameId: active.game_id, status: 'active', undoEventId: currentEvent.id, outcome: 'reconciled' };
  }

  private async redoLive(input: RedoClubGameChangeInput): Promise<ClubGameChangeResult> {
    const client = await this.authenticatedClient('refazer decisão de ciclo', input.userId);
    await this.requireAdmin(client, 'refazer decisão de ciclo');
    const [events, active] = await Promise.all([this.readEvents(client), this.readActiveCycle(client)]);
    const reconciled = this.reconciledRedo(events, active, input.eventId);
    if (reconciled) return reconciled;
    const response = await client.rpc('redo_club_game_change', { change_event_id: input.eventId });
    if (response.error) {
      const [nextEvents, nextActive] = await Promise.all([this.readEvents(client), this.readActiveCycle(client)]);
      const afterError = this.reconciledRedo(nextEvents, nextActive, input.eventId);
      if (afterError) return afterError;
      throw rpcError('refazer decisão de ciclo', 'Não foi possível refazer a decisão de ciclo.', response.error);
    }
    return parseChangeResult(response.data, 'refazer decisão de ciclo', 'applied');
  }

  private redoDemo(input: RedoClubGameChangeInput): ClubGameChangeResult {
    const state = this.demoState();
    this.requireDemoAdmin(state, input.userId, 'refazer decisão de ciclo');
    const event = state.events.find(item => item.id === input.eventId);
    if (!event?.reverted_at || event.redo_invalidated_at || new Date(event.reverted_at).getTime() + 5 * 60_000 < this.now().getTime()) {
      throw new DataError('refazer decisão de ciclo', 'O prazo para refazer esta decisão expirou.');
    }
    state.events.forEach(candidate => {
      if (candidate.reverted_at && !candidate.redo_invalidated_at) candidate.redo_invalidated_at = this.now().toISOString();
    });
    state.cycles = cloneCycles(event.afterCycles);
    this.demo.setCycles(state.cycles);
    const replay: DemoCycleEvent = {
      ...event,
      id: this.randomId(),
      created_at: this.now().toISOString(),
      reverted_at: null,
      redo_invalidated_at: null,
      beforeCycles: cloneCycles(event.beforeCycles),
      afterCycles: cloneCycles(event.afterCycles),
    };
    state.events.unshift(replay);
    return {
      month: event.cycle_month,
      gameId: event.game_id,
      status: 'active',
      undoEventId: replay.id,
      outcome: 'applied',
    };
  }

  async redoClubGameChange(input: RedoClubGameChangeInput): Promise<ClubGameChangeResult> {
    const owner = input.isDemo ? this.demo : this.client('refazer decisão de ciclo');
    return once(owner, `redo:${this.demoScope}:${input.userId}:${input.eventId}`, () => input.isDemo
      ? Promise.resolve(this.redoDemo(input))
      : withDataErrors('refazer decisão de ciclo', 'Não foi possível refazer a decisão de ciclo.', () => this.redoLive(input)));
  }
}

export function createAdminDataClient(options: AdminDataClientOptions = {}): AdminDataClient {
  return new AdminDataClient(options);
}
