import { expect, test } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';
import type { LocalNote } from '../../src/lib/types';
import type { NoteSyncMetadata } from '../../src/lib/local-notes';
import {
  noteFingerprint,
  resolveNoteConflict,
  syncNotes,
  type NotesLocalStore,
  type NotesRemoteStore,
  type NotesSyncContext,
} from '../../src/lib/notes-sync';

const context = { userId: 'user-a', gameId: 'game-a' } satisfies NotesSyncContext;
const fixedNow = () => '2026-09-10T12:00:00.000Z';

function makeNote(id: string, patch: Partial<LocalNote> = {}): LocalNote {
  return {
    id,
    userId: context.userId,
    gameId: context.gameId,
    body: `nota ${id}`,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...patch,
  };
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

class MemoryLocalStore implements NotesLocalStore {
  notes = new Map<string, LocalNote>();
  metadata = new Map<string, NoteSyncMetadata>();

  constructor(notes: LocalNote[] = []) {
    for (const note of notes) this.notes.set(`${note.userId}:${note.id}`, copy(note));
  }

  async listNotes(target: NotesSyncContext) {
    return [...this.notes.values()].filter(note => note.userId === target.userId && note.gameId === target.gameId).map(copy);
  }

  async saveNote(note: LocalNote) {
    this.notes.set(`${note.userId}:${note.id}`, copy(note));
  }

  async listMetadata(target: NotesSyncContext) {
    return [...this.metadata.values()].filter(record => record.userId === target.userId && record.gameId === target.gameId).map(copy);
  }

  async getMetadata(userId: string, noteId: string) {
    const record = this.metadata.get(`${userId}:${noteId}`);
    return record ? copy(record) : undefined;
  }

  async saveMetadata(metadata: NoteSyncMetadata) {
    this.metadata.set(`${metadata.userId}:${metadata.noteId}`, copy(metadata));
  }
}

class MemoryRemoteStore implements NotesRemoteStore {
  notes = new Map<string, LocalNote>();
  insertCalls = new Map<string, number>();
  updateCalls = new Map<string, number>();
  failInsertBeforeCommit = new Set<string>();
  failInsertAfterCommit = new Set<string>();
  failList = false;

  constructor(notes: LocalNote[] = []) {
    for (const note of notes) this.notes.set(note.id, copy(note));
  }

  async list(target: NotesSyncContext) {
    if (this.failList) throw new Error('offline');
    return [...this.notes.values()].filter(note => note.userId === target.userId && note.gameId === target.gameId).map(copy);
  }

  async get(target: NotesSyncContext, noteId: string) {
    const note = this.notes.get(noteId);
    return note?.userId === target.userId && note.gameId === target.gameId ? copy(note) : null;
  }

  async insert(note: LocalNote) {
    this.insertCalls.set(note.id, (this.insertCalls.get(note.id) || 0) + 1);
    if (this.failInsertBeforeCommit.delete(note.id)) throw new Error('network-before-commit');
    if (this.notes.has(note.id)) throw new Error('duplicate-id');
    this.notes.set(note.id, copy(note));
    if (this.failInsertAfterCommit.delete(note.id)) throw new Error('network-after-commit');
    return copy(note);
  }

  async update(note: LocalNote, expectedRemoteUpdatedAt: string) {
    this.updateCalls.set(note.id, (this.updateCalls.get(note.id) || 0) + 1);
    const current = this.notes.get(note.id);
    if (!current || current.updatedAt !== expectedRemoteUpdatedAt) return null;
    this.notes.set(note.id, copy(note));
    return copy(note);
  }
}

test('evolui o IndexedDB v2 sem alterar a nota legada e persiste metadados separados', async ({ page }) => {
  await page.route('http://notes.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>notes</title>' }));
  await page.goto('http://notes.test/');
  const legacy = makeNote('legacy-idb', {
    body: 'legado intacto',
    imageDataUrl: 'data:image/png;base64,aW50YWN0',
    createdAt: '2024-01-02T03:04:05.000Z',
    updatedAt: '2024-06-07T08:09:10.000Z',
  });

  await page.evaluate(async note => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('clube-do-jogo-local');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('clube-do-jogo-local', 2);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('notes', { keyPath: 'id' });
        store.createIndex('game', ['userId', 'gameId']);
        store.put(note);
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }, legacy);

  const bundle = await build({
    entryPoints: [path.resolve(process.cwd(), 'src/lib/local-notes.ts')],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    globalName: 'LocalNotesTest',
    write: false,
  });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });

  const persisted = await page.evaluate(async ({ target, expected }) => {
    const api = (globalThis as unknown as {
      LocalNotesTest: {
        loadNotes(userId: string, gameId: string): Promise<LocalNote[]>;
        saveNoteSyncMetadata(metadata: NoteSyncMetadata): Promise<void>;
        loadNoteSyncMetadata(userId: string, gameId: string): Promise<NoteSyncMetadata[]>;
      };
    }).LocalNotesTest;
    await api.saveNoteSyncMetadata({
      noteId: expected.id,
      userId: expected.userId,
      gameId: expected.gameId,
      state: 'pending',
      localHash: 'hash-separado',
    });
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('clube-do-jogo-local');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const storeNames = [...database.objectStoreNames];
    database.close();
    return {
      notes: await api.loadNotes(target.userId, target.gameId),
      metadata: await api.loadNoteSyncMetadata(target.userId, target.gameId),
      storeNames,
    };
  }, { target: context, expected: legacy });

  expect(persisted.notes).toEqual([legacy]);
  expect(persisted.metadata).toEqual([expect.objectContaining({ noteId: legacy.id, state: 'pending', localHash: 'hash-separado' })]);
  expect(persisted.storeNames.sort()).toEqual(['note-sync', 'notes']);
});

