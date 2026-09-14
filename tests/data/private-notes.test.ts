import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { test } from 'node:test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  createCommentsClient,
  createNotesClient,
  NotesConflictError,
  type CommentRealtimeEvent,
} from '@clube-do-jogo/data';
import type { LocalNote } from '@clube-do-jogo/domain';

type FakeRow = Record<string, unknown>;

function copyRow(row: FakeRow): FakeRow {
  return { ...row };
}

function matches(row: FakeRow, filters: Array<[string, unknown]>, inFilters: Array<[string, unknown[]]>) {
  return filters.every(([column, value]) => row[column] === value)
    && inFilters.every(([column, values]) => values.includes(row[column]));
}

class FakeQuery implements PromiseLike<{ data: unknown; error: null }> {
  private action: 'read' | 'insert' | 'update' | 'delete' = 'read';
  private payload: FakeRow | FakeRow[] | null = null;
  private selected = false;
  private one = false;
  private filters: Array<[string, unknown]> = [];
  private inFilters: Array<[string, unknown[]]> = [];
  private removed: FakeRow[] = [];

  constructor(
    private readonly table: string,
    private readonly rows: Map<string, FakeRow[]>,
    private readonly calls: Array<{ table: string; method: string; value?: unknown }>,
  ) {}

  select() {
    this.selected = true;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    this.calls.push({ table: this.table, method: 'eq', value: [column, value] });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.inFilters.push([column, values]);
    return this;
  }

  order() {
    return this;
  }

  insert(value: FakeRow | FakeRow[]) {
    this.action = 'insert';
    this.payload = value;
    this.calls.push({ table: this.table, method: 'insert', value });
    return this;
  }

  update(value: FakeRow) {
    this.action = 'update';
    this.payload = value;
    this.calls.push({ table: this.table, method: 'update', value });
    return this;
  }

  delete() {
    this.action = 'delete';
    this.calls.push({ table: this.table, method: 'delete' });
    return this;
  }

  single() {
    this.one = true;
    return Promise.resolve(this.result());
  }

  maybeSingle() {
    this.one = true;
    return Promise.resolve(this.result());
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result()).then(onfulfilled, onrejected);
  }

  private result(): { data: unknown; error: null } {
    const current = this.rows.get(this.table) || [];
    if (this.action === 'insert') {
      const values = Array.isArray(this.payload) ? this.payload : [this.payload as FakeRow];
      const inserted = values.map(value => {
        const row = copyRow(value);
        if (!row.id && this.table === 'club_comments') row.id = `comment-${randomUUID()}`;
        if (!row.created_at && this.table === 'club_comments') row.created_at = '2026-09-10T10:00:00.000Z';
        if (!row.updated_at && this.table === 'club_comments') row.updated_at = row.created_at;
        current.push(row);
        return copyRow(row);
      });
      return { data: this.one ? inserted[0] || null : this.selected ? inserted : null, error: null };
    }
    const matching = current.filter(row => matches(row, this.filters, this.inFilters));
    if (this.action === 'update') {
      matching.forEach(row => Object.assign(row, this.payload as FakeRow));
      const updated = matching.map(copyRow);
      return { data: this.one ? updated[0] || null : this.selected ? updated : null, error: null };
    }
    if (this.action === 'delete') {
      this.removed = matching.map(copyRow);
      this.rows.set(this.table, current.filter(row => !matching.includes(row)));
      return { data: this.one ? this.removed[0] || null : this.selected ? this.removed : null, error: null };
    }
    const values = current.filter(row => matches(row, this.filters, this.inFilters)).map(copyRow);
    return { data: this.one ? values[0] || null : values, error: null };
  }
}

class FakeChannel {
  private readonly handlers = new Map<string, Array<(payload: unknown) => void>>();
  private statusHandler: ((status: string) => void) | undefined;

  on(_event: string, filter: { table: string }, handler: (payload: unknown) => void) {
    const current = this.handlers.get(filter.table) || [];
    current.push(handler);
    this.handlers.set(filter.table, current);
    return this;
  }

