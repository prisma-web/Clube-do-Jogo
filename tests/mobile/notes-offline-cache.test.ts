import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LocalNote } from '@clube-do-jogo/domain';
import {
  notesCacheKey,
  parseNotesCache,
  serializeNotesCache,
  summarizeNotesSync,
} from '../../apps/mobile/src/state/notes-offline-cache';
import {
  createConflicts,
  createQueue,
  enqueue,
  markAttempt,
  markConflict,
} from '../../apps/mobile/src/state/notes-queue';

function note(id: string, body = `nota ${id}`, overrides: Partial<LocalNote> = {}): LocalNote {
  return { id, userId: 'user-1', gameId: 'game-1', body, createdAt: '2026-09-10T12:00:00.000Z', updatedAt: '2026-09-10T12:00:00.000Z', ...overrides };
}

test('cache de notas é escopado por conta, demo, jogo e snapshot', () => {
  const base = notesCacheKey('user-1', false, 1, 'game-1', null);
  assert.notEqual(base, notesCacheKey('user-2', false, 1, 'game-1', null));
  assert.notEqual(base, notesCacheKey('user-1', true, 1, 'game-1', null));
  assert.notEqual(base, notesCacheKey('user-1', false, 1, 'game-2', null));
  assert.notEqual(base, notesCacheKey('user-1', false, 1, 'game-1', '2026-08'));
  assert.ok(base.includes('/account/'));
});

test('cache de notas faz ida e volta e descarta linhas de outro usuário ou jogo', () => {
  const stored = serializeNotesCache([note('a'), note('b', 'com imagem', { imageDataUrl: 'data:image/png;base64,AA' }), note('x', 'outra', { gameId: 'game-2' }), note('y', 'alheia', { userId: 'user-9' })], '2026-09-10T13:00:00.000Z');
  const parsed = parseNotesCache(stored, { gameId: 'game-1', userId: 'user-1' });
  assert.ok(parsed);
  assert.deepEqual(parsed.notes.map(item => item.id), ['a', 'b']);
  assert.equal(parsed.notes[1].imageDataUrl, 'data:image/png;base64,AA');
  assert.equal(parsed.savedAt, '2026-09-10T13:00:00.000Z');
});

test('cache ausente ou corrompido vira null em vez de lançar', () => {
  const scope = { gameId: 'game-1', userId: 'user-1' };
  assert.equal(parseNotesCache(null, scope), null);
  assert.equal(parseNotesCache('{oops', scope), null);
  assert.equal(parseNotesCache(JSON.stringify([note('a')]), scope), null);
  assert.equal(parseNotesCache(JSON.stringify({ version: 99, savedAt: 'x', notes: [] }), scope), null);
});

test('status: tudo sincronizado sem pendências', () => {
  const summary = summarizeNotesSync({ confirmed: [note('a'), note('b')], queue: createQueue(), conflicts: createConflicts(), serverError: false, fromCache: false, fetching: false });
  assert.equal(summary.state, 'synced');
  assert.equal(summary.synced, 2);
  assert.equal(summary.canRetry, false);
});

test('status: pendente, falha e conflito são contados separadamente', () => {
  let queue = enqueue(createQueue(), { note: note('p'), origin: 'create', generation: 0 });
  queue = enqueue(queue, { note: note('f'), origin: 'create', generation: 0 });
  queue = markAttempt(queue, 'f', 'Network request failed');
  queue = enqueue(queue, { note: note('c', 'local'), origin: 'update', expectedUpdatedAt: 'x', generation: 0 });
  const conflicts = markConflict(createConflicts(), 'c', { kind: 'changed', local: note('c', 'local'), remote: note('c', 'remoto') });
  const summary = summarizeNotesSync({ confirmed: [note('a'), note('c', 'remoto')], queue, conflicts, serverError: false, fromCache: false, fetching: false });
  assert.equal(summary.state, 'conflict');
  assert.equal(summary.synced, 1);
  assert.equal(summary.pending, 2);
  assert.equal(summary.failed, 1);
  assert.equal(summary.conflicts, 1);
  assert.equal(summary.canRetry, true);
});

test('status: servidor fora do ar com cópia local fica offline e oferece nova sincronização', () => {
  const summary = summarizeNotesSync({ confirmed: [note('a')], queue: createQueue(), conflicts: createConflicts(), serverError: true, fromCache: true, fetching: false });
  assert.equal(summary.state, 'offline');
  assert.equal(summary.canRetry, true);
  const noCache = summarizeNotesSync({ confirmed: [], queue: createQueue(), conflicts: createConflicts(), serverError: true, fromCache: false, fetching: false });
  assert.equal(noCache.state, 'error');
});
