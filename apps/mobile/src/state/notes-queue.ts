import type { LocalNote } from '@clube-do-jogo/domain';

// A local note that was submitted (create or update) but not yet confirmed
// by the server. `generation` lets a caller discard an out-of-order network
// response the same way `sessionEpoch` already discards stale session work
// in discussion-queries.ts.
export interface PendingLocalNote {
  note: LocalNote;
  origin: 'create' | 'update';
  expectedUpdatedAt?: string;
  generation: number;
  lastAttemptAt?: string;
  lastError?: string;
}

// Discriminated by `kind` so a `deleted` conflict cannot carry a `remote`
// value: there is nothing remote left to show once the server has deleted
// the note.
export type NoteConflict =
  | { kind: 'changed'; local: LocalNote; remote: LocalNote }
  | { kind: 'deleted'; local: LocalNote };

// One slot per note id, not one slot per game. This is the shape change that
// lets two distinct notes in the same game stay pending at the same time
// instead of overwriting each other's draft.
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

// Notes still in the queue haven't been confirmed by the server and won't
// show up in the React Query cache yet, so the composer list merges them in
// by id instead of duplicating them once the confirmed row lands.
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

// Recovers as much of a stored entry as the payload allows instead of
// discarding it whole. The note itself (id, body, image) is what the user
// actually typed and hit send on, so it is kept whenever it parses, even if
// the sync metadata around it (origin, expectedUpdatedAt) is missing or from
// an older format. A downgraded 'update' that lost its expectedUpdatedAt
// falls back to 'create': that path already re-reads the remote row and, if
// the content matches, returns it instead of duplicating (packages/data/src/
// notes.ts createNote, matchesSavedNote), and raises the existing
// NotesConflictError('changed', existing) if it does not, so this device
// still asks the user rather than silently overwriting or duplicating.
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

// A single JSON blob under one AsyncStorage key, not one key per note: the
// platform has no cross-key transaction, so a process death mid-write must
// never leave the queue split across keys that can drift out of sync.
export function serializeQueue(queue: PendingNotesQueue): string {
  return JSON.stringify(Array.from(queue.values()));
}

export interface ParsedQueue {
  queue: PendingNotesQueue;
  // Entries whose `note` payload itself didn't parse: there is no text left
  // to recover for these, so the caller must show this count rather than
  // pretend the queue is intact.
  unrecoverableCount: number;
}

// Malformed input never silently empties the whole queue: unlike the
// composition draft (fine to lose, it's only what's being typed right now),
// this holds notes the user already hit send on and considers saved. A
// corrupt top-level blob throws instead of resolving to an empty queue, and
// an individual entry that fails to parse is dropped from the result without
// taking any of the other valid entries down with it.
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
