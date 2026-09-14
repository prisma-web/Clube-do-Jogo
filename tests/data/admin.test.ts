import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createAdminDataClient,
  createDataClient,
  DemoStore,
  type ClubGameUndoPreview,
} from '../../packages/data/src/index';

type QueryResult = { data: unknown; error: Error | null };
type RpcCall = { name: string; args: Record<string, unknown> | undefined };
type GameQueryOptions = { ilike: Record<string, string>; limit: number | undefined; order: string[] };
type EventRow = {
  id: string;
  cycle_month: string;
  action: 'created' | 'game_changed' | 'closed';
  previous_game_id: string | null;
  game_id: string;
  created_at: string;
  reverted_at: string | null;
  redo_invalidated_at: string | null;
};

class FakeQuery implements PromiseLike<QueryResult> {
  private readonly filters = new Map<string, unknown>();
  private readonly ilikeFilters = new Map<string, string>();
  private readonly ordering: string[] = [];
  private requestedLimit: number | undefined;

  constructor(
    private readonly backend: FakeAdminBackend,
    private readonly table: string,
  ) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.set(column, value);
    return this;
  }

  order(...args: [string?, unknown?]) {
    const [column] = args;
    if (column) this.ordering.push(column);
    return this;
  }

  ilike(column: string, pattern: string) {
    this.ilikeFilters.set(column, pattern);
    return this;
  }

  limit(value: number) {
    this.requestedLimit = value;
    return this;
  }

  maybeSingle(): Promise<QueryResult> {
    return Promise.resolve(this.backend.query(this.table, this.filters, true));
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.backend.query(this.table, this.filters, false, {
      ilike: Object.fromEntries(this.ilikeFilters),
      limit: this.requestedLimit,
      order: this.ordering,
    })).then(onfulfilled, onrejected);
  }
}

function unescapeIlike(value: string): string {
  let result = '';
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '\\' && index + 1 < value.length && '\\%_'.includes(value[index + 1])) {
      result += value[index + 1];
      index += 1;
    } else {
      result += value[index];
    }
  }
  return result;
}

class FakeAdminBackend {
  userId = 'admin-a';
  admin = true;
  profiles = [
    { id: 'admin-a', name: 'Ada', email: 'ada@example.com', avatar_url: null },
    { id: 'member-b', name: 'Bia', email: 'bia@example.com', avatar_url: null },
  ];
  roles = new Map<string, 'admin' | 'member'>([['admin-a', 'admin'], ['member-b', 'member']]);
  active: { month: string; game_id: string; updated_at: string } | null = {
    month: '2026-09',
    game_id: 'game-old',
    updated_at: '2026-09-01T00:00:00.000Z',
  };
  events: EventRow[] = [];
  undoPreview: ClubGameUndoPreview | null = null;
  calls: RpcCall[] = [];
  gameQueries: GameQueryOptions[] = [];
  games = [
    { id: 'hades', title: 'Hades', duration_hours: 22, image_url: 'hades.jpg', description: 'Hades' },
    { id: 'literal-percent', title: '100% Fun', duration_hours: 4, image_url: 'percent.jpg', description: 'Percent' },
    { id: 'literal-under', title: 'A_B', duration_hours: 4, image_url: 'under.jpg', description: 'Underscore' },
    ...Array.from({ length: 45 }, (_, index) => ({
      id: `catalog-${String(index).padStart(2, '0')}`,
      title: `Catalog ${String(index).padStart(2, '0')}`,
      duration_hours: 1,
      image_url: `catalog-${index}.jpg`,
      description: `Catalog ${index}`,
    })),
  ];
  rpcOverride?: (name: string, args: Record<string, unknown> | undefined) => Promise<QueryResult>;

  readonly client: SupabaseClient;

  constructor() {
    this.client = {
      auth: {
        getUser: async () => ({ data: { user: { id: this.userId } }, error: null }),
      },
      from: (table: string) => new FakeQuery(this, table),
      rpc: (name: string, args?: Record<string, unknown>) => this.rpc(name, args),
    } as unknown as SupabaseClient;
  }