test('confirma por registro, mantém a falha parcial e faz retry idempotente', async () => {
  const first = makeNote('first');
  const second = makeNote('second', { imageDataUrl: 'data:image/png;base64,AAECAw==' });
  const local = new MemoryLocalStore([first, second]);
  const remote = new MemoryRemoteStore();
  remote.failInsertBeforeCommit.add(second.id);

  const partial = await syncNotes(context, { local, remote, now: fixedNow });

  expect(partial.summary).toEqual({ total: 2, pending: 0, synced: 1, conflicts: 0, errors: 1 });
  expect((await local.getMetadata(context.userId, first.id))?.state).toBe('synced');
  expect((await local.getMetadata(context.userId, second.id))?.state).toBe('error');
  expect(await local.listNotes(context)).toEqual([first, second]);

  const retried = await syncNotes(context, { local, remote, now: fixedNow });

  expect(retried.summary.errors).toBe(0);
  expect(retried.summary.synced).toBe(2);
  expect(remote.notes.size).toBe(2);
  expect(remote.notes.get(second.id)).toEqual(second);
  expect(remote.insertCalls.get(first.id)).toBe(1);
  expect(remote.insertCalls.get(second.id)).toBe(2);
});

test('reconcilia resposta perdida sem duplicar nem remover texto, imagem ou timestamps', async () => {
  const image = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
  const note = makeNote('lost-response', {
    body: 'texto original\nsegunda linha',
    imageDataUrl: image,
    createdAt: '2025-03-02T03:04:05.678Z',
    updatedAt: '2025-04-03T02:01:00.123Z',
  });
  const local = new MemoryLocalStore([note]);
  const remote = new MemoryRemoteStore();
  remote.failInsertAfterCommit.add(note.id);

  const result = await syncNotes(context, { local, remote, now: fixedNow });

  expect(result.summary.synced).toBe(1);
  expect(remote.insertCalls.get(note.id)).toBe(1);
  expect(remote.notes.get(note.id)).toEqual(note);
  const metadata = await local.getMetadata(context.userId, note.id);
  expect(metadata?.state).toBe('synced');
  expect(metadata?.baselineHash).toBe(noteFingerprint(note));

  await syncNotes(context, { local, remote, now: fixedNow });
  expect(remote.insertCalls.get(note.id)).toBe(1);
});

test('preserva as duas versões sem baseline e só escreve após resolução explícita', async () => {
  const localVersion = makeNote('conflict', { body: 'versão do navegador', imageDataUrl: 'data:image/png;base64,bG9jYWw=' });
  const remoteVersion = makeNote('conflict', {
    body: 'versão do celular',
    imageDataUrl: 'data:image/png;base64,cmVtb3Rl',
    updatedAt: '2026-09-02T10:00:00.000Z',
  });
  const local = new MemoryLocalStore([localVersion]);
  const remote = new MemoryRemoteStore([remoteVersion]);

  const result = await syncNotes(context, { local, remote, now: fixedNow });

  expect(result.summary.conflicts).toBe(1);
  expect(result.conflicts[0]).toMatchObject({
    kind: 'different-without-baseline',
    local: localVersion,
    remote: remoteVersion,
    resolutions: ['use-local', 'use-remote'],
  });
  expect(remote.notes.get(localVersion.id)).toEqual(remoteVersion);
  expect((await local.listNotes(context))[0]).toEqual(localVersion);
  expect(remote.updateCalls.get(localVersion.id)).toBeUndefined();

  const resolved = await resolveNoteConflict(context, localVersion.id, 'use-local', { local, remote, now: fixedNow });

  expect(resolved).toEqual(localVersion);
  expect(remote.notes.get(localVersion.id)).toEqual(localVersion);
  expect((await local.getMetadata(context.userId, localVersion.id))?.state).toBe('synced');
});

