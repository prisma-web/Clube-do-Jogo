import assert from 'node:assert/strict';
import { after, beforeEach, mock, test } from 'node:test';
import { webcrypto } from 'node:crypto';

// Caminho real: createRequestContext lê header e cookies do Next, monta o cliente
// do Supabase de verdade e confere o token. Só a borda é falsa: o pedido (o módulo
// next/headers) e a rede (fetch), que serve o JWKS e o /user do Auth.
const SUPABASE_URL = 'https://projeto.supabase.co';
const MEMBER = '8f14e45f-ceea-467a-9e2f-4c0bd5a6a111';
const savedEnvironment = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_teste';

const request: { headers: Headers; cookies: Array<{ name: string; value: string }> } = { headers: new Headers(), cookies: [] };
mock.module('next/headers', {
  exports: {
    headers: async () => request.headers,
    cookies: async () => ({ getAll: () => request.cookies, set() {} }),
  },
});

const serverModule = import('../../src/lib/supabase/server');

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const keyPair = webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const publicJwk = keyPair.then(async pair => ({ ...(await webcrypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'chave-do-teste', alg: 'ES256', use: 'sig', key_ops: ['verify'] }));

// Sessões que o Auth ainda reconhece. Sair da conta tira a sessão daqui, mas o
// token assinado continua íntegro até vencer.
const liveTokens = new Set<string>();

async function sign(claims: Record<string, unknown>, { live = true } = {}) {
  const pair = await keyPair;
  const body = `${encode({ alg: 'ES256', kid: 'chave-do-teste', typ: 'JWT' })}.${encode(claims)}`;
  const signature = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, new TextEncoder().encode(body));
  const token = `${body}.${Buffer.from(signature).toString('base64url')}`;
  if (live) liveTokens.add(token);
  return token;
}

const inOneHour = () => Math.floor(Date.now() / 1000) + 3600;
const memberToken = (overrides: Record<string, unknown> = {}, options?: { live?: boolean }) =>
  sign({ sub: MEMBER, role: 'authenticated', aud: 'authenticated', exp: inOneHour(), ...overrides }, options);

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin === SUPABASE_URL && url.pathname === '/auth/v1/.well-known/jwks.json') {
    return Response.json({ keys: [await publicJwk] });
  }
  if (url.origin === SUPABASE_URL && url.pathname === '/auth/v1/user') {
    const token = /^Bearer\s+(\S+)$/i.exec(new Headers(init?.headers).get('authorization') ?? '')?.[1];
    if (!token || !liveTokens.has(token)) {
      return Response.json({ code: 403, error_code: 'session_not_found', msg: 'Session from session_id claim in JWT does not exist' }, { status: 403 });
    }
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return Response.json({ id: claims.sub, aud: 'authenticated', role: claims.role, email: 'membro@clube.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });
  }
  throw new Error(`rede inesperada no teste: ${url}`);
}) as typeof fetch;