  query(table: string, filters: Map<string, unknown>, single: boolean, options: GameQueryOptions = { ilike: {}, limit: undefined, order: [] }): QueryResult {
    if (table === 'profiles') return { data: this.profiles, error: null };
    if (table === 'user_roles') {
      const target = filters.get('user_id');
      if (single) return { data: typeof target === 'string' ? { role: this.roles.get(target) } : null, error: null };
      return { data: [...this.roles].map(([user_id, role]) => ({ user_id, role })), error: null };
    }
    if (table === 'club_months') return { data: this.active, error: null };
    if (table === 'club_cycle_events') return { data: this.events, error: null };
    if (table === 'games') {
      this.gameQueries.push(options);
      let games = [...this.games];
      const pattern = options.ilike.title;
      if (pattern) {
        const search = unescapeIlike(pattern.slice(1, -1)).toLocaleLowerCase('pt-BR');
        games = games.filter(game => game.title.toLocaleLowerCase('pt-BR').includes(search));
      }
      games.sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id));
      return { data: options.limit === undefined ? games : games.slice(0, options.limit), error: null };
    }
    throw new Error(`consulta inesperada em ${table}`);
  }

  async rpc(name: string, args?: Record<string, unknown>): Promise<QueryResult> {
    this.calls.push({ name, args });
    if (this.rpcOverride) return this.rpcOverride(name, args);
    if (name === 'is_admin') return { data: this.admin, error: null };
    if (name === 'set_user_role') return { data: null, error: new Error('O sistema precisa manter pelo menos um administrador') };
    if (name === 'get_club_game_undo_preview') return { data: this.undoPreview, error: null };
    if (name === 'undo_club_game_change') return { data: null, error: new Error('undo não configurado') };
    if (name === 'redo_club_game_change') return { data: null, error: new Error('O prazo para refazer esta decisão expirou') };
    throw new Error(`RPC inesperado ${name}`);
  }
}

function preview(overrides: Partial<ClubGameUndoPreview> = {}): ClubGameUndoPreview {
  return {
    event_id: 'event-1',
    cycle_month: '2026-10',
    action: 'created',
    comments: 2,
    reactions: 3,
    votes: 4,
    ranking_rows: 5,
    progress_snapshots: 6,
    note_snapshots: 7,
    reward_grants: 8,
    ...overrides,
  };
}

function event(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: 'event-1',
    cycle_month: '2026-10',
    action: 'created',
    previous_game_id: null,
    game_id: 'game-new',
    created_at: '2026-09-10T10:00:00.000Z',
    reverted_at: null,
    redo_invalidated_at: null,
    ...overrides,
  };
}

test('catálogo administrativo busca jogos persistidos, ordena, limita e trata curingas literalmente', async () => {
  const backend = new FakeAdminBackend();
  const client = createAdminDataClient({ supabase: backend.client });

  assert.deepEqual((await client.readGameOptions({ userId: 'admin-a', isDemo: false, search: 'hades' })).map(game => game.id), ['hades']);
  assert.deepEqual(backend.gameQueries.at(-1), { ilike: { title: '%hades%' }, limit: 25, order: ['title', 'id'] });

  assert.deepEqual((await client.readGameOptions({ userId: 'admin-a', isDemo: false, search: '100%' })).map(game => game.id), ['literal-percent']);
  assert.equal(backend.gameQueries.at(-1)?.ilike.title, '%100\\%%');
  assert.deepEqual((await client.readGameOptions({ userId: 'admin-a', isDemo: false, search: 'A_B' })).map(game => game.id), ['literal-under']);
  assert.equal(backend.gameQueries.at(-1)?.ilike.title, '%A\\_B%');

  const all = await client.readGameOptions({ userId: 'admin-a', isDemo: false });
  assert.equal(all.length, 25);
  assert.equal((await client.readGameOptions({ userId: 'admin-a', isDemo: false, search: 'catalog', limit: 100 })).length, 40);
  assert.equal(backend.gameQueries.at(-1)?.limit, 40);
  assert.deepEqual(await client.readGameOptions({ userId: 'admin-a', isDemo: false, search: 'does-not-exist' }), []);
});