  subscribe(handler?: (status: string) => void) {
    this.statusHandler = handler;
    handler?.('SUBSCRIBED');
    return this;
  }

  emit(table: string, payload: unknown) {
    this.handlers.get(table)?.forEach(handler => handler(payload));
  }

  status(status: string) {
    this.statusHandler?.(status);
  }
}

function fakeSupabase(userId: string, seed: Record<string, FakeRow[]> = {}) {
  const rows = new Map(Object.entries(seed).map(([table, values]) => [table, values.map(copyRow)]));
  const calls: Array<{ table: string; method: string; value?: unknown }> = [];
  const channels: FakeChannel[] = [];
  let currentUserId = userId;
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: currentUserId } }, error: null }) },
    from(table: string) {
      return new FakeQuery(table, rows, calls);
    },
    channel() {
      const channel = new FakeChannel();
      channels.push(channel);
      return channel;
    },
    removeChannel() {
      return Promise.resolve('ok');
    },
  } as unknown as SupabaseClient;
  return { supabase, rows, calls, channels, setUserId: (nextUserId: string) => { currentUserId = nextUserId; } };
}

function localNote(userId: string, gameId: string, overrides: Partial<LocalNote> = {}): LocalNote {
  return {
    id: 'note-1',
    userId,
    gameId,
    body: '  preservar corpo e espaços  ',
    imageDataUrl: 'data:image/png;base64,AA==',
    createdAt: '2026-09-10T10:00:00.000Z',
    updatedAt: '2026-09-10T10:00:00.000Z',
    ...overrides,
  };
}

test('comentários constroem threads, perfis e reações pelo ciclo filtrado', async () => {
  const member = 'member';
  const fake = fakeSupabase(member, {
    club_comments: [
      { id: 'root', user_id: member, game_id: 'game-1', club_month: '2026-09', parent_id: null, body: 'raiz', created_at: '2026-09-10T10:00:00.000Z', updated_at: '2026-09-10T10:00:00.000Z' },
      { id: 'reply', user_id: 'other', game_id: 'game-1', club_month: '2026-09', parent_id: 'root', body: 'resposta', created_at: '2026-09-10T11:00:00.000Z', updated_at: '2026-09-10T11:00:00.000Z' },
      { id: 'wrong-month', user_id: 'other', game_id: 'game-1', club_month: '2026-08', parent_id: null, body: 'fora', created_at: '2026-09-10T09:00:00.000Z', updated_at: '2026-09-10T09:00:00.000Z' },
    ],
    comment_reactions: [
      { id: 'reaction-1', comment_id: 'root', user_id: 'other', game_id: 'game-1', club_month: '2026-09', emoji: '🔥', created_at: '2026-09-10T12:00:00.000Z' },
      { id: 'reaction-2', comment_id: 'root', user_id: member, game_id: 'game-1', club_month: '2026-09', emoji: '🔥', created_at: '2026-09-10T12:01:00.000Z' },
    ],
    profiles: [
      { id: member, name: 'Membro', avatar_url: null, avatar_crop: null },
      { id: 'other', name: 'Outro', avatar_url: null, avatar_crop: null },
    ],
  });
  const client = createCommentsClient({ supabase: fake.supabase });
  const comments = await client.read({ userId: member, isDemo: false, gameId: 'game-1', clubMonth: '2026-09' });
  assert.equal(comments.length, 1);
  assert.equal(comments[0]?.replies[0]?.body, 'resposta');
  assert.equal(comments[0]?.reactions[0]?.users.length, 2);
  assert.equal(comments[0]?.reactions[0]?.reactedByMe, true);
});