test('adota mudança remota unilateral e mantém conflito quando ambos mudaram', async () => {
  const baseline = makeNote('existing');
  const local = new MemoryLocalStore([baseline]);
  const remote = new MemoryRemoteStore([baseline]);
  await syncNotes(context, { local, remote, now: fixedNow });

  const remoteEdit = makeNote('existing', { body: 'edição remota', updatedAt: '2026-09-03T10:00:00.000Z' });
  remote.notes.set(baseline.id, remoteEdit);
  const remoteWon = await syncNotes(context, { local, remote, now: fixedNow });
  expect(remoteWon.notes).toEqual([remoteEdit]);
  expect((await local.listNotes(context))[0]).toEqual(remoteEdit);

  const localEdit = { ...remoteEdit, body: 'edição local', updatedAt: '2026-09-04T10:00:00.000Z' };
  await local.saveNote(localEdit);
  const secondRemoteEdit = { ...remoteEdit, body: 'outra edição remota', updatedAt: '2026-09-05T10:00:00.000Z' };
  remote.notes.set(baseline.id, secondRemoteEdit);

  const bothChanged = await syncNotes(context, { local, remote, now: fixedNow });
  expect(bothChanged.conflicts[0]).toMatchObject({ kind: 'both-changed', local: localEdit, remote: secondRemoteEdit });
  expect(remote.notes.get(baseline.id)).toEqual(secondRemoteEdit);
  expect((await local.listNotes(context))[0]).toEqual(localEdit);
});

test('envia edição local com compare-and-set e rejeita resolução de conflito obsoleta', async () => {
  const baseline = makeNote('guarded-update', { imageDataUrl: 'data:image/png;base64,b3JpZ2luYWw=' });
  const local = new MemoryLocalStore([baseline]);
  const remote = new MemoryRemoteStore([baseline]);
  await syncNotes(context, { local, remote, now: fixedNow });

  const localEdit = {
    ...baseline,
    body: 'edição local preservada',
    imageDataUrl: 'data:image/png;base64,ZWRpdGFkYQ==',
    updatedAt: '2026-09-06T10:00:00.000Z',
  };
  await local.saveNote(localEdit);
  const sent = await syncNotes(context, { local, remote, now: fixedNow });
  expect(sent.summary.synced).toBe(1);
  expect(remote.notes.get(baseline.id)).toEqual(localEdit);
  expect(remote.updateCalls.get(baseline.id)).toBe(1);

  const localAgain = { ...localEdit, body: 'local de novo', updatedAt: '2026-09-07T10:00:00.000Z' };
  const remoteAgain = { ...localEdit, body: 'remoto de novo', updatedAt: '2026-09-08T10:00:00.000Z' };
  await local.saveNote(localAgain);
  remote.notes.set(baseline.id, remoteAgain);
  await syncNotes(context, { local, remote, now: fixedNow });

  remote.notes.set(baseline.id, { ...remoteAgain, body: 'mudou após abrir conflito', updatedAt: '2026-09-09T10:00:00.000Z' });
  await expect(resolveNoteConflict(context, baseline.id, 'use-local', { local, remote, now: fixedNow })).rejects.toThrow(/mudou depois/);
  expect((await local.getMetadata(context.userId, baseline.id))?.state).toBe('conflict');
  expect(remote.notes.get(baseline.id)?.body).toBe('mudou após abrir conflito');
});

test('não ressuscita exclusão remota e guarda a cópia local após aceitá-la', async () => {
  const note = makeNote('deleted-remotely');
  const local = new MemoryLocalStore([note]);
  const remote = new MemoryRemoteStore([note]);
  await syncNotes(context, { local, remote, now: fixedNow });
  remote.notes.delete(note.id);

  const deleted = await syncNotes(context, { local, remote, now: fixedNow });

  expect(deleted.conflicts[0]).toMatchObject({
    kind: 'remote-deleted',
    local: note,
    resolutions: ['restore-local', 'accept-remote-deletion'],
  });
  expect(remote.insertCalls.get(note.id)).toBeUndefined();

  await resolveNoteConflict(context, note.id, 'accept-remote-deletion', { local, remote, now: fixedNow });
  expect(await local.listNotes(context)).toEqual([note]);

  const nextSession = await syncNotes(context, { local, remote, now: fixedNow });
  expect(nextSession.notes).toEqual([]);
  expect(nextSession.summary.conflicts).toBe(0);
  expect(remote.insertCalls.get(note.id)).toBeUndefined();
});

test('baixa notas em sessão nova, isola contas e preserva local durante falha de leitura', async () => {
  const remoteNote = makeNote('remote-only');
  const otherNote = makeNote('other-user', { userId: 'user-b' });
  const localOnly = makeNote('offline-local');
  const local = new MemoryLocalStore([localOnly]);
  const remote = new MemoryRemoteStore([remoteNote, otherNote]);

  const firstSession = await syncNotes(context, { local, remote, now: fixedNow });
  expect(firstSession.notes.map(note => note.id).sort()).toEqual(['offline-local', 'remote-only']);
  expect((await local.listNotes(context)).map(note => note.id).sort()).toEqual(['offline-local', 'remote-only']);
  expect(firstSession.notes).not.toContainEqual(otherNote);

  remote.failList = true;
  const offline = await syncNotes(context, { local, remote, now: fixedNow });
  expect(offline.remoteReadError).toBe('offline');
  expect(offline.notes.map(note => note.id).sort()).toEqual(['offline-local', 'remote-only']);
  expect(await local.listNotes(context)).toHaveLength(2);
});