test('catálogo administrativo preserva o guard de administrador antes da consulta', async () => {
  const backend = new FakeAdminBackend();
  backend.admin = false;
  const client = createAdminDataClient({ supabase: backend.client });

  await assert.rejects(client.readGameOptions({ userId: 'admin-a', isDemo: false, search: 'hades' }), /Somente administradores/);
  assert.equal(backend.gameQueries.length, 0);
});

test('catálogo administrativo em demo usa o DemoStore e respeita o guard local', async () => {
  const client = createAdminDataClient({ demo: new DemoStore() });

  assert.deepEqual((await client.readGameOptions({ userId: 'demo-user', isDemo: true, search: 'hades' })).map(game => game.id), ['hades']);
  assert.deepEqual((await client.readGameOptions({ userId: 'demo-user', isDemo: true, search: 'does-not-exist' })), []);
  await assert.rejects(client.readGameOptions({ userId: 'bia', isDemo: true, search: 'hades' }), /Somente administradores/);
});

test('lista administrativa exige papel real e combina perfis com papéis', async () => {
  const backend = new FakeAdminBackend();
  const client = createAdminDataClient({ supabase: backend.client });
  backend.admin = false;
  await assert.rejects(client.readAdminUsers({ userId: 'admin-a', isDemo: false }), /Somente administradores/);
  await assert.rejects(client.setUserRole({
    userId: 'admin-a',
    isDemo: false,
    targetUserId: 'member-b',
    role: 'member',
  }), /Somente administradores/);

  backend.admin = true;
  assert.deepEqual(await client.readAdminUsers({ userId: 'admin-a', isDemo: false }), [
    { id: 'admin-a', name: 'Ada', email: 'ada@example.com', avatar_url: null, role: 'admin' },
    { id: 'member-b', name: 'Bia', email: 'bia@example.com', avatar_url: null, role: 'member' },
  ]);
});

test('alteração de papel preserva o RPC e a proteção do último admin', async () => {
  const backend = new FakeAdminBackend();
  const client = createAdminDataClient({ supabase: backend.client });

  await assert.rejects(client.setUserRole({
    userId: 'admin-a',
    isDemo: false,
    targetUserId: 'admin-a',
    role: 'member',
  }), /O sistema precisa manter pelo menos um administrador/);

  assert.deepEqual(backend.calls.at(-1), {
    name: 'set_user_role',
    args: { target_user_id: 'admin-a', new_role: 'member' },
  });
  assert.equal(backend.roles.get('admin-a'), 'admin');
});

test('papel aplicado com resposta perdida é reconciliado sem repetir o RPC', async () => {
  const backend = new FakeAdminBackend();
  backend.rpcOverride = async (name, args) => {
    if (name === 'is_admin') return { data: true, error: null };
    if (name !== 'set_user_role') throw new Error(`RPC inesperado ${name}`);
    backend.roles.set(String(args?.target_user_id), args?.new_role === 'admin' ? 'admin' : 'member');
    return { data: null, error: new Error('resposta perdida') };
  };
  const client = createAdminDataClient({ supabase: backend.client });
  const input = { userId: 'admin-a', isDemo: false, targetUserId: 'member-b', role: 'admin' as const };

  assert.deepEqual(await client.setUserRole(input), {
    targetUserId: 'member-b',
    role: 'admin',
    outcome: 'reconciled',
  });
  assert.deepEqual(await client.setUserRole(input), {
    targetUserId: 'member-b',
    role: 'admin',
    outcome: 'reconciled',
  });
  assert.equal(backend.calls.filter(call => call.name === 'set_user_role').length, 1);
});