test('comentários rejeitam histórico, aplicam mutações próprias e deduplicam realtime', async () => {
  const fake = fakeSupabase('member', {
    club_comments: [],
    comment_reactions: [],
  });
  const client = createCommentsClient({ supabase: fake.supabase });
  await assert.rejects(
    client.create({ userId: 'member', isDemo: false, gameId: 'game-1', clubMonth: '2026-09', body: 'histórico', historical: true }),
    /somente leitura/i,
  );
  const created = await client.create({ userId: 'member', isDemo: false, gameId: 'game-1', clubMonth: '2026-09', body: ' comentário novo ' });
  assert.equal(created.body, 'comentário novo');
  const edited = await client.update({ userId: 'member', isDemo: false, gameId: 'game-1', clubMonth: '2026-09', commentId: created.id, body: ' comentário editado ', expectedUpdatedAt: created.updated_at });
  assert.equal(edited.body, 'comentário editado');
  await assert.rejects(
    client.update({ userId: 'member', isDemo: false, gameId: 'game-1', clubMonth: '2026-09', commentId: created.id, body: 'versão obsoleta', expectedUpdatedAt: created.updated_at }),
    /mudou/i,
  );
  await assert.rejects(
    client.remove({ userId: 'member', isDemo: false, gameId: 'game-1', clubMonth: '2026-09', commentId: created.id, expectedUpdatedAt: created.updated_at }),
    /mudou/i,
  );
  await client.setReaction({ userId: 'member', isDemo: false, gameId: 'game-1', clubMonth: '2026-09', commentId: created.id, emoji: '💜', enabled: true });
  await client.setReaction({ userId: 'member', isDemo: false, gameId: 'game-1', clubMonth: '2026-09', commentId: created.id, emoji: '💜', enabled: false });

  const events: CommentRealtimeEvent[] = [];
  const statuses: string[] = [];
  const unsubscribe = client.subscribe({
    userId: 'member', isDemo: false, gameId: 'game-1', clubMonth: '2026-09', onEvent: event => events.push(event), onStatus: status => statuses.push(status),
  });
  assert.deepEqual(statuses, ['SUBSCRIBED']);
  const payload = {
    eventType: 'INSERT',
    new: { id: created.id, user_id: 'member', game_id: 'game-1', club_month: '2026-09', parent_id: null, created_at: edited.created_at, updated_at: edited.updated_at },
    old: {},
  };
  fake.channels[0]?.emit('club_comments', payload);
  fake.channels[0]?.emit('club_comments', payload);
  assert.equal(events.length, 1);
  fake.channels[0]?.emit('club_comments', { eventType: 'DELETE', old: { id: created.id } });
  assert.equal(events.length, 2);
  fake.setUserId('other');
  await assert.rejects(
    client.read({ userId: 'member', isDemo: false, gameId: 'game-1', clubMonth: '2026-09' }),
    /autorizada/i,
  );
  unsubscribe();
  fake.channels[0]?.emit('club_comments', payload);
  assert.equal(events.length, 2);
});

test('notas preservam identidade, imagem e timestamps e leem snapshots sem escrever', async () => {
  const note = localNote('member', 'game-1');
  const fake = fakeSupabase('member', {
    game_notes: [{
      id: note.id, user_id: note.userId, game_id: note.gameId, body: note.body, image_data_url: note.imageDataUrl,
      created_at: note.createdAt, updated_at: note.updatedAt,
    }],
    cycle_note_snapshots: [{
      cycle_month: '2026-08', note_id: note.id, user_id: note.userId, game_id: note.gameId, body: note.body,
      image_data_url: note.imageDataUrl, created_at: note.createdAt, updated_at: note.updatedAt,
    }],
  });
  const client = createNotesClient({ supabase: fake.supabase });
  const current = await client.read({ userId: 'member', isDemo: false, gameId: 'game-1' });
  assert.deepEqual(current, [note]);
  const snapshot = await client.read({ userId: 'member', isDemo: false, gameId: 'game-1', snapshotMonth: '2026-08' });
  assert.deepEqual(snapshot, [note]);
  await assert.rejects(
    client.create({ userId: 'member', isDemo: false, note, historical: true }),
    /somente leitura/i,
  );
  assert.equal(fake.calls.some(call => call.method === 'insert'), false);
});

