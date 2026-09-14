import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DataError, readApiJson, toDataError, type ApiTransport } from '@clube-do-jogo/data';

function transportReturning(status: number, body: unknown): ApiTransport {
  return { async request() { return new Response(JSON.stringify(body), { status }); } };
}

async function failureFrom(transport: ApiTransport) {
  return readApiJson(transport, '/api/discover').then(() => null, (error: unknown) => error);
}

test('rota que rejeita a sessão chega no membro como sessão expirada, não como falha genérica', async () => {
  const failure = await failureFrom(transportReturning(401, { error: 'Não autorizado.' }));
  const mapped = toDataError('explorar jogos', 'Não foi possível carregar a descoberta.', failure);
  assert.equal(mapped.message, 'Sua sessão expirou. Entre novamente para continuar.');
});

test('falha de servidor mantém a mensagem do produto e guarda o motivo técnico na causa', async () => {
  const failure = await failureFrom(transportReturning(500, { error: 'IGDB_CLIENT_ID não configurado.' }));
  const mapped = toDataError('explorar jogos', 'Não foi possível carregar a descoberta.', failure);
  assert.equal(mapped.message, 'Não foi possível carregar a descoberta.');
  assert.equal((mapped.cause as Error).message, 'IGDB_CLIENT_ID não configurado.');
  assert.equal((mapped.cause as { code?: string }).code, '500');
});

test('resposta sem corpo utilizável ainda identifica o status', async () => {
  const transport: ApiTransport = { async request() { return new Response('<html>502</html>', { status: 502 }); } };
  const failure = await failureFrom(transport);
  assert.equal((failure as { code?: string }).code, '502');
  assert.equal((failure as Error).message, 'A API não conseguiu concluir a solicitação.');
});

test('resposta boa não vira erro', async () => {
  const payload = await readApiJson<{ items: unknown[] }>(transportReturning(200, { items: [1, 2] }), '/api/discover');
  assert.deepEqual(payload.items, [1, 2]);
});

test('DataError já mapeado atravessa sem ser reescrito', () => {
  const original = new DataError('explorar jogos', 'Sua sessão expirou. Entre novamente para continuar.');
  assert.equal(toDataError('outra coisa', 'mensagem nova', original), original);
});
