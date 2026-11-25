import type { LocalNote } from '@clube-do-jogo/domain';

export interface PendingLocalNote {
  note: LocalNote;
  origin: 'create' | 'update';
  expectedUpdatedAt?: string;
  generation: number;
  lastAttemptAt?: string;
  lastError?: string;
}

export type NoteConflict =
  | { kind: 'changed'; local: LocalNote; remote: LocalNote }
  | { kind: 'deleted'; local: LocalNote };

export type PendingNotesQueue = ReadonlyMap<string, PendingLocalNote>;
export type NoteConflictsByNoteId = ReadonlyMap<string, NoteConflict>;

export function createQueue(): PendingNotesQueue {
  return new Map();
}

export function createConflicts(): NoteConflictsByNoteId {
  return new Map();
}

export function enqueue(queue: PendingNotesQueue, entry: PendingLocalNote): PendingNotesQueue {
  const next = new Map(queue);
  next.set(entry.note.id, entry);
  return next;
}

export function dequeue(queue: PendingNotesQueue, noteId: string): PendingNotesQueue {
  if (!queue.has(noteId)) return queue;
  const next = new Map(queue);
  next.delete(noteId);
  return next;
}

export function markAttempt(queue: PendingNotesQueue, noteId: string, lastError?: string): PendingNotesQueue {
  const current = queue.get(noteId);
  if (!current) return queue;
  const next = new Map(queue);
  next.set(noteId, { ...current, generation: current.generation + 1, lastAttemptAt: new Date().toISOString(), lastError });
  return next;
}

export function markConflict(conflicts: NoteConflictsByNoteId, noteId: string, conflict: NoteConflict): NoteConflictsByNoteId {
  const next = new Map(conflicts);
  next.set(noteId, conflict);
  return next;
}

export function clearConflict(conflicts: NoteConflictsByNoteId, noteId: string): NoteConflictsByNoteId {
  if (!conflicts.has(noteId)) return conflicts;
  const next = new Map(conflicts);
  next.delete(noteId);
  return next;
}

export function summarize(queue: PendingNotesQueue, conflicts: NoteConflictsByNoteId) {
  return { pending: queue.size, conflicts: conflicts.size };
}

export function mergePendingIntoList(notes: readonly LocalNote[], queue: PendingNotesQueue): LocalNote[] {
  if (queue.size === 0) return notes.slice();
  const confirmedIds = new Set(notes.map(note => note.id));
  const pendingOnly = Array.from(queue.values())
    .map(entry => entry.note)
    .filter(note => !confirmedIds.has(note.id));
  return [...notes, ...pendingOnly].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

function isLocalNoteLike(value: unknown): value is LocalNote {
  if (!value || typeof value !== 'object') return false;
  const note = value as Partial<LocalNote>;
  return typeof note.id === 'string' && typeof note.userId === 'string' && typeof note.gameId === 'string'
    && typeof note.body === 'string' && typeof note.createdAt === 'string' && typeof note.updatedAt === 'string'
    && (note.imageDataUrl === undefined || typeof note.imageDataUrl === 'string');
}

function recoverPendingLocalNote(value: unknown): PendingLocalNote | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Partial<PendingLocalNote>;
  if (!isLocalNoteLike(entry.note)) return null;
  const canUpdate = entry.origin === 'update' && typeof entry.expectedUpdatedAt === 'string' && entry.expectedUpdatedAt.trim().length > 0;
  return {
    note: entry.note,
    origin: canUpdate ? 'update' : 'create',
    expectedUpdatedAt: canUpdate ? entry.expectedUpdatedAt : undefined,
    generation: typeof entry.generation === 'number' ? entry.generation : 0,
    lastAttemptAt: typeof entry.lastAttemptAt === 'string' ? entry.lastAttemptAt : undefined,
    lastError: typeof entry.lastError === 'string' ? entry.lastError : undefined,
  };
}

export function serializeQueue(queue: PendingNotesQueue): string {
  return JSON.stringify(Array.from(queue.values()));
}

export interface ParsedQueue {
  queue: PendingNotesQueue;
  unrecoverableCount: number;
}

export function parseQueue(value: string | null): ParsedQueue {
  if (!value) return { queue: createQueue(), unrecoverableCount: 0 };
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error('A fila de anotações pendentes está corrompida.');
  const entries: [string, PendingLocalNote][] = [];
  let unrecoverableCount = 0;
  for (const item of parsed) {
    const recovered = recoverPendingLocalNote(item);
    if (recovered) entries.push([recovered.note.id, recovered]);
    else unrecoverableCount += 1;
  }
  return { queue: new Map(entries), unrecoverableCount };
}

export interface FlushGate {
  begin(noteId: string): boolean;
  finish(noteId: string): boolean;
  isFlushing(noteId: string): boolean;
}

export function createFlushGate(): FlushGate {
  const flushing = new Set<string>();
  const rerun = new Set<string>();
  return {
    begin(noteId) {
      if (flushing.has(noteId)) {
        rerun.add(noteId);
        return false;
      }
      flushing.add(noteId);
      return true;
    },
    finish(noteId) {
      flushing.delete(noteId);
      return rerun.delete(noteId);
    },
    isFlushing(noteId) {
      return flushing.has(noteId);
    },
  };
}