test('prévia de undo alterada por outra sessão bloqueia a confirmação', async () => {
  const backend = new FakeAdminBackend();
  backend.events = [event()];
  backend.undoPreview = preview();
  const client = createAdminDataClient({ supabase: backend.client });
  const shown = await client.previewClubGameUndo({ userId: 'admin-a', isDemo: false, eventId: 'event-1' });
  assert.deepEqual(shown, preview());
  assert.deepEqual(backend.calls.find(call => call.name === 'get_club_game_undo_preview'), {
    name: 'get_club_game_undo_preview',
    args: { change_event_id: 'event-1' },
  });

  backend.undoPreview = preview({ comments: 9 });
  await assert.rejects(client.undoClubGameChange({
    userId: 'admin-a',
    isDemo: false,
    preview: shown as ClubGameUndoPreview,
    forceDelete: true,
  }), /A prévia mudou/);
  assert.equal(backend.calls.filter(call => call.name === 'undo_club_game_change').length, 0);
});

test('chamadas concorrentes de avanço compartilham uma única transação', async () => {
  const backend = new FakeAdminBackend();
  let release: ((value: QueryResult) => void) | undefined;
  backend.rpcOverride = async name => {
    if (name === 'is_admin') return { data: true, error: null };
    if (name !== 'set_club_game') throw new Error(`RPC inesperado ${name}`);
    return new Promise<QueryResult>(resolve => {
      release = value => {
        backend.active = { month: '2026-10', game_id: 'game-new', updated_at: '2026-09-10T10:00:00.000Z' };
        backend.events = [event()];
        resolve(value);
      };
    });
  };
  const client = createAdminDataClient({ supabase: backend.client });
  const changePreview = await client.previewClubGameChange({ userId: 'admin-a', isDemo: false, gameId: 'game-new', mode: 'next' });
  const input = { userId: 'admin-a', isDemo: false, preview: changePreview };
  const first = client.setClubGame(input);
  const second = client.setClubGame(input);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(backend.calls.filter(call => call.name === 'set_club_game').length, 1);
  assert.deepEqual(backend.calls.find(call => call.name === 'set_club_game'), {
    name: 'set_club_game',
    args: { selected_game_id: 'game-new', mode: 'next' },
  });
  release?.({ data: { month: '2026-10', game_id: 'game-new', status: 'active', undo_event_id: 'event-1' }, error: null });
  assert.deepEqual(await Promise.all([first, second]), [
    { month: '2026-10', gameId: 'game-new', status: 'active', undoEventId: 'event-1', outcome: 'applied' },
    { month: '2026-10', gameId: 'game-new', status: 'active', undoEventId: 'event-1', outcome: 'applied' },
  ]);
});

test('resposta perdida de avanço é reconciliada antes de uma repetição', async () => {
  const backend = new FakeAdminBackend();
  backend.rpcOverride = async (name) => {
    if (name === 'is_admin') return { data: true, error: null };
    if (name !== 'set_club_game') throw new Error(`RPC inesperado ${name}`);
    backend.active = { month: '2026-10', game_id: 'game-new', updated_at: '2026-09-10T10:00:00.000Z' };
    backend.events = [event()];
    return { data: null, error: new Error('resposta perdida') };
  };
  const client = createAdminDataClient({ supabase: backend.client });
  const changePreview = await client.previewClubGameChange({ userId: 'admin-a', isDemo: false, gameId: 'game-new', mode: 'next' });
  const input = { userId: 'admin-a', isDemo: false, preview: changePreview };

  assert.deepEqual(await client.setClubGame(input), {
    month: '2026-10',
    gameId: 'game-new',
    status: 'active',
    undoEventId: 'event-1',
    outcome: 'reconciled',
  });
  assert.deepEqual(await client.setClubGame(input), {
    month: '2026-10',
    gameId: 'game-new',
    status: 'active',
    undoEventId: 'event-1',
    outcome: 'reconciled',
  });
  assert.equal(backend.calls.filter(call => call.name === 'set_club_game').length, 1);
});

test('baseline de ciclo divergente exige uma nova prévia', async () => {
  const backend = new FakeAdminBackend();
  const client = createAdminDataClient({ supabase: backend.client });
  const changePreview = await client.previewClubGameChange({ userId: 'admin-a', isDemo: false, gameId: 'game-new', mode: 'next' });
  backend.active = { ...backend.active as NonNullable<typeof backend.active>, game_id: 'game-other', updated_at: '2026-09-10T09:00:00.000Z' };

  await assert.rejects(client.setClubGame({ userId: 'admin-a', isDemo: false, preview: changePreview }), /O ciclo mudou desde a prévia/);
  assert.equal(backend.calls.filter(call => call.name === 'set_club_game').length, 0);
});

