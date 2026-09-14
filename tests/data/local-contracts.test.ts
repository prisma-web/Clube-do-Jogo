import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { after, before, test } from 'node:test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type FixtureUser = { id: string; email: string; password: string };
type LocalConfig = { url: string; anonKey: string; serviceRoleKey: string; users: FixtureUser[]; nextUrl?: string };
type Account = { fixture: FixtureUser; client: SupabaseClient; id: string };
type Accounts = { member: Account; other: Account; admin: Account };
type DataClient = {
  readCycles(isDemo: boolean): Promise<{ activeMonth: string; months: string[] }>;
  readProfile(profileId: string, isDemo: boolean): Promise<{ id: string } | null>;
  readGame(input: { userId: string; isDemo: boolean; gameId: string }): Promise<{ id: string } | null>;
  readGameOfMonth(input: { userId: string; isDemo: boolean; month: string }): Promise<{ id: string } | null>;
  setVote(input: { userId: string; isDemo: boolean; month: string; historical?: boolean; gameId: string; choice: 'would_play' | 'would_not_play' | null; reason?: 'other'; reasonText?: string }): Promise<void>;
  setProgress(input: { userId: string; isDemo: boolean; gameId: string; status: 'started' | 'finished' }): Promise<void>;
};
type DataModule = { createDataClient(options: { supabase: SupabaseClient }): DataClient; DataError: new (...args: never[]) => Error };

const fixtureGameIds = [
  '00000000-0000-4000-a000-000000000001',
  '00000000-0000-4000-a000-000000000002',
  '00000000-0000-4000-a000-000000000003',
  '00000000-0000-4000-a000-000000000004',
] as const;
const fixtureCycleMonths = ['2026-08', '2026-09'] as const;
const activeCycleMonth = '2026-09';
const testGameId = randomUUID();
const testVoteMonth = '2026-10';
const localSkip = 'SKIP: defina LOCAL_SUPABASE_TEST_CONFIG ou TEST_SUPABASE_* para habilitar o contrato local';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function localUrl(value: string, label: string, port: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} inválida`);
  }
  if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || parsed.port !== port || parsed.username || parsed.password) {
    throw new Error(`${label} deve apontar somente para http://127.0.0.1:${port}`);
  }
  return parsed.origin;
}