test('edição de nota usa compare-and-set e expõe a versão remota', async () => {
  const initial = localNote('member', 'game-1');
  const remote = localNote('member', 'game-1', { body: 'versão remota', updatedAt: '2026-09-10T11:00:00.000Z' });
  const fake = fakeSupabase('member', {
    game_notes: [{
      id: remote.id, user_id: remote.userId, game_id: remote.gameId, body: remote.body, image_data_url: remote.imageDataUrl,
      created_at: remote.createdAt, updated_at: remote.updatedAt,
    }],
  });
  const client = createNotesClient({ supabase: fake.supabase });
  await assert.rejects(
    client.update({ userId: 'member', isDemo: false, note: initial, expectedUpdatedAt: initial.updatedAt }),
    (error: unknown) => error instanceof NotesConflictError
      && error.kind === 'changed'
      && error.remote?.body === 'versão remota',
  );
  const update = localNote('member', 'game-1', { body: 'nova versão', updatedAt: remote.updatedAt });
  const updated = await client.update({ userId: 'member', isDemo: false, note: update, expectedUpdatedAt: remote.updatedAt });
  assert.equal(updated.body, 'nova versão');
  assert.equal(fake.calls.filter(call => call.method === 'update').length, 2);
  fake.rows.set('game_notes', []);
  await assert.rejects(
    client.remove({ userId: 'member', isDemo: false, gameId: 'game-1', noteId: initial.id, expectedUpdatedAt: update.updatedAt }),
    (error: unknown) => error instanceof NotesConflictError && error.kind === 'deleted' && error.remote === null,
  );
});

test('nota demo mantém estado por conta e apaga apenas após confirmação local', async () => {
  const client = createNotesClient({ demo: true });
  const note = localNote('demo-user', 'hades', { id: 'demo-note' });
  const created = await client.create({ userId: 'demo-user', isDemo: true, note });
  assert.deepEqual(await client.create({ userId: 'demo-user', isDemo: true, note }), created);
  assert.deepEqual(await client.read({ userId: 'demo-user', isDemo: true, gameId: 'hades' }), [note]);
  const updated = { ...created, body: 'editada', updatedAt: '2026-09-10T12:00:00.000Z' };
  await client.update({ userId: 'demo-user', isDemo: true, note: updated, expectedUpdatedAt: note.updatedAt });
  await client.remove({ userId: 'demo-user', isDemo: true, gameId: 'hades', noteId: note.id, expectedUpdatedAt: updated.updatedAt });
  assert.deepEqual(await client.read({ userId: 'demo-user', isDemo: true, gameId: 'hades' }), []);
});

type FixtureUser = { id: string; email: string; password: string };
type LocalConfig = { url: string; anonKey: string; serviceRoleKey: string; users: FixtureUser[] };

function loadLocalConfig(): LocalConfig | null {
  const directory = process.env.LOCAL_SUPABASE_TEST_CONFIG;
  if (!directory) return null;
  if (!isAbsolute(directory) || !statSync(directory).isDirectory()) throw new Error('LOCAL_SUPABASE_TEST_CONFIG inválido');
  const status = JSON.parse(readFileSync(join(directory, 'status.json'), 'utf8')) as Record<string, unknown>;
  const users = JSON.parse(readFileSync(join(directory, 'users.json'), 'utf8')) as FixtureUser[];
  if (typeof status.API_URL !== 'string' || typeof status.ANON_KEY !== 'string' || typeof status.SERVICE_ROLE_KEY !== 'string' || users.length < 2) return null;
  return { url: status.API_URL, anonKey: status.ANON_KEY, serviceRoleKey: status.SERVICE_ROLE_KEY, users };
}

function fixtureUser(config: LocalConfig, label: string) {
  const user = config.users.find(item => item.email.toLowerCase().includes(label));
  if (!user) throw new Error(`fixture ${label} ausente`);
  return user;
}