test('resposta perdida de undo é reconciliada pelo evento e ciclo atuais', async () => {
  const backend = new FakeAdminBackend();
  backend.active = { month: '2026-10', game_id: 'game-new', updated_at: '2026-09-10T10:00:00.000Z' };
  backend.events = [
    event(),
    event({ id: 'event-previous', cycle_month: '2026-09', game_id: 'game-old', created_at: '2026-09-01T10:00:00.000Z' }),
  ];
  backend.undoPreview = preview();
  backend.rpcOverride = async (name) => {
    if (name === 'is_admin') return { data: true, error: null };
    if (name === 'get_club_game_undo_preview') return { data: backend.undoPreview, error: null };
    if (name !== 'undo_club_game_change') throw new Error(`RPC inesperado ${name}`);
    backend.events[0].reverted_at = '2026-09-10T12:00:00.000Z';
    backend.active = { month: '2026-09', game_id: 'game-old', updated_at: '2026-09-10T12:00:00.000Z' };
    return { data: null, error: new Error('resposta perdida') };
  };
  const client = createAdminDataClient({ supabase: backend.client });

  assert.deepEqual(await client.undoClubGameChange({
    userId: 'admin-a',
    isDemo: false,
    preview: preview(),
    forceDelete: true,
  }), {
    month: '2026-09',
    status: 'active',
    redoEventId: 'event-1',
    previousUndoEventId: 'event-previous',
    redoExpiresAt: '2026-09-10T12:05:00.000Z',
    outcome: 'reconciled',
  });
  assert.equal(backend.calls.filter(call => call.name === 'undo_club_game_change').length, 1);
  assert.deepEqual(backend.calls.find(call => call.name === 'undo_club_game_change'), {
    name: 'undo_club_game_change',
    args: { change_event_id: 'event-1', force_delete: true },
  });
});

test('resposta perdida de redo recupera o novo evento de undo', async () => {
  const backend = new FakeAdminBackend();
  backend.events = [event({ reverted_at: '2026-09-10T12:00:00.000Z' })];
  backend.rpcOverride = async (name) => {
    if (name === 'is_admin') return { data: true, error: null };
    if (name !== 'redo_club_game_change') throw new Error(`RPC inesperado ${name}`);
    backend.events[0].redo_invalidated_at = '2026-09-10T12:01:00.000Z';
    backend.events.unshift(event({ id: 'event-2', created_at: '2026-09-10T12:01:00.000Z' }));
    backend.active = { month: '2026-10', game_id: 'game-new', updated_at: '2026-09-10T12:01:00.000Z' };
    return { data: null, error: new Error('resposta perdida') };
  };
  const client = createAdminDataClient({ supabase: backend.client });

  assert.deepEqual(await client.redoClubGameChange({ userId: 'admin-a', isDemo: false, eventId: 'event-1' }), {
    month: '2026-10',
    gameId: 'game-new',
    status: 'active',
    undoEventId: 'event-2',
    outcome: 'reconciled',
  });
  assert.equal(backend.calls.filter(call => call.name === 'redo_club_game_change').length, 1);
});

test('janela de redo continua sob autoridade do RPC', async () => {
  const backend = new FakeAdminBackend();
  backend.events = [event({ reverted_at: '2020-01-01T00:00:00.000Z' })];
  const client = createAdminDataClient({ supabase: backend.client, now: () => new Date('2030-01-01T00:00:00.000Z') });

  await assert.rejects(client.redoClubGameChange({ userId: 'admin-a', isDemo: false, eventId: 'event-1' }), /O prazo para refazer esta decisão expirou/);
  assert.deepEqual(backend.calls.find(call => call.name === 'redo_club_game_change'), {
    name: 'redo_club_game_change',
    args: { change_event_id: 'event-1' },
  });
});

