import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clearConflict,
  createConflicts,
  createPendingNotesStore,
  createQueue,
  dequeue,
  enqueue,
  markAttempt,
  markConflict,
  mergePendingIntoList,
  parseQueue,
  serializeQueue,
  summarize,
  type PendingLocalNote,
} from '../../apps/mobile/src/state/notes-queue';

function pending(id: string, body: string): PendingLocalNote {
  return {
    note: { id, userId: 'user-1', gameId: 'game-1', body, createdAt: '2026-09-10T12:00:00.000Z', updatedAt: '2026-09-10T12:00:00.000Z' },
    origin: 'create',
    expectedUpdatedAt: undefined,
    generation: 0,
    lastAttemptAt: undefined,
    lastError: undefined,
  };
}

test('two distinct pending notes in the same game do not collide', () => {
  const noteA = pending('note-a', 'texto da nota A');
  const noteB = pending('note-b', 'texto da nota B');
  const queue = enqueue(enqueue(createQueue(), noteA), noteB);

  assert.equal(queue.size, 2);
  assert.deepEqual(queue.get('note-a'), noteA);
  assert.deepEqual(queue.get('note-b'), noteB);
});

test('enqueuing a second note does not overwrite the first note\'s slot', () => {
  const noteA = pending('note-a', 'texto da nota A');
  const noteB = pending('note-b', 'texto da nota B');
  const afterA = enqueue(createQueue(), noteA);
  const afterB = enqueue(afterA, noteB);

  assert.deepEqual(afterA.get('note-a'), noteA);
  assert.deepEqual(afterB.get('note-a'), noteA);
  assert.equal(afterA.size, 1);
});

test('resolving the conflict of one note does not affect the other', () => {
  const noteA = pending('note-a', 'texto da nota A');
  const noteB = pending('note-b', 'texto da nota B');
  let queue = enqueue(enqueue(createQueue(), noteA), noteB);
  let conflicts = createConflicts();

  conflicts = markConflict(conflicts, 'note-a', { kind: 'changed', local: noteA.note, remote: { ...noteA.note, body: 'versão do servidor' } });

  assert.equal(conflicts.size, 1);
  assert.deepEqual(queue.get('note-b'), noteB);

  queue = dequeue(queue, 'note-a');
  conflicts = clearConflict(conflicts, 'note-a');

  assert.equal(queue.size, 1);
  assert.equal(queue.has('note-a'), false);
  assert.deepEqual(queue.get('note-b'), noteB);
  assert.equal(conflicts.size, 0);
  assert.deepEqual(summarize(queue, conflicts), { pending: 1, conflicts: 0 });
});

test('markAttempt bumps generation and records the failure without touching other slots', () => {
  const noteA = pending('note-a', 'texto da nota A');
  const noteB = pending('note-b', 'texto da nota B');
  const queue = enqueue(enqueue(createQueue(), noteA), noteB);
  const retried = markAttempt(queue, 'note-a', 'network offline');

  assert.equal(retried.get('note-a')?.generation, 1);
  assert.equal(retried.get('note-a')?.lastError, 'network offline');
  assert.deepEqual(retried.get('note-b'), noteB);
});

test('a conflict kind of deleted carries no remote field', () => {
  const conflicts = markConflict(createConflicts(), 'note-a', { kind: 'deleted', local: pending('note-a', 'x').note });
  const conflict = conflicts.get('note-a');
  assert.equal(conflict?.kind, 'deleted');
  assert.equal('remote' in (conflict as object), false);
});

test('serializeQueue then parseQueue round-trips two distinct pending notes intact', () => {
  const noteA = pending('note-a', 'texto da nota A');
  const noteB = pending('note-b', 'texto da nota B');
  const queue = enqueue(enqueue(createQueue(), noteA), noteB);

  const restored = parseQueue(serializeQueue(queue));

  assert.equal(restored.unrecoverableCount, 0);
  assert.equal(restored.queue.size, 2);
  assert.deepEqual(restored.queue.get('note-a'), noteA);
  assert.deepEqual(restored.queue.get('note-b'), noteB);
});

test('parseQueue treats a missing key as an empty queue', () => {
  assert.deepEqual(parseQueue(null), { queue: createQueue(), unrecoverableCount: 0 });
});

test('parseQueue surfaces a corrupted top-level blob instead of silently dropping the whole queue', () => {
  assert.throws(() => parseQueue('{"not":"an array"}'));
});