function fixtureUsers(value: unknown): FixtureUser[] {
  if (!Array.isArray(value)) throw new Error('users.json deve conter uma lista');
  const users = value.filter((item): item is FixtureUser => {
    if (!item || typeof item !== 'object') return false;
    const candidate = item as Record<string, unknown>;
    return typeof candidate.id === 'string' && typeof candidate.email === 'string' && typeof candidate.password === 'string';
  });
  if (users.length < 3) throw new Error('users.json precisa conter member, other e admin');
  for (const label of ['member', 'other', 'admin']) {
    if (!users.some(user => user.email.toLowerCase().includes(label))) throw new Error(`users.json sem conta ${label}`);
  }
  return users;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} ausente`);
  return value;
}

function loadConfig(): LocalConfig | null {
  const configDir = process.env.LOCAL_SUPABASE_TEST_CONFIG;
  const envUrl = process.env.TEST_SUPABASE_URL || process.env.TEST_SUPABASE_API_URL;
  if (!configDir && !envUrl) return null;

  if (configDir) {
    if (!isAbsolute(configDir)) throw new Error('LOCAL_SUPABASE_TEST_CONFIG deve ser um diretório absoluto');
    if (!statSync(configDir).isDirectory()) throw new Error('LOCAL_SUPABASE_TEST_CONFIG deve ser um diretório');
    const status = readJson(join(configDir, 'status.json')) as Record<string, unknown>;
    return {
      url: localUrl(requiredString(status.API_URL, 'status.API_URL'), 'status.API_URL', '55421'),
      anonKey: requiredString(status.ANON_KEY, 'status.ANON_KEY'),
      serviceRoleKey: requiredString(status.SERVICE_ROLE_KEY, 'status.SERVICE_ROLE_KEY'),
      users: fixtureUsers(readJson(join(configDir, 'users.json'))),
      nextUrl: process.env.LOCAL_NEXT_API_URL || process.env.TEST_NEXT_API_URL,
    };
  }

  const usersFile = process.env.TEST_SUPABASE_USERS_FILE;
  const usersJson = process.env.TEST_SUPABASE_USERS_JSON;
  if (!usersFile && !usersJson) throw new Error('TEST_SUPABASE_USERS_FILE ou TEST_SUPABASE_USERS_JSON é obrigatório');
  if (usersFile && !isAbsolute(usersFile)) throw new Error('TEST_SUPABASE_USERS_FILE deve ser absoluto');
  const users = fixtureUsers(usersFile ? readJson(usersFile) : JSON.parse(usersJson as string) as unknown);
  return {
    url: localUrl(requiredString(envUrl, 'TEST_SUPABASE_URL'), 'TEST_SUPABASE_URL', '55421'),
    anonKey: requiredString(process.env.TEST_SUPABASE_ANON_KEY, 'TEST_SUPABASE_ANON_KEY'),
    serviceRoleKey: requiredString(process.env.TEST_SUPABASE_SERVICE_ROLE_KEY, 'TEST_SUPABASE_SERVICE_ROLE_KEY'),
    users,
    nextUrl: process.env.LOCAL_NEXT_API_URL || process.env.TEST_NEXT_API_URL,
  };
}

function nextUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return localUrl(value, 'LOCAL_NEXT_API_URL', '3101');
}

function userByLabel(users: FixtureUser[], label: string): FixtureUser {
  const user = users.find(item => item.email.toLowerCase().includes(label));
  if (!user) throw new Error(`conta ${label} ausente`);
  return user;
}

function makeClient(config: LocalConfig, key: string, scope: string): SupabaseClient {
  return createClient(config.url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
      storageKey: `ex03-local-contract-${scope}-${randomUUID()}`,
    },
  });
}

function errorMessage(error: { message?: string } | null): string {
  return error?.message || 'erro não informado';
}

function noError<T>(response: { data: T; error: { message?: string } | null }, label: string): T {
  assert.equal(response.error, null, `${label}: ${errorMessage(response.error)}`);
  return response.data;
}

function rejected(response: { data: unknown; error: { message?: string } | null }, label: string): void {
  assert.ok(response.error, `${label} deveria ser rejeitado por RLS ou constraint`);
}

function previousMonth(month: string): string {
  const [year, rawMonth] = month.split('-').map(Number);
  const previous = rawMonth === 1 ? 12 : rawMonth - 1;
  return `${rawMonth === 1 ? year - 1 : year}-${String(previous).padStart(2, '0')}`;
}

function now(): string {
  return new Date().toISOString();
}

const config = loadConfig();
const configuredNextUrl = nextUrl(config?.nextUrl);
let accounts: Accounts | undefined;
let service: SupabaseClient | undefined;
let setupError: Error | undefined;
let dataModule: DataModule | undefined;

async function realDataClient(supabase: SupabaseClient): Promise<DataClient> {
  dataModule ||= await import('@clube-do-jogo/data') as unknown as DataModule;
  return dataModule.createDataClient({ supabase });
}

async function signIn(configValue: LocalConfig, fixture: FixtureUser, scope: string): Promise<Account> {
  const client = makeClient(configValue, configValue.anonKey, scope);
  const { data, error } = await client.auth.signInWithPassword({ email: fixture.email, password: fixture.password });
  if (error || !data.user) throw new Error(`login ${scope}: ${errorMessage(error)}`);
  if (data.user.id !== fixture.id) throw new Error(`id de ${scope} divergente do fixture`);
  return { fixture, client, id: data.user.id };
}

async function freshAccount(label: keyof Accounts): Promise<Account> {
  const current = readyAccounts();
  assert.ok(config, 'configuração local ausente');
  return signIn(config, current[label].fixture, `${label}-${randomUUID()}`);
}

function readyAccounts(): Accounts {
  assert.ok(accounts, `ambiente local não preparado${setupError ? `: ${setupError.message}` : ''}`);
  return accounts as Accounts;
}

async function readyOwnData(): Promise<{ accounts: Accounts; service: SupabaseClient }> {
  readyAccounts();
  assert.equal(setupError, undefined, `fixtures próprios não preparados: ${setupError?.message || 'erro desconhecido'}`);
  assert.ok(service, 'cliente service_role não preparado');
  return {
    accounts: {
      member: await freshAccount('member'),
      other: await freshAccount('other'),
      admin: await freshAccount('admin'),
    },
    service: service as SupabaseClient,
  };
}

before(async () => {
  if (!config) return;
  try {
    const member = await signIn(config, userByLabel(config.users, 'member'), 'member');
    const other = await signIn(config, userByLabel(config.users, 'other'), 'other');
    const admin = await signIn(config, userByLabel(config.users, 'admin'), 'admin');
    accounts = { member, other, admin };
    service = makeClient(config, config.serviceRoleKey, 'service');
    const timestamp = now();
    const game = noError(await service.from('games').insert({
      id: testGameId,
      title: `EX03 local contract ${testGameId}`,
      duration_hours: 1,
      average_rating: 50,
      release_year: 2026,
      created_at: timestamp,
      screenshot_urls: [],
      genres: [],
      platforms: [],
      platform_ids: [],
    }).select('id').single(), 'criação do jogo próprio');
    assert.equal(game.id, testGameId);
  } catch (error) {
    setupError = error instanceof Error ? error : new Error(String(error));
  }
});

after(async () => {
  if (!config) return;
  if (accounts) {
    await accounts.member.client.from('votes').delete().eq('user_id', accounts.member.id).eq('game_id', testGameId);
    await accounts.member.client.from('game_progress').delete().eq('user_id', accounts.member.id).eq('game_id', testGameId);
    await accounts.member.client.from('game_notes').delete().eq('user_id', accounts.member.id).eq('game_id', testGameId);
  }
  if (service) {
    await service.from('votes').delete().eq('game_id', testGameId);
    await service.from('game_progress').delete().eq('game_id', testGameId);
    await service.from('game_notes').delete().eq('game_id', testGameId);
    await service.from('games').delete().eq('id', testGameId);
  }
  if (accounts) {
    await Promise.all([
      accounts.member.client.auth.signOut({ scope: 'local' }),
      accounts.other.client.auth.signOut({ scope: 'local' }),
      accounts.admin.client.auth.signOut({ scope: 'local' }),
    ]);
  }
});

test('autenticação mantém sessão e troca de contas', { skip: config ? false : localSkip, concurrency: false }, async () => {
  const member = await freshAccount('member');
  const other = await freshAccount('other');
  const initial = await member.client.auth.getSession();
  noError(initial, 'sessão member');
  assert.equal(initial.data.session?.user.id, member.id);

  noError(await member.client.auth.signOut({ scope: 'local' }), 'saída member');
  const switched = await member.client.auth.signInWithPassword({ email: other.fixture.email, password: other.fixture.password });
  noError(switched, 'troca para other');
  assert.equal(switched.data.user?.id, other.id);
  const otherSession = noError(await member.client.auth.getSession(), 'sessão other');
  assert.equal(otherSession.session?.user.id, other.id);

  noError(await member.client.auth.signOut({ scope: 'local' }), 'saída other');
  const restored = await member.client.auth.signInWithPassword({ email: member.fixture.email, password: member.fixture.password });
  noError(restored, 'retorno para member');
  assert.equal(restored.data.user?.id, member.id);
});

test('conta autenticada lê perfis, jogos, ciclos e voto do mês 10', { skip: config ? false : localSkip, concurrency: false }, async () => {
  const member = await freshAccount('member');
  const other = await freshAccount('other');
  const admin = await freshAccount('admin');
  const profileRows = noError(await member.client.from('profiles').select('id').in('id', [member.id, other.id, admin.id]), 'leitura dos perfis');
  assert.deepEqual(new Set(profileRows.map(row => row.id)), new Set([member.id, other.id, admin.id]));

  const gameRows = noError(await member.client.from('games').select('id,title').in('id', [...fixtureGameIds]), 'leitura dos jogos');
  assert.deepEqual(new Set(gameRows.map(row => row.id)), new Set(fixtureGameIds));

  const cycles = noError(await member.client.from('club_months').select('month,game_id,status').in('month', [...fixtureCycleMonths]), 'leitura dos ciclos');
  const cycleByMonth = new Map(cycles.map(row => [row.month, row]));
  assert.equal(cycleByMonth.get('2026-08')?.status, 'closed');
  assert.equal(cycleByMonth.get('2026-08')?.game_id, fixtureGameIds[2]);
  assert.equal(cycleByMonth.get('2026-09')?.status, 'active');
  assert.equal(cycleByMonth.get('2026-09')?.game_id, fixtureGameIds[0]);

  const seededVote = noError(await member.client.from('votes').select('user_id,game_id,vote_month,choice').eq('vote_month', '2026-10').eq('game_id', fixtureGameIds[1]), 'leitura dos votos de outubro');
  assert.ok(seededVote.some(row => row.user_id === other.id && row.choice === 'would_play'));
  const roles = noError(await member.client.from('user_roles').select('user_id,role').eq('user_id', admin.id).maybeSingle(), 'leitura do papel admin');
  assert.equal(roles?.role, 'admin');

  const dataClient = await realDataClient(member.client);
  const cycleState = await dataClient.readCycles(false);
  assert.equal(cycleState.activeMonth, activeCycleMonth);
  assert.deepEqual(cycleState.months.slice(0, 2), ['2026-09', '2026-08']);
  assert.equal((await dataClient.readProfile(member.id, false))?.id, member.id);
  assert.equal((await dataClient.readGame({ userId: member.id, isDemo: false, gameId: fixtureGameIds[0] }))?.id, fixtureGameIds[0]);
  assert.equal((await dataClient.readGameOfMonth({ userId: member.id, isDemo: false, month: activeCycleMonth }))?.id, fixtureGameIds[0]);
});

test('voto permite primeiro, troca e remoção e rejeita outro mês', { skip: config ? false : localSkip, concurrency: false }, async () => {
  const { accounts: current } = await readyOwnData();
  const { member } = current;
  const dataClient = await realDataClient(member.client);
  await dataClient.setVote({ userId: member.id, isDemo: false, month: activeCycleMonth, gameId: testGameId, choice: 'would_play' });
  const first = noError(await member.client.from('votes').select('choice').eq('user_id', member.id).eq('game_id', testGameId).eq('vote_month', testVoteMonth).single(), 'primeiro voto');
  assert.equal(first.choice, 'would_play');

  await dataClient.setVote({ userId: member.id, isDemo: false, month: activeCycleMonth, gameId: testGameId, choice: 'would_not_play', reason: 'other', reasonText: 'contrato local' });
  const changed = noError(await member.client.from('votes').select('choice,reason').eq('user_id', member.id).eq('game_id', testGameId).eq('vote_month', testVoteMonth).single(), 'troca de voto');
  assert.equal(changed.choice, 'would_not_play');
  assert.equal(changed.reason, 'other');

  const otherMonth = await member.client.from('votes').insert({
    user_id: member.id,
    game_id: testGameId,
    vote_month: previousMonth(testVoteMonth),
    choice: 'would_play',
  });
  rejected(otherMonth, 'voto fora do mês ativo');

  await assert.rejects(
    dataClient.setVote({ userId: member.id, isDemo: false, month: activeCycleMonth, historical: true, gameId: testGameId, choice: 'would_play' }),
    (error: unknown) => Boolean(dataModule?.DataError && error instanceof dataModule.DataError && /somente leitura/i.test(error.message)),
  );
  await dataClient.setVote({ userId: member.id, isDemo: false, month: activeCycleMonth, gameId: testGameId, choice: null });
  const afterRemoval = await member.client.from('votes').select('id').eq('user_id', member.id).eq('game_id', testGameId).eq('vote_month', testVoteMonth);
  noError(afterRemoval, 'remoção do voto');
  const removed = noError(await member.client.from('votes').select('id').eq('user_id', member.id).eq('game_id', testGameId).eq('vote_month', testVoteMonth).maybeSingle(), 'confirmação da remoção');
  assert.equal(removed, null);
});

test('progresso persiste limites 0 e 10 e rejeita fora da faixa', { skip: config ? false : localSkip, concurrency: false }, async () => {
  const { accounts: current } = await readyOwnData();
  const { member } = current;
  const dataClient = await realDataClient(member.client);
  await member.client.from('game_progress').delete().eq('user_id', member.id).eq('game_id', testGameId);
  const startedAt = now();
  await dataClient.setProgress({ userId: member.id, isDemo: false, gameId: testGameId, status: 'started' });
  const started = noError(await member.client.from('game_progress').update({ rating: 0, updated_at: startedAt }).eq('user_id', member.id).eq('game_id', testGameId).select('status,rating,started_at,finished_at').single(), 'progresso com nota zero');
  assert.equal(started.status, 'started');
  assert.equal(Number(started.rating), 0);
  assert.equal(started.finished_at, null);

  const finishedAt = now();
  await dataClient.setProgress({ userId: member.id, isDemo: false, gameId: testGameId, status: 'finished' });
  const finished = noError(await member.client.from('game_progress').update({ rating: 10, finished_at: finishedAt, updated_at: finishedAt }).eq('user_id', member.id).eq('game_id', testGameId).select('status,rating,finished_at').single(), 'progresso com nota dez');
  assert.equal(finished.status, 'finished');
  assert.equal(Number(finished.rating), 10);

  rejected(await member.client.from('game_progress').update({ rating: -0.01 }).eq('user_id', member.id).eq('game_id', testGameId), 'nota abaixo de zero');
  rejected(await member.client.from('game_progress').update({ rating: 10.01 }).eq('user_id', member.id).eq('game_id', testGameId), 'nota acima de dez');

  const fresh = makeClient(config as LocalConfig, (config as LocalConfig).anonKey, 'fresh-read');
  const signed = await fresh.auth.signInWithPassword({ email: member.fixture.email, password: member.fixture.password });
  noError(signed, 'login para leitura permanente');
  const persisted = noError(await fresh.from('game_progress').select('status,rating').eq('user_id', member.id).eq('game_id', testGameId).single(), 'leitura permanente do progresso');
  assert.equal(persisted.status, 'finished');
  assert.equal(Number(persisted.rating), 10);
  await fresh.auth.signOut({ scope: 'local' });
});

test('RLS limita escrita à conta e oculta notas alheias', { skip: config ? false : localSkip, concurrency: false }, async () => {
  const { accounts: current } = await readyOwnData();
  const { member, other } = current;
  const timestamp = now();
  const noteId = randomUUID();
  noError(await member.client.from('game_notes').insert({
    id: noteId,
    user_id: member.id,
    game_id: testGameId,
    body: 'EX03 local note',
    image_data_url: null,
    created_at: timestamp,
    updated_at: timestamp,
  }).select('id').single(), 'criação de nota própria');

  const hidden = noError(await other.client.from('game_notes').select('id').eq('id', noteId), 'leitura da nota por outra conta');
  assert.equal(hidden.length, 0);
  rejected(await other.client.from('game_notes').insert({
    id: randomUUID(),
    user_id: member.id,
    game_id: testGameId,
    body: 'RLS should reject',
    image_data_url: null,
    created_at: timestamp,
    updated_at: timestamp,
  }), 'criação de nota em outra conta');

  const dataClient = await realDataClient(member.client);
  await member.client.from('game_progress').delete().eq('user_id', member.id).eq('game_id', testGameId);
  await dataClient.setProgress({ userId: member.id, isDemo: false, gameId: testGameId, status: 'started' });
  const foreignProgress = await other.client.from('game_progress').update({ rating: 9 }).eq('user_id', member.id).eq('game_id', testGameId).select('rating');
  if (foreignProgress.error) rejected(foreignProgress, 'alteração de progresso de outra conta');
  else assert.equal(foreignProgress.data?.length, 0, 'outra conta não deve obter linha de progresso');
  const unchanged = noError(await member.client.from('game_progress').select('rating').eq('user_id', member.id).eq('game_id', testGameId).single(), 'confirmação do progresso protegido');
  assert.equal(unchanged.rating, null);

  rejected(await other.client.from('votes').insert({
    user_id: member.id,
    game_id: testGameId,
    vote_month: testVoteMonth,
    choice: 'would_play',
  }), 'criação de voto de outra conta');
  noError(await member.client.from('game_notes').delete().eq('id', noteId).eq('user_id', member.id), 'limpeza da nota própria');
});

test('API Next rejeita anônimo e bearer inválido', { skip: config && configuredNextUrl ? false : 'SKIP: defina LOCAL_NEXT_API_URL=http://127.0.0.1:3101 para testar a API local', concurrency: false }, async () => {
  readyAccounts();
  const anonymous = await fetch(`${configuredNextUrl}/api/discover?source=friends&limit=1`);
  assert.equal(anonymous.status, 401);

  const invalidBearer = await fetch(`${configuredNextUrl}/api/discover?source=friends&limit=1`, {
    headers: { Authorization: 'Bearer invalid-local-contract-token' },
  });
  assert.equal(invalidBearer.status, 401);

});