test('demo mantém avanço, undo, redo e expiração no mesmo escopo', async () => {
  let now = new Date('2026-09-10T12:00:00.000Z');
  const ids = ['demo-event-1', 'demo-event-2'];
  const client = createAdminDataClient({
    demo: new DemoStore(),
    demoScope: 'epoch-7',
    now: () => now,
    randomId: () => ids.shift() || 'unexpected-id',
  });
  const changePreview = await client.previewClubGameChange({ userId: 'demo-user', isDemo: true, gameId: 'game-new', mode: 'next' });
  const changed = await client.setClubGame({ userId: 'demo-user', isDemo: true, preview: changePreview });
  assert.deepEqual(changed, {
    month: changePreview.targetMonth,
    gameId: 'game-new',
    status: 'active',
    undoEventId: 'demo-event-1',
    outcome: 'applied',
  });
  const undoPreview = await client.previewClubGameUndo({ userId: 'demo-user', isDemo: true, eventId: 'demo-event-1' });
  const undone = await client.undoClubGameChange({ userId: 'demo-user', isDemo: true, preview: undoPreview as ClubGameUndoPreview, forceDelete: true });
  assert.equal(undone.redoExpiresAt, '2026-09-10T12:05:00.000Z');
  const redone = await client.redoClubGameChange({ userId: 'demo-user', isDemo: true, eventId: 'demo-event-1' });
  assert.deepEqual(redone, {
    month: changePreview.targetMonth,
    gameId: 'game-new',
    status: 'active',
    undoEventId: 'demo-event-2',
    outcome: 'applied',
  });

  const replayPreview = await client.previewClubGameUndo({ userId: 'demo-user', isDemo: true, eventId: 'demo-event-2' });
  await client.undoClubGameChange({ userId: 'demo-user', isDemo: true, preview: replayPreview as ClubGameUndoPreview, forceDelete: true });
  now = new Date('2026-09-10T12:05:00.001Z');
  await assert.rejects(client.redoClubGameChange({ userId: 'demo-user', isDemo: true, eventId: 'demo-event-2' }), /prazo para refazer/);
});


test('demo publica mudanças administrativas para os leitores do app e restaura o estado ao sair', async () => {
  const demo = new DemoStore();
  const reader = createDataClient({ demo });
  const admin = createAdminDataClient({ demo, randomId: () => 'demo-cycle-change' });
  const scope = { userId: 'demo-user', isDemo: true };
  const initial = await reader.readCycles(true);
  const preview = await admin.previewClubGameChange({ ...scope, gameId: 'celeste', mode: 'next' });
  const changed = await admin.setClubGame({ ...scope, preview });
  const after = await reader.readCycles(true);
  assert.equal(after.activeMonth, changed.month);
  assert.equal(after.cycles.find(cycle => cycle.month === initial.activeMonth)?.status, 'closed');
  assert.equal((await reader.readGameOfMonth({ ...scope, month: changed.month }))?.title, 'Celeste');
  assert.equal((await reader.readGameOfMonth({ ...scope, month: initial.activeMonth }))?.title, 'Hades');

  const undoPreview = await admin.previewClubGameUndo({ ...scope, eventId: changed.undoEventId! });
  await admin.undoClubGameChange({ ...scope, preview: undoPreview!, forceDelete: true });
  assert.equal((await reader.readCycles(true)).activeMonth, initial.activeMonth);
  await admin.redoClubGameChange({ ...scope, eventId: changed.undoEventId! });
  assert.equal((await reader.readCycles(true)).activeMonth, changed.month);

  await admin.setUserRole({ ...scope, targetUserId: 'bia', role: 'admin' });
  await admin.setUserRole({ ...scope, targetUserId: 'demo-user', role: 'member' });
  assert.equal((await reader.readSessionProfile('demo-user', true)).isAdmin, false);
  assert.equal((await reader.readSessionProfile('bia', true)).isAdmin, true);
  reader.resetDemo();
  assert.equal((await reader.readCycles(true)).activeMonth, initial.activeMonth);
  assert.equal((await reader.readSessionProfile('demo-user', true)).isAdmin, true);
  assert.equal((await reader.readSessionProfile('bia', true)).isAdmin, false);
});
