import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthCallbackClient } from '../../apps/mobile/src/platform/auth';

const publicEnvironment = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_API_BASE_URL',
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_RANKING_FORMULA',
] as const;
const savedEnvironment = new Map(publicEnvironment.map(key => [key, process.env[key]]));

process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://supabase.example.test/';
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'publishable-test-key';
process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test';
delete process.env.EXPO_PUBLIC_API_URL;
delete process.env.EXPO_PUBLIC_RANKING_FORMULA;

const modulesPromise = (async () => {
  try {
    const [authModule, apiModule, configModule, storageModule] = await Promise.all([
      import('../../apps/mobile/src/platform/auth'),
      import('../../apps/mobile/src/platform/api'),
      import('../../apps/mobile/src/platform/config'),
      import('../../apps/mobile/src/platform/storage'),
    ]);
    return { authModule, apiModule, configModule, storageModule };
  } finally {
    for (const key of publicEnvironment) {
      const value = savedEnvironment.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
})();

function callbackClient(exchangeCodeForSession: (code: string) => Promise<{ error: Error | null }>): AuthCallbackClient {
  return {
    auth: {
      exchangeCodeForSession: async code => {
        const result = await exchangeCodeForSession(code);
        const user = result.error ? null : { id: 'callback-user' };
        return { data: { session: user ? { user } : null, user, redirectType: null }, error: result.error };
      },
    },
  } as unknown as AuthCallbackClient;
}

function callbackSessionClient(userId: string): AuthCallbackClient {
  return {
    auth: {
      exchangeCodeForSession: async () => ({
        data: { session: { user: { id: userId } }, user: { id: userId }, redirectType: null },
        error: null,
      }),
    },
  } as unknown as AuthCallbackClient;
}

function sessionClient(session: { access_token: string } | null, error: Error | null = null): SupabaseClient {
  return {
    auth: {
      getSession: async () => ({ data: { session }, error }),
    },
  } as unknown as SupabaseClient;
}

afterEach(() => {
  return modulesPromise.then(({ authModule }) => authModule.resetAuthCallbacksForTests());
});

test('callback PKCE troca uma vez e compartilha a promessa concorrente', async () => {
  const { authModule } = await modulesPromise;
  let calls = 0;
  let release!: (value: { error: null }) => void;
  const exchange = new Promise<{ error: null }>(resolve => {
    release = resolve;
  });
  const client = callbackClient(async code => {
    calls += 1;
    assert.equal(code, 'concurrent-code');
    return exchange;
  });
  const url = 'clubedojogo://auth/callback?code=concurrent-code';

  const first = authModule.completeAuthCallback(url, client);
  const second = authModule.completeAuthCallback(url, client);
  assert.equal(calls, 1);
  release({ error: null });
  assert.deepEqual(await Promise.all([first, second]), [
    { userId: 'callback-user' },
    { userId: 'callback-user' },
  ]);

  assert.deepEqual(await authModule.completeAuthCallback(url, client), { userId: 'callback-user' });
  assert.equal(calls, 1);
});

test('callback PKCE devolve a identidade confirmada para sessão warm', async () => {
  const { authModule } = await modulesPromise;

  const result = await authModule.completeAuthCallback(
    'clubedojogo://auth/callback?code=warm-session-code',
    callbackSessionClient('warm-user'),
  );

  assert.deepEqual(result, { userId: 'warm-user' });
});

test('callback PKCE permite nova tentativa depois de erro de troca', async () => {
  const { authModule } = await modulesPromise;
  let calls = 0;
  const client = callbackClient(async () => {
    calls += 1;
    return { error: new Error('code verifier expired') };
  });
  const url = 'clubedojogo://auth/callback?code=expired-code';

  await assert.rejects(authModule.completeAuthCallback(url, client), /link de autenticação expirou/);
  await assert.rejects(authModule.completeAuthCallback(url, client), /link de autenticação expirou/);
  assert.equal(calls, 2);
});

test('callback rejeita links inválidos, com erro ou sem código', async () => {
  const { authModule } = await modulesPromise;
  const client = callbackClient(async () => ({ error: null }));

  await assert.rejects(authModule.completeAuthCallback('not a url', client), /link de autenticação é inválido/);
  await assert.rejects(
    authModule.completeAuthCallback('clubedojogo://auth/callback?error=access_denied', client),
    /access_denied/,
  );
  await assert.rejects(
    authModule.completeAuthCallback('clubedojogo://auth/callback?state=missing-code', client),
    /não contém um código/,
  );
});

test('callback rejeita troca sem sessão confirmada', async () => {
  const { authModule } = await modulesPromise;
  const client = {
    auth: {
      exchangeCodeForSession: async () => ({
        data: { session: null, user: null, redirectType: null },
        error: null,
      }),
    },
  } as unknown as AuthCallbackClient;

  await assert.rejects(
    authModule.completeAuthCallback('clubedojogo://auth/callback?code=missing-session', client),
    /não foi possível confirmar sua sessão/,
  );
});

test('storage preserva payload acima de 8KB e propaga falha de espaço', async () => {
  const { storageModule } = await modulesPromise;
  const values = new Map<string, string>();
  const storage = storageModule.createNativeStorage({
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
    removeItem: async key => {
      values.delete(key);
    },
  });
  const payload = 'session-'.repeat(1025);

  await storage.setItem('supabase-session', payload);
  assert.equal(payload.length > 8192, true);
  assert.equal(await storage.getItem('supabase-session'), payload);
  await storage.removeItem('supabase-session');
  assert.equal(await storage.getItem('supabase-session'), null);

  const quotaError = new Error('storage quota exceeded');
  const failingStorage = storageModule.createNativeStorage({
    getItem: async () => null,
    setItem: async () => {
      throw quotaError;
    },
    removeItem: async () => undefined,
  });
  await assert.rejects(failingStorage.setItem('supabase-session', payload), quotaError);
});

test('configuração pública aceita URL Supabase e expõe callback/API sem credencial privada', () => {
  return modulesPromise.then(({ configModule }) => {
    assert.deepEqual(configModule.getSupabaseConfig(), {
      url: 'https://supabase.example.test',
      publishableKey: 'publishable-test-key',
    });
    assert.equal(configModule.getApiBaseUrl(), 'https://api.example.test');
    assert.equal(configModule.getRankingFormula(), 'preference');
    assert.equal(configModule.AUTH_CALLBACK_URL, 'clubedojogo://auth/callback');
  });
});

test('API usa origem permitida, Bearer da sessão e não envia cookie', async () => {
  const { apiModule } = await modulesPromise;
  const client = sessionClient({ access_token: 'session-access-token' });
  const transport = apiModule.createMobileApiTransport(client, 'https://api.example.test/');
  const originalFetch = globalThis.fetch;
  let seenInput: Parameters<typeof fetch>[0] | undefined;
  let seenInit: Parameters<typeof fetch>[1] | undefined;
  globalThis.fetch = async (input, init) => {
    seenInput = input;
    seenInit = init;
    return new Response(null, { status: 204 });
  };

  try {
    await transport.request('/api/discover?source=friends', {
      headers: { Authorization: 'Bearer forged-token', Cookie: 'web-session=should-not-leak' },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(String(seenInput), 'https://api.example.test/api/discover?source=friends');
  const headers = new Headers(seenInit?.headers);
  assert.equal(headers.get('Authorization'), 'Bearer session-access-token');
  assert.equal(headers.get('Cookie'), null);
  assert.equal(seenInit?.credentials, 'omit');
  assert.equal(seenInit?.redirect, 'error');
});

test('API rejeita origem e rota fora do servidor configurado', async () => {
  const { apiModule } = await modulesPromise;
  const client = sessionClient({ access_token: 'session-access-token' });
  const transport = apiModule.createMobileApiTransport(client, 'https://api.example.test');

  await assert.rejects(transport.request('https://evil.example.test/api/discover'), /só acessa rotas \/api/);
  await assert.rejects(transport.request('/private/profile'), /só acessa rotas \/api/);
  await assert.rejects(
    apiModule.createMobileApiTransport(client, 'https://api.example.test/v1').request('/api/discover'),
    /URL da API deve ser uma origem HTTPS/,
  );
  await assert.rejects(
    apiModule.createMobileApiTransport(client, 'http://evil.example.test').request('/api/discover'),
    /URL da API deve ser uma origem HTTPS/,
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 204 });
  try {
    await assert.doesNotReject(
      apiModule.createMobileApiTransport(client, 'http://127.0.0.1:55421').request('/api/health'),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('API não usa sessão inválida nem sessão ausente', async () => {
  const { apiModule } = await modulesPromise;
  const sessionError = new Error('session lookup failed');
  await assert.rejects(
    apiModule.createMobileApiTransport(sessionClient(null, sessionError), 'https://api.example.test').request('/api/discover'),
    /validar sua sessão/,
  );
  await assert.rejects(
    apiModule.createMobileApiTransport(sessionClient(null), 'https://api.example.test').request('/api/discover'),
    /sessão expirou/,
  );
});

function configuredLocalNextUrl(): string | undefined {
  const value = process.env.LOCAL_NEXT_API_URL;
  if (!value) return undefined;
  const parsed = new URL(value);
  if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || parsed.port !== '3101' || parsed.username || parsed.password) {
    throw new Error('LOCAL_NEXT_API_URL deve apontar somente para http://127.0.0.1:3101');
  }
  return parsed.origin;
}

const localNextUrl = configuredLocalNextUrl();
const localNextCookie = process.env.LOCAL_NEXT_API_COOKIE;

test('Next rejeita Bearer inválido sem herdar cookie de sessão', {
  skip: localNextUrl && localNextCookie
    ? false
    : 'SKIP: defina LOCAL_NEXT_API_URL e LOCAL_NEXT_API_COOKIE para testar o servidor local',
  concurrency: false,
}, async () => {
  const authenticated = await fetch(`${localNextUrl}/api/discover?source=friends&limit=1`, {
    headers: { Cookie: localNextCookie as string },
  });
  assert.equal(authenticated.status, 200, 'A fixture precisa comprovar uma sessão web válida');
  const response = await fetch(`${localNextUrl}/api/discover?source=friends&limit=1`, {
    headers: {
      Authorization: 'Bearer invalid-auth-validation-token',
      Cookie: localNextCookie as string,
    },
  });
  assert.equal(response.status, 401);
});
