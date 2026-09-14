import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createRewardsClient, type RewardRealtimeEvent } from '@clube-do-jogo/data';

type Row = Record<string, unknown>;

class FakeQuery implements PromiseLike<{ data: unknown; error: null }> {
  private filters: Array<[string, unknown]> = [];
  private selected = false;

  constructor(private readonly rows: Row[], private readonly table: string, private readonly selections: string[]) {}

  select(selection: string) {
    this.selected = true;
    this.selections.push(selection);
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }

  order() {
    return this;
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const values = this.rows.filter(row => this.filters.every(([column, value]) => row[column] === value));
    const data = this.selected || this.table === 'user_reward_grants' ? values.map(value => ({ ...value })) : null;
    return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
  }
}

class FakeChannel {
  private handler: ((payload: unknown) => void) | undefined;
  private statusHandler: ((status: string) => void) | undefined;

  on(_event: string, _filter: unknown, handler: (payload: unknown) => void) {
    this.handler = handler;
    return this;
  }

  subscribe(handler?: (status: string) => void) {
    this.statusHandler = handler;
    handler?.('SUBSCRIBED');
    return this;
  }

  emit(payload: unknown) {
    this.handler?.(payload);
  }

  status(value: string) {
    this.statusHandler?.(value);
  }
}

function fakeSupabase(userId: string, rows: Row[]) {
  let currentUserId = userId;
  const selections: string[] = [];
  const rpcCalls: Array<{ name: string; args: unknown }> = [];
  const channels: FakeChannel[] = [];
  let removedChannels = 0;
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: currentUserId } }, error: null }) },
    from: () => new FakeQuery(rows, 'user_reward_grants', selections),
    rpc: async (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      return { data: null, error: null };
    },
    channel: () => {
      const channel = new FakeChannel();
      channels.push(channel);
      return channel;
    },
    removeChannel: async () => {
      removedChannels += 1;
      return 'ok';
    },
  } as unknown as SupabaseClient;
  return {
    supabase,
    selections,
    rpcCalls,
    channels,
    get removedChannels() { return removedChannels; },
    setUserId: (value: string) => { currentUserId = value; },
  };
}

function rawGrant(overrides: Row = {}): Row {
  return {
    id: 'grant-ori',
    reward_id: 'reward-ori',
    granted_at: '2026-09-10T10:00:00.000Z',
    seen_at: null,
    user_id: 'member',
    reward: {
      id: 'reward-ori',
      club_month: '2026-07',
      code: '2026-07-theme-ori',
      kind: 'theme',
      name: 'Tema Floresta de Nibel',
      description: 'Descrição',
      theme_id: 'ori',
      image_url: null,
      eligibility: 'finished',
      cycle: { month: '2026-07', game: { title: 'Hades', image_url: 'cover' } },
    },
    ...overrides,
  };
}

test('reads grants with nested reward metadata and keeps the server eligibility', async () => {
  const fake = fakeSupabase('member', [rawGrant()]);
  const client = createRewardsClient({ supabase: fake.supabase });
  const grants = await client.read({ userId: 'member', isDemo: false });
  assert.equal(grants.length, 1);
  assert.equal(grants[0]?.reward.theme_id, 'ori');
  assert.equal(grants[0]?.reward.eligibility, 'finished');
  assert.equal(grants[0]?.reward.cycle?.game?.title, 'Hades');
  assert.match(fake.selections[0] || '', /eligibility/);
});

test('acknowledge sends only the idempotent server RPC on every repeat', async () => {
  const fake = fakeSupabase('member', [rawGrant()]);
  const client = createRewardsClient({ supabase: fake.supabase });
  await client.acknowledge({ userId: 'member', isDemo: false, grantId: 'grant-ori' });
  await client.acknowledge({ userId: 'member', isDemo: false, grantId: 'grant-ori' });
  assert.deepEqual(fake.rpcCalls, [
    { name: 'acknowledge_reward_grant', args: { target_grant_id: 'grant-ori' } },
    { name: 'acknowledge_reward_grant', args: { target_grant_id: 'grant-ori' } },
  ]);
  fake.setUserId('other');
  await assert.rejects(client.acknowledge({ userId: 'member', isDemo: false, grantId: 'grant-ori' }), /autorizada/i);
});

test('realtime is scoped, deduplicated and cleaned up', () => {
  const fake = fakeSupabase('member', [rawGrant()]);
  const client = createRewardsClient({ supabase: fake.supabase });
  const events: RewardRealtimeEvent[] = [];
  const statuses: string[] = [];
  const unsubscribe = client.subscribe({
    userId: 'member',
    isDemo: false,
    onEvent: event => events.push(event),
    onStatus: status => statuses.push(status),
  });
  assert.deepEqual(statuses, ['SUBSCRIBED']);
  const payload = { eventType: 'INSERT', new: { id: 'grant-ori', user_id: 'member', granted_at: '2026-09-10T10:00:00.000Z' }, old: {} };
  fake.channels[0]?.emit(payload);
  fake.channels[0]?.emit(payload);
  fake.channels[0]?.emit({ eventType: 'INSERT', new: { id: 'other', user_id: 'other' }, old: {} });
  assert.equal(events.length, 1);
  unsubscribe();
  fake.channels[0]?.emit(payload);
  assert.equal(events.length, 1);
  assert.equal(fake.removedChannels, 1);
});

test('demo grants derive from the demo cycle and seen state remains account scoped', async () => {
  const client = createRewardsClient({ demo: true });
  const initial = await client.read({ userId: 'demo-user', isDemo: true });
  assert.equal(initial[0]?.reward.theme_id, 'ori');
  await client.acknowledge({ userId: 'demo-user', isDemo: true, grantId: 'demo-ori-reward' });
  assert.ok((await client.read({ userId: 'demo-user', isDemo: true }))[0]?.seen_at);
  assert.deepEqual(await client.read({ userId: 'luiza', isDemo: true }), []);
  await assert.rejects(client.acknowledge({ userId: 'luiza', isDemo: true, grantId: 'demo-ori-reward' }), /não encontrada/i);
});


test('reward consumers share a channel and release it only after the last unsubscribe', () => {
  const backend = fakeSupabase('member', []);
  const firstEvents: RewardRealtimeEvent[] = [];
  const secondEvents: RewardRealtimeEvent[] = [];
  const first = createRewardsClient({ supabase: backend.supabase });
  const second = createRewardsClient({ supabase: backend.supabase });
  const stopFirst = first.subscribe({ userId: 'member', isDemo: false, onEvent: event => firstEvents.push(event) });
  const stopSecond = second.subscribe({ userId: 'member', isDemo: false, onEvent: event => secondEvents.push(event) });
  assert.equal(backend.channels.length, 1);
  backend.channels[0].emit({ eventType: 'INSERT', new: { id: 'grant-1', user_id: 'member' }, old: {} });
  assert.equal(firstEvents.length, 1);
  assert.equal(secondEvents.length, 1);
  stopFirst();
  assert.equal(backend.removedChannels, 0);
  backend.channels[0].emit({ eventType: 'INSERT', new: { id: 'grant-2', user_id: 'member' }, old: {} });
  assert.equal(firstEvents.length, 1);
  assert.equal(secondEvents.length, 2);
  stopSecond();
  stopSecond();
  assert.equal(backend.removedChannels, 1);
  const stopThird = first.subscribe({ userId: 'member', isDemo: false, onEvent: event => firstEvents.push(event) });
  assert.equal(backend.channels.length, 2);
  stopThird();
  assert.equal(backend.removedChannels, 2);
});