test('parseQueue recovers a note whose sync metadata is missing instead of discarding the text', () => {
  const noteOnly = { note: pending('note-a', 'texto salvo pelo usuário').note };

  const restored = parseQueue(JSON.stringify([noteOnly]));

  assert.equal(restored.unrecoverableCount, 0);
  assert.equal(restored.queue.size, 1);
  assert.equal(restored.queue.get('note-a')?.note.body, 'texto salvo pelo usuário');
  assert.equal(restored.queue.get('note-a')?.origin, 'create');
});

test('parseQueue downgrades an update entry that lost its expectedUpdatedAt to create, not to data loss', () => {
  const stale = { note: pending('note-a', 'texto editado').note, origin: 'update', generation: 2 };

  const restored = parseQueue(JSON.stringify([stale]));

  assert.equal(restored.queue.get('note-a')?.origin, 'create');
  assert.equal(restored.queue.get('note-a')?.expectedUpdatedAt, undefined);
});

test('parseQueue counts an entry with no recoverable note as unrecoverable without dropping the valid ones', () => {
  const noteA = pending('note-a', 'texto da nota A');
  const garbage = { origin: 'create', generation: 0 };

  const restored = parseQueue(JSON.stringify([noteA, garbage]));

  assert.equal(restored.unrecoverableCount, 1);
  assert.equal(restored.queue.size, 1);
  assert.deepEqual(restored.queue.get('note-a'), noteA);
});

test('mergePendingIntoList appends unconfirmed notes without duplicating a note that already synced', () => {
  const confirmed = [pending('note-a', 'texto da nota A').note];
  const queue = enqueue(enqueue(createQueue(), pending('note-a', 'texto da nota A')), pending('note-b', 'texto da nota B'));

  const merged = mergePendingIntoList(confirmed, queue);

  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map(note => note.id).sort(), ['note-a', 'note-b']);
});

function memoryStorage(initial: string | null = null) {
  const state = { stored: initial, reads: 0 };
  return {
    state,
    read: async () => { state.reads += 1; return state.stored; },
    write: (queue: Parameters<typeof serializeQueue>[0]) => { state.stored = queue.size ? serializeQueue(queue) : null; },
  };
}

function storedIds(stored: string | null) {
  return Array.from(parseQueue(stored).queue.keys()).sort();
}

test('duas telas do mesmo jogo gravam a mesma fila, e a resposta atrasada de uma não apaga o envio da outra', async () => {
  const storage = memoryStorage();
  const store = createPendingNotesStore(storage);
  await store.load();
  await store.load();

  store.setQueue(enqueue(store.getSnapshot().queue, pending('note-a', 'enviada na aba Jogo do mês')));
  store.setQueue(enqueue(store.getSnapshot().queue, pending('note-b', 'enviada no detalhe do jogo')));
  store.setQueue(markAttempt(store.getSnapshot().queue, 'note-a', 'sem conexão'));

  assert.deepEqual(storedIds(storage.state.stored), ['note-a', 'note-b']);
  assert.equal(storage.state.reads, 1, 'a fila é lida do aparelho uma vez só');
});

test('uma tela que monta depois não recarrega a fila por cima do que já está na memória', async () => {
  const storage = memoryStorage(serializeQueue(enqueue(createQueue(), pending('note-a', 'salva antes'))));
  const store = createPendingNotesStore(storage);
  await store.load();
  store.setQueue(enqueue(store.getSnapshot().queue, pending('note-b', 'ainda não gravada')));
  storage.state.stored = null;

  await store.load();

  assert.deepEqual(Array.from(store.getSnapshot().queue.keys()).sort(), ['note-a', 'note-b']);
});

test('quem assina o store vê a fila e os conflitos mudarem', async () => {
  const store = createPendingNotesStore(memoryStorage());
  await store.load();
  let notified = 0;
  const unsubscribe = store.subscribe(() => { notified += 1; });
  store.setQueue(enqueue(store.getSnapshot().queue, pending('note-a', 'texto')));
  store.setConflicts(markConflict(store.getSnapshot().conflicts, 'note-a', { kind: 'deleted', local: pending('note-a', 'texto').note }));
  unsubscribe();
  store.setQueue(createQueue());
  assert.equal(notified, 2);
  assert.equal(store.getSnapshot().conflicts.get('note-a')?.kind, 'deleted');
});

test('fila corrompida no aparelho rejeita a carga e deixa a fila vazia', async () => {
  const store = createPendingNotesStore(memoryStorage('{"não é": "lista"}'));
  await assert.rejects(store.load(), /corrompida/);
  assert.equal(store.getSnapshot().queue.size, 0);
});