function authClient(config: LocalConfig, key: string, scope: string) {
  return createClient(config.url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false, storageKey: `ex06-private-${scope}-${randomUUID()}` },
  });
}

test('RLS mantém notas e snapshots privados durante troca de sessão', { skip: loadLocalConfig() ? false : 'SKIP: defina LOCAL_SUPABASE_TEST_CONFIG para a lane RLS', concurrency: false }, async () => {
  const config = loadLocalConfig();
  assert.ok(config);
  const memberFixture = fixtureUser(config, 'member');
  const otherFixture = fixtureUser(config, 'other');
  const memberSupabase = authClient(config, config.anonKey, 'member');
  const otherSupabase = authClient(config, config.anonKey, 'other');
  const service = authClient(config, config.serviceRoleKey, 'service');
  const memberAuth = await memberSupabase.auth.signInWithPassword({ email: memberFixture.email, password: memberFixture.password });
  const otherAuth = await otherSupabase.auth.signInWithPassword({ email: otherFixture.email, password: otherFixture.password });
  assert.equal(memberAuth.error, null);
  assert.equal(otherAuth.error, null);
  const gameId = '00000000-0000-4000-a000-000000000001';
  const noteId = randomUUID();
  const createdAt = new Date().toISOString();
  try {
    const noteClient = createNotesClient({ supabase: memberSupabase });
    const note = await noteClient.create({
      userId: memberFixture.id,
      isDemo: false,
      note: { id: noteId, userId: memberFixture.id, gameId, body: 'nota privada EX06', imageDataUrl: 'data:image/png;base64,AA==', createdAt, updatedAt: createdAt },
    });
    assert.deepEqual(await noteClient.create({ userId: memberFixture.id, isDemo: false, note }), note);
    await assert.rejects(noteClient.create({ userId: memberFixture.id, isDemo: false, note: { ...note, body: 'concurrent change' } }), NotesConflictError);
    const confirmed = await noteClient.read({ userId: memberFixture.id, isDemo: false, gameId });
    assert.equal(confirmed.filter(item => item.id === noteId).length, 1);
    assert.equal(confirmed.find(item => item.id === noteId)?.body, 'nota privada EX06');
    const otherClient = createNotesClient({ supabase: otherSupabase });
    const otherNotes = await otherClient.read({ userId: otherFixture.id, isDemo: false, gameId });
    assert.equal(otherNotes.some(item => item.id === note.id || item.body === note.body), false);

    const snapshot = await service.from('cycle_note_snapshots').insert({
      cycle_month: '2026-08', note_id: noteId, user_id: memberFixture.id, game_id: gameId, body: note.body,
      image_data_url: note.imageDataUrl, created_at: note.createdAt, updated_at: note.updatedAt,
    });
    assert.equal(snapshot.error, null);
    assert.equal((await noteClient.read({ userId: memberFixture.id, isDemo: false, gameId, snapshotMonth: '2026-08' })).length, 1);
    const otherSnapshots = await otherClient.read({ userId: otherFixture.id, isDemo: false, gameId, snapshotMonth: '2026-08' });
    assert.equal(otherSnapshots.some(item => item.id === note.id || item.body === note.body), false);

    const signedOut = await memberSupabase.auth.signOut({ scope: 'local' });
    assert.equal(signedOut.error, null);
    const switched = await memberSupabase.auth.signInWithPassword({ email: otherFixture.email, password: otherFixture.password });
    assert.equal(switched.error, null);
    await assert.rejects(
      noteClient.read({ userId: memberFixture.id, isDemo: false, gameId }),
      /autorizada/i,
    );
  } finally {
    await service.from('game_notes').delete().eq('id', noteId).eq('user_id', memberFixture.id);
    await service.from('cycle_note_snapshots').delete().eq('note_id', noteId);
    await Promise.all([
      memberSupabase.auth.signOut({ scope: 'local' }),
      otherSupabase.auth.signOut({ scope: 'local' }),
    ]);
  }
});