after(() => {
  globalThis.fetch = originalFetch;
  if (savedEnvironment.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = savedEnvironment.url;
  if (savedEnvironment.anonKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = savedEnvironment.anonKey;
});

beforeEach(() => {
  request.headers = new Headers();
  request.cookies = [];
});

function sendBearer(token: string) {
  request.headers = new Headers({ authorization: `Bearer ${token}` });
}

function sendSessionCookie(accessToken: string) {
  const session = {
    access_token: accessToken,
    refresh_token: 'refresh-do-teste',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: inOneHour(),
    user: { id: MEMBER, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  };
  request.cookies = [{ name: 'sb-projeto-auth-token', value: JSON.stringify(session) }];
}

async function memberId(options?: { checkRevocation?: boolean }) {
  const { createRequestContext } = await serverModule;
  return (await createRequestContext(options)).userId;
}

test('Bearer válido chega ao userId', async () => {
  sendBearer(await memberToken());
  assert.equal(await memberId(), MEMBER);
});

test('sem header o cookie da sessão continua valendo', async () => {
  sendSessionCookie(await memberToken());
  assert.equal(await memberId(), MEMBER);
});

test('token vencido é recusado, mesmo com assinatura certa', async () => {
  sendBearer(await memberToken({ exp: Math.floor(Date.now() / 1000) - 60 }));
  assert.equal(await memberId(), null);
});

test('token assinado com outro role não vira membro', async () => {
  for (const role of ['anon', 'service_role', undefined]) {
    sendBearer(await memberToken({ role }));
    assert.equal(await memberId(), null, `role ${role} passou`);
  }
});

test('token sem sub não vira membro', async () => {
  sendBearer(await memberToken({ sub: '' }));
  assert.equal(await memberId(), null);
  sendBearer(await memberToken({ sub: undefined }));
  assert.equal(await memberId(), null);
});

test('assinatura trocada é recusada', async () => {
  const token = await memberToken();
  sendBearer(`${token.slice(0, -4)}${token.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA'}`);
  assert.equal(await memberId(), null);
});

test('Bearer inválido com cookie válido não herda o cookie', async () => {
  for (const authorization of ['Bearer lixo', 'Bearer a.b.c', 'Basic abc', 'Bearer ']) {
    sendSessionCookie(await memberToken());
    request.headers = new Headers({ authorization });
    assert.equal(await memberId(), null, `${authorization} herdou o cookie`);
    assert.equal(await memberId({ checkRevocation: true }), null, `${authorization} herdou o cookie na conferência no servidor`);
  }
});

test('a conferência no servidor percebe a sessão encerrada, a local não', async () => {
  const token = await memberToken();
  sendBearer(token);
  assert.equal(await memberId({ checkRevocation: true }), MEMBER);

  liveTokens.delete(token);
  assert.equal(await memberId({ checkRevocation: true }), null);
  // O preço aceito da conferência local: o token vale até vencer.
  assert.equal(await memberId(), MEMBER);
});

test('a conferência no servidor também vale para o cookie da sessão', async () => {
  const token = await memberToken();
  sendSessionCookie(token);
  assert.equal(await memberId({ checkRevocation: true }), MEMBER);
  liveTokens.delete(token);
  assert.equal(await memberId({ checkRevocation: true }), null);
});

// Toda rota que usa a service role em nome do membro tem que perceber a sessão
// encerrada. A lista sai do código, então uma rota nova entra sozinha.
// Rotas que não agem por membro nenhum e se autenticam de outro jeito.
const NOT_MEMBER_ROUTES = new Set([
  // O worker do push nativo entra com o CRON_SECRET.
  'src/app/api/push/worker/route.ts',
]);

async function routesActingWithServiceRole() {
  const { readdir, readFile } = await import('node:fs/promises');
  const files = (await readdir('src/app/api', { recursive: true })).filter(file => file.endsWith('route.ts')).map(file => `src/app/api/${file}`);
  const routes = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (!source.includes('createAdminClient') && !file.startsWith('src/app/api/push/')) continue;
    if (NOT_MEMBER_ROUTES.has(file)) continue;
    routes.push(file);
  }
  return routes;
}

test('rotas que agem com a service role recusam a sessão encerrada', async () => {
  const routes = await routesActingWithServiceRole();
  assert.ok(routes.length >= 7, `esperava as rotas de push, achei ${routes.join(', ')}`);
  const token = await memberToken();
  liveTokens.delete(token);
  for (const file of routes) {
    const handlers = await import(`../../${file}`) as Record<string, unknown>;
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].filter(method => typeof handlers[method] === 'function');
    assert.ok(methods.length, `${file} não exporta handler`);
    for (const method of methods) {
      sendBearer(token);
      const handler = handlers[method] as (request: Request) => Promise<Response>;
      const response = await handler(new Request('http://localhost/api', { method, headers: request.headers, body: method === 'GET' ? undefined : '{}' }));
      assert.equal(response.status, 401, `${method} ${file} aceitou a sessão encerrada`);
    }
  }
});
