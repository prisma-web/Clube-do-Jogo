import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { demoGames } from '@clube-do-jogo/domain/demo';
import { DataError, createDataClient } from './index';

const userId = 'demo-user';

test('demo profile updates normalize crop and preserve fields', async () => {
  const client = createDataClient();
  const before = await client.readProfile(userId, true);
  assert.ok(before);
  const updated = await client.updateProfile({
    userId,
    isDemo: true,
    patch: { name: '  Artur novo  ', avatar_url: ' https://example.test/avatar.jpg ', avatar_crop: { x: -10, y: 125, zoom: 4 } },
  });
  assert.equal(updated.name, 'Artur novo');
  assert.equal(updated.avatar_url, 'https://example.test/avatar.jpg');
  assert.deepEqual(updated.avatar_crop, { x: 0, y: 100, zoom: 2.5 });
  assert.equal(updated.email, before.email);
  assert.equal(updated.bio, before.bio);
  assert.equal((await client.readProfile(userId, true))?.avatar_crop?.zoom, 2.5);
});

test('profile updates reject unknown fields and malformed crops', async () => {
  const client = createDataClient();
  await assert.rejects(
    client.updateProfile({ userId, isDemo: true, patch: { email: 'other@example.test' } as never }),
    (error: unknown) => error instanceof DataError && /campo/i.test(error.message),
  );
  await assert.rejects(
    client.updateProfile({ userId, isDemo: true, patch: { avatar_crop: [] as never } }),
    (error: unknown) => error instanceof DataError && /enquadramento/i.test(error.message),
  );
});

test('real profile updates validate owner and write only the allowed patch', async () => {
  let updatePayload: unknown;
  const updatedProfile = { id: userId, name: 'Novo nome', email: 'kept@example.test', avatar_url: null, avatar_crop: null };
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    from(table: string) {
      assert.equal(table, 'profiles');
      const query = {
        update(payload: unknown) { updatePayload = payload; return query; },
        eq() { return query; },
        select() { return query; },
        single() { return Promise.resolve({ data: updatedProfile, error: null }); },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  const profile = await createDataClient({ supabase }).updateProfile({
    userId,
    isDemo: false,
    patch: { name: ' Novo nome ', avatar_crop: null },
  });
  assert.equal(profile, updatedProfile);
  assert.deepEqual(updatePayload, {
    name: 'Novo nome',
    avatar_crop: null,
    updated_at: (updatePayload as { updated_at?: unknown }).updated_at,
  });

  const wrongOwner = {
    auth: { getUser: async () => ({ data: { user: { id: 'other-user' } }, error: null }) },
    from() { throw new Error('from should not be called when owner validation fails'); },
  } as unknown as SupabaseClient;
  await assert.rejects(
    createDataClient({ supabase: wrongOwner }).updateProfile({ userId, isDemo: false, patch: { name: 'x' } }),
    /autorizada/i,
  );
});

test('demo platforms support search, add, and remove with immediate reads', async () => {
  const client = createDataClient();
  const found = await client.searchPlatforms({ userId, isDemo: true, query: 'PlayStation' });
  assert.equal(found[0]?.igdb_platform_id, 167);
  await client.setUserPlatform({
    userId,
    isDemo: true,
    platform: { igdb_platform_id: 167, name: 'PlayStation 5', abbreviation: 'PS5', logo_url: null },
  });
  assert.equal((await client.readUserPlatforms(userId, true)).some(platform => platform.igdb_platform_id === 167), true);
  await client.removeUserPlatform({ userId, isDemo: true, igdbPlatformId: 167 });
  assert.equal((await client.readUserPlatforms(userId, true)).some(platform => platform.igdb_platform_id === 167), false);
});

test('real platform writes use RLS-compatible insert/delete and tolerate duplicate insert', async () => {
  const calls: string[] = [];
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    from(table: string) {
      calls.push(table);
      const query = {
        insert() { calls.push('insert'); return Promise.resolve({ data: null, error: { code: '23505' } }); },
        delete() { calls.push('delete'); return query; },
        eq() { calls.push('eq'); return query; },
        then(resolve: (value: { data: never[]; error: null }) => unknown) {
          return Promise.resolve(resolve({ data: [], error: null }));
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  const client = createDataClient({ supabase });
  await client.setUserPlatform({ userId, isDemo: false, platform: { igdb_platform_id: 6, name: ' PC ' } });
  await client.removeUserPlatform({ userId, isDemo: false, igdbPlatformId: 6 });
  assert.deepEqual(calls, ['user_platforms', 'insert', 'user_platforms', 'delete', 'eq', 'eq']);
});

test('real media requests use the existing API routes and preserve their payloads', async () => {
  const calls: Array<{ path: string; method?: string }> = [];
  const api = {
    request: async (path: string, init?: RequestInit) => {
      calls.push({ path, method: init?.method });
      if (path.endsWith('/media')) return { ok: true, json: async () => ({ ...demoGames[0], screenshot_urls: ['https://example.test/screenshot.jpg'] }) } as Response;
      return { ok: true, json: async () => ({ mugshots: [{ id: 44, name: 'Zagreus', image_url: ' https://example.test/zagreus.jpg ' }] }) } as Response;
    },
  };
  const client = createDataClient({ api });
  const media = await client.readGameMedia({ userId, isDemo: false, gameId: 'game/with-slash' });
  const mugshots = await client.readGameMugshots({ userId, isDemo: false, gameId: 'game/with-slash' });
  assert.equal(media?.screenshot_urls?.[0], 'https://example.test/screenshot.jpg');
  assert.deepEqual(mugshots, [{ id: 44, name: 'Zagreus', image_url: 'https://example.test/zagreus.jpg' }]);
  assert.deepEqual(calls, [
    { path: '/api/games/game%2Fwith-slash/media', method: 'POST' },
    { path: '/api/games/game%2Fwith-slash/mugshots', method: 'GET' },
  ]);
});

test('demo media keeps game fields and has no invented mugshots', async () => {
  const client = createDataClient();
  const media = await client.readGameMedia({ userId, isDemo: true, gameId: demoGames[0].id });
  assert.equal(media?.trailer_url, demoGames[0].trailer_url);
  assert.deepEqual(await client.readGameMugshots({ userId, isDemo: true, gameId: demoGames[0].id }), []);
});
