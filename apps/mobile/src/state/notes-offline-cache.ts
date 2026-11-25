import type { LocalNote } from '@clube-do-jogo/domain';
import { identityScope } from '../hooks/mobile-preferences-core';
import type { NoteConflictsByNoteId, PendingNotesQueue } from './notes-queue';

const NOTES_CACHE_PREFIX = '@clube-do-jogo/notes-synced-cache';
const NOTES_CACHE_VERSION = 1;

export interface NotesOfflineCache {
  notes: LocalNote[];
  savedAt: string;
}

export function notesCacheKey(
  userId: string,
  isDemo: boolean,
  sessionEpoch: number,
  gameId: string,
  snapshotMonth: string | null,
): string {
  const snapshot = snapshotMonth ? `snapshot-${encodeURIComponent(snapshotMonth)}` : 'current';
  return `${NOTES_CACHE_PREFIX}/${identityScope(userId, isDemo, sessionEpoch)}/${encodeURIComponent(gameId)}/${snapshot}`;
}

function isCachedNote(value: unknown, gameId: string, userId: string): value is LocalNote {
  if (!value || typeof value !== 'object') return false;
  const note = value as Partial<LocalNote>;
  return typeof note.id === 'string' && note.userId === userId && note.gameId === gameId
    && typeof note.body === 'string' && typeof note.createdAt === 'string' && typeof note.updatedAt === 'string'
    && (note.imageDataUrl === undefined || typeof note.imageDataUrl === 'string');
}

export function serializeNotesCache(notes: readonly LocalNote[], savedAt: string): string {
  return JSON.stringify({ version: NOTES_CACHE_VERSION, savedAt, notes });
}

export function parseNotesCache(value: string | null, scope: { gameId: string; userId: string }): NotesOfflineCache | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { version?: unknown; savedAt?: unknown; notes?: unknown };
    if (!parsed || parsed.version !== NOTES_CACHE_VERSION || typeof parsed.savedAt !== 'string' || !Array.isArray(parsed.notes)) return null;
    const notes = parsed.notes.filter((note): note is LocalNote => isCachedNote(note, scope.gameId, scope.userId));
    return { notes, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

export type NotesSyncState = 'synced' | 'syncing' | 'pending' | 'conflict' | 'error' | 'offline';

export interface NotesSyncSummary {
  state: NotesSyncState;
  synced: number;
  pending: number;
  conflicts: number;
  failed: number;
  fromCache: boolean;
  canRetry: boolean;
}

export function summarizeNotesSync(input: {
  confirmed: readonly LocalNote[];
  queue: PendingNotesQueue;
  conflicts: NoteConflictsByNoteId;
  serverError: boolean;
  fromCache: boolean;
  fetching: boolean;
}): NotesSyncSummary {
  const synced = input.confirmed.filter(note => !input.queue.has(note.id)).length;
  const conflicts = input.conflicts.size;
  let pending = 0;
  let failed = 0;
  for (const [noteId, entry] of input.queue) {
    if (input.conflicts.has(noteId)) continue;
    pending += 1;
    if (entry.lastError) failed += 1;
  }
  let state: NotesSyncState;
  if (conflicts > 0) state = 'conflict';
  else if (input.serverError && !input.fromCache) state = 'error';
  else if (input.fromCache) state = 'offline';
  else if (failed > 0) state = 'error';
  else if (input.fetching && pending === 0) state = 'syncing';
  else if (pending > 0) state = 'pending';
  else state = 'synced';
  return {
    state,
    synced,
    pending,
    conflicts,
    failed,
    fromCache: input.fromCache,
    canRetry: state !== 'synced' && state !== 'syncing',
  };
}
