import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QueryClient, QueryObserver } from '@tanstack/query-core';
import type { QueryClient as ReactQueryClient } from '@tanstack/react-query';
import { createFlushGate } from '../../apps/mobile/src/state/notes-queue';
import { refetchNotesAfterWrite } from '../../apps/mobile/src/state/notes-refresh';

type Outcome = 'ok' | 'fail';

function harness() {
  const gate = createFlushGate();
  const queued = new Set<string>(['B']);
  const sends: Array<{ noteId: string; settle(outcome: Outcome): Promise<void> }> = [];
  function flushOne(noteId: string) {
    if (!queued.has(noteId) || !gate.begin(noteId)) return;
    let settle!: (outcome: Outcome) => void;
    const response = new Promise<Outcome>(resolve => { settle = resolve; });
    const done = response.then(outcome => {
      if (outcome === 'ok') queued.delete(noteId);
    }).finally(() => {
      if (gate.finish(noteId)) flushOne(noteId);
    });
    sends.push({ noteId, settle: async outcome => { settle(outcome); await done; } });
  }
  return { gate, queued, sends, flushOne };
}

test('reconexão durante um envio pendurado reenvia assim que ele falha', async () => {
  const { queued, sends, flushOne } = harness();
  flushOne('B');
  assert.equal(sends.length, 1);
  flushOne('B');
  assert.equal(sends.length, 1, 'não abre um segundo envio concorrente da mesma nota');
  await sends[0].settle('fail');
  assert.equal(sends.length, 2, 'o gatilho da reconexão vira um novo envio');
  await sends[1].settle('ok');
  assert.equal(queued.has('B'), false);
});

test('sem gatilho durante o envio, uma falha não reenvia sozinha', async () => {
  const { gate, queued, sends, flushOne } = harness();
  flushOne('B');
  await sends[0].settle('fail');
  assert.equal(sends.length, 1);
  assert.equal(queued.has('B'), true, 'a nota continua na fila esperando o próximo gatilho');
  assert.equal(gate.isFlushing('B'), false);
});

test('gatilho durante um envio que dá certo não manda a nota de novo', async () => {
  const { sends, flushOne } = harness();
  flushOne('B');
  flushOne('B');
  await sends[0].settle('ok');
  assert.equal(sends.length, 1, 'a nota saiu da fila, então o reenvio retorna sem pedido');
});

test('vários gatilhos durante um envio viram um único reenvio', async () => {
  const { sends, flushOne } = harness();
  flushOne('B');
  flushOne('B');
  flushOne('B');
  flushOne('B');
  await sends[0].settle('fail');
  assert.equal(sends.length, 2);
  await sends[1].settle('fail');
  assert.equal(sends.length, 2, 'o gatilho foi consumido pelo primeiro reenvio');
});

function slowServer(initial: string[]) {
  const rows = [...initial];
  const reads: Array<{ snapshot: string[]; answer(): void }> = [];
  const queryFn = () => new Promise<string[]>(resolve => {
    const snapshot = [...rows];
    reads.push({ snapshot, answer: () => resolve(snapshot) });
  });
  return { rows, reads, queryFn };
}

const KEY = ['notes', 1, 'user-1', false, 'game-1', null] as const;

function mount(client: QueryClient, queryFn: () => Promise<string[]>) {
  const observer = new QueryObserver<string[]>(client, { queryKey: KEY, queryFn, retry: false, staleTime: 30_000 });
  const unsubscribe = observer.subscribe(() => undefined);
  return { observer, unsubscribe };
}

async function tick() {
  await new Promise(resolve => setImmediate(resolve));
}

test('controle: invalidateQueries reaproveita a primeira leitura em voo e guarda a lista velha', async () => {
  const client = new QueryClient();
  const server = slowServer(['A']);
  const { unsubscribe } = mount(client, server.queryFn);
  await tick();
  assert.equal(server.reads.length, 1, 'a tela abriu e começou a primeira leitura');
  server.rows.push('B');
  const invalidated = client.invalidateQueries({ queryKey: KEY, exact: true });
  await tick();
  assert.equal(server.reads.length, 1, 'nenhuma leitura nova: a em voo foi reaproveitada');
  server.reads[0].answer();
  await invalidated;
  assert.deepEqual(client.getQueryData(KEY), ['A']);
  assert.equal(client.getQueryState(KEY)?.isInvalidated, false, 'e a lista velha passa por atual');
  unsubscribe();
  client.clear();
});

test('refetchNotesAfterWrite lê de novo quando a primeira leitura começou antes do envio', async () => {
  const client = new QueryClient();
  const server = slowServer(['A']);
  const { unsubscribe } = mount(client, server.queryFn);
  await tick();
  server.rows.push('B');
  const refreshed = refetchNotesAfterWrite(client as unknown as ReactQueryClient, KEY);
  await tick();
  assert.equal(server.reads.length, 2, 'a leitura velha foi cancelada e outra começou');
  assert.deepEqual(server.reads[1].snapshot, ['A', 'B']);
  server.reads[0].answer();
  server.reads[1].answer();
  await refreshed;
  assert.deepEqual(client.getQueryData(KEY), ['A', 'B']);
  unsubscribe();
  client.clear();
});

test('refetchNotesAfterWrite também refaz uma leitura em voo quando a lista já tinha dados', async () => {
  const client = new QueryClient();
  const server = slowServer(['A']);
  const { unsubscribe } = mount(client, server.queryFn);
  await tick();
  server.reads[0].answer();
  await tick();
  assert.deepEqual(client.getQueryData(KEY), ['A']);
  void client.refetchQueries({ queryKey: KEY, exact: true });
  await tick();
  assert.equal(server.reads.length, 2);
  server.rows.push('B');
  const refreshed = refetchNotesAfterWrite(client as unknown as ReactQueryClient, KEY);
  await tick();
  assert.equal(server.reads.length, 3);
  server.reads[1].answer();
  server.reads[2].answer();
  await refreshed;
  assert.deepEqual(client.getQueryData(KEY), ['A', 'B']);
  unsubscribe();
  client.clear();
});

test('refetchNotesAfterWrite sem tela montada só marca a lista para a próxima leitura', async () => {
  const client = new QueryClient();
  const server = slowServer(['A']);
  const { unsubscribe } = mount(client, server.queryFn);
  await tick();
  server.reads[0].answer();
  await tick();
  unsubscribe();
  server.rows.push('B');
  await refetchNotesAfterWrite(client as unknown as ReactQueryClient, KEY);
  assert.equal(server.reads.length, 1, 'nada é buscado sem tela');
  assert.equal(client.getQueryState(KEY)?.isInvalidated, true, 'a próxima montagem busca de novo');
  client.clear();
});
