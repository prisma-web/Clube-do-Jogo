import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toDataError } from '@clube-do-jogo/data';
import { createMobileApiTransport } from '../../apps/mobile/src/platform/api';

const BASE = 'https://clube.example.com';

function fakeClient(tokens: string[], refreshFails = false) {
  const calls = { getSession: 0, refresh: 0 };
  const client = {
    auth: {
      async getSession() {
        calls.getSession += 1;
        return { data: { session: { access_token: tokens[0] } }, error: null };
      },
      async refreshSession() {
        calls.refresh += 1;
        if (refreshFails) return { data: { session: null }, error: { message: 'invalid refresh token' } };
        tokens.shift();
        return { data: { session: { access_token: tokens[0] } }, error: null };
      },
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

function fakeFetch(statuses: number[]) {
  const sent: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    sent.push(new Headers(init.headers).get('Authorization') ?? '');
    return new Response('{}', { status: statuses.shift() ?? 200 });
  }) as typeof fetch;
  return { sent, restore: () => { globalThis.fetch = original; } };
}

test('token vencido se renova sozinho e o membro nem percebe', async () => {
  const { client, calls } = fakeClient(['velho', 'novo']);
  const net = fakeFetch([401, 200]);
  try {
    const response = await createMobileApiTransport(client, BASE).request('/api/discover');
    assert.equal(response.status, 200);
    assert.deepEqual(net.sent, ['Bearer velho', 'Bearer novo']);
    assert.equal(calls.refresh, 1);
  } finally { net.restore(); }
});

test('sessão que não renova é expiração de verdade e diz isso', async () => {
  const { client } = fakeClient(['velho'], true);
  const net = fakeFetch([401]);
  try {
    await assert.rejects(
      createMobileApiTransport(client, BASE).request('/api/discover'),
      { message: 'Sua sessão expirou. Entre novamente para continuar.' },
    );
    assert.equal(net.sent.length, 1);
  } finally { net.restore(); }
});

test('401 com sessão recém-renovada não culpa o membro', async () => {
  const { client, calls } = fakeClient(['velho', 'novo']);
  const net = fakeFetch([401, 401]);
  try {
    await assert.rejects(
      createMobileApiTransport(client, BASE).request('/api/discover'),
      { message: 'O servidor recusou o acesso mesmo com a sessão renovada.' },
    );
    assert.equal(net.sent.length, 2, 'tenta no máximo uma vez a mais');
    assert.equal(calls.refresh, 1);
  } finally { net.restore(); }
});

test('erro que não é 401 volta como veio, sem renovar nada', async () => {
  const { client, calls } = fakeClient(['velho']);
  const net = fakeFetch([500]);
  try {
    const response = await createMobileApiTransport(client, BASE).request('/api/discover');
    assert.equal(response.status, 500);
    assert.equal(calls.refresh, 0);
    assert.equal(net.sent.length, 1);
  } finally { net.restore(); }
});

test('resposta boa não dispara renovação', async () => {
  const { client, calls } = fakeClient(['velho']);
  const net = fakeFetch([200]);
  try {
    assert.equal((await createMobileApiTransport(client, BASE).request('/api/discover')).status, 200);
    assert.equal(calls.refresh, 0);
  } finally { net.restore(); }
});

test('a frase do transporte chega ao membro, não a genérica da operação', async () => {
  const { client } = fakeClient(['velho', 'novo']);
  const net = fakeFetch([401, 401]);
  try {
    const failure = await createMobileApiTransport(client, BASE).request('/api/discover').then(() => null, (e: unknown) => e);
    const shown = toDataError('explorar jogos', 'Não foi possível carregar a descoberta.', failure);
    assert.equal(shown.message, 'O servidor recusou o acesso mesmo com a sessão renovada. Avise quem cuida do clube.');
  } finally { net.restore(); }
});

test('sessão morta chega ao membro como expiração, não como falha genérica', async () => {
  const { client } = fakeClient(['velho'], true);
  const net = fakeFetch([401]);
  try {
    const failure = await createMobileApiTransport(client, BASE).request('/api/discover').then(() => null, (e: unknown) => e);
    const shown = toDataError('explorar jogos', 'Não foi possível carregar a descoberta.', failure);
    assert.equal(shown.message, 'Sua sessão expirou. Entre novamente para continuar.');
  } finally { net.restore(); }
});
