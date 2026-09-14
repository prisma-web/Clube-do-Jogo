import type { SupabaseClient } from '@supabase/supabase-js';
import type { LocalNote } from './types';
import {
  getNoteSyncMetadata,
  loadNotes,
  loadNoteSyncMetadata,
  saveNote,
  saveNoteSyncMetadata,
  type NoteConflictKind,
  type NoteSyncMetadata,
} from './local-notes';

export interface NotesSyncContext {
  userId: string;
  gameId: string;
}

export interface NotesLocalStore {
  listNotes(context: NotesSyncContext): Promise<LocalNote[]>;
  saveNote(note: LocalNote): Promise<void>;
  listMetadata(context: NotesSyncContext): Promise<NoteSyncMetadata[]>;
  getMetadata(userId: string, noteId: string): Promise<NoteSyncMetadata | undefined>;
  saveMetadata(metadata: NoteSyncMetadata): Promise<void>;
}

export interface NotesRemoteStore {
  list(context: NotesSyncContext): Promise<LocalNote[]>;
  get(context: NotesSyncContext, noteId: string): Promise<LocalNote | null>;
  insert(note: LocalNote): Promise<LocalNote>;
  update(note: LocalNote, expectedRemoteUpdatedAt: string): Promise<LocalNote | null>;
}

export interface NotesSyncStores {
  local?: NotesLocalStore;
  remote: NotesRemoteStore;
  now?: () => string;
}

export type NotesConflictResolution = 'use-local' | 'use-remote' | 'restore-local' | 'accept-remote-deletion';

export interface NotesSyncConflict {
  noteId: string;
  kind: NoteConflictKind;
  local: LocalNote;
  remote?: LocalNote;
  resolutions: NotesConflictResolution[];
}

export interface NotesSyncItem {
  noteId: string;
  status: 'pending' | 'synced' | 'conflict' | 'error';
  source: 'local' | 'remote' | 'both';
  error?: string;
}

export interface NotesSyncResult {
  notes: LocalNote[];
  items: NotesSyncItem[];
  conflicts: NotesSyncConflict[];
  summary: {
    total: number;
    pending: number;
    synced: number;
    conflicts: number;
    errors: number;
  };
  remoteReadError?: string;
}

interface SyncOneResult {
  note?: LocalNote;
  item: NotesSyncItem;
  conflict?: NotesSyncConflict;
}

const indexedDbNotesStore: NotesLocalStore = {
  listNotes: context => loadNotes(context.userId, context.gameId),
  saveNote,
  listMetadata: context => loadNoteSyncMetadata(context.userId, context.gameId),
  getMetadata: getNoteSyncMetadata,
  saveMetadata: saveNoteSyncMetadata,
};

function normalizedTimestamp(value: string) {
  const milliseconds = Date.parse(value);
  return Number.isNaN(milliseconds) ? value : new Date(milliseconds).toISOString();
}

function canonicalNote(note: LocalNote) {
  return JSON.stringify([
    note.id,
    note.userId,
    note.gameId,
    note.body,
    note.imageDataUrl ?? null,
    normalizedTimestamp(note.createdAt),
    normalizedTimestamp(note.updatedAt),
  ]);
}

export function noteFingerprint(note: LocalNote) {
  const input = canonicalNote(note);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `v1:${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}:${input.length}`;
}

function notesMatch(left: LocalNote, right: LocalNote) {
  return noteFingerprint(left) === noteFingerprint(right);
}

function assertScope(note: LocalNote, context: NotesSyncContext) {
  if (note.userId !== context.userId || note.gameId !== context.gameId) {
    throw new Error(`Anotação ${note.id} fora do usuário ou jogo da sincronização.`);
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return String(error || 'Falha desconhecida ao sincronizar a anotação.');
}

function conflictResolutions(kind: NoteConflictKind): NotesConflictResolution[] {
  return kind === 'remote-deleted'
    ? ['restore-local', 'accept-remote-deletion']
    : ['use-local', 'use-remote'];
}

function toConflict(local: LocalNote, kind: NoteConflictKind, remote?: LocalNote): NotesSyncConflict {
  return {
    noteId: local.id,
    kind,
    local,
    remote,
    resolutions: conflictResolutions(kind),
  };
}

async function markConfirmed(
  localStore: NotesLocalStore,
  note: LocalNote,
  confirmedRemote: LocalNote,
  now: string,
) {
  assertScope(confirmedRemote, { userId: note.userId, gameId: note.gameId });
  if (!notesMatch(note, confirmedRemote)) {
    throw new Error(`O servidor não confirmou integralmente a anotação ${note.id}.`);
  }
  await localStore.saveMetadata({
    noteId: note.id,
    userId: note.userId,
    gameId: note.gameId,
    state: 'synced',
    localHash: noteFingerprint(note),
    baselineHash: noteFingerprint(confirmedRemote),
    baselineUpdatedAt: confirmedRemote.updatedAt,
    attemptedAt: now,
    confirmedAt: now,
  });
}

async function markPending(
  localStore: NotesLocalStore,
  note: LocalNote,
  previous: NoteSyncMetadata | undefined,
  now: string,
) {
  await localStore.saveMetadata({
    ...previous,
    noteId: note.id,
    userId: note.userId,
    gameId: note.gameId,
    state: 'pending',
    localHash: noteFingerprint(note),
    attemptedAt: now,
    lastError: undefined,
    conflict: undefined,
  });
}

async function persistConflict(
  localStore: NotesLocalStore,
  local: LocalNote,
  kind: NoteConflictKind,
  remote: LocalNote | undefined,
  previous: NoteSyncMetadata | undefined,
  now: string,
) {
  await localStore.saveMetadata({
    noteId: local.id,
    userId: local.userId,
    gameId: local.gameId,
    state: 'conflict',
    localHash: noteFingerprint(local),
    baselineHash: previous?.baselineHash,
    baselineUpdatedAt: previous?.baselineUpdatedAt,
    attemptedAt: now,
    confirmedAt: previous?.confirmedAt,
    conflict: { kind, detectedAt: now, remote },
  });
  return toConflict(local, kind, remote);
}

async function markError(
  localStore: NotesLocalStore,
  local: LocalNote,
  previous: NoteSyncMetadata | undefined,
  error: unknown,
  now: string,
) {
  const message = errorMessage(error);
  try {
    await localStore.saveMetadata({
      ...previous,
      noteId: local.id,
      userId: local.userId,
      gameId: local.gameId,
      state: 'error',
      localHash: noteFingerprint(local),
      attemptedAt: now,
      lastError: message,
    });
  } catch {
  }
  return message;
}

async function syncOne(
  context: NotesSyncContext,
  local: LocalNote | undefined,
  remote: LocalNote | undefined,
  metadata: NoteSyncMetadata | undefined,
  stores: Required<Pick<NotesSyncStores, 'remote'>> & { local: NotesLocalStore; now: string },
): Promise<SyncOneResult> {
  const source = local && remote ? 'both' : local ? 'local' : 'remote';

  if ((local && (local.userId !== context.userId || local.gameId !== context.gameId))
    || (remote && (remote.userId !== context.userId || remote.gameId !== context.gameId))) {
    const noteId = local?.id || remote?.id || 'desconhecida';
    return {
      item: {
        noteId,
        status: 'error',
        source,
        error: `Anotação ${noteId} fora do usuário ou jogo da sincronização.`,
      },
    };
  }

  try {
    if (local) assertScope(local, context);
    if (remote) assertScope(remote, context);

    if (!local && remote) {
      await stores.local.saveNote(remote);
      await markConfirmed(stores.local, remote, remote, stores.now);
      return { note: remote, item: { noteId: remote.id, status: 'synced', source } };
    }

    if (!local) throw new Error('Metadado órfão sem nota local ou remota.');

    const localHash = noteFingerprint(local);
    if (!remote) {
      if (metadata?.state === 'accepted-remote-deletion' && metadata.localHash === localHash) {
        return { item: { noteId: local.id, status: 'synced', source } };
      }

      if (metadata?.baselineHash) {
        const conflict = await persistConflict(stores.local, local, 'remote-deleted', undefined, metadata, stores.now);
        return { note: local, item: { noteId: local.id, status: 'conflict', source }, conflict };
      }

      try {
        await markPending(stores.local, local, metadata, stores.now);
        const inserted = await stores.remote.insert(local);
        await markConfirmed(stores.local, local, inserted, stores.now);
        return { note: local, item: { noteId: local.id, status: 'synced', source } };
      } catch (insertError) {
        let found: LocalNote | null;
        try {
          found = await stores.remote.get(context, local.id);
        } catch {
          throw insertError;
        }
        if (found) {
          assertScope(found, context);
          if (notesMatch(local, found)) {
            await markConfirmed(stores.local, local, found, stores.now);
            return { note: local, item: { noteId: local.id, status: 'synced', source } };
          }
          const conflict = await persistConflict(stores.local, local, 'different-without-baseline', found, metadata, stores.now);
          return { note: local, item: { noteId: local.id, status: 'conflict', source: 'both' }, conflict };
        }
        throw insertError;
      }
    }

    const remoteHash = noteFingerprint(remote);
    if (localHash === remoteHash) {
      await markConfirmed(stores.local, local, remote, stores.now);
      return { note: local, item: { noteId: local.id, status: 'synced', source } };
    }

    if (!metadata?.baselineHash) {
      const conflict = await persistConflict(stores.local, local, 'different-without-baseline', remote, metadata, stores.now);
      return { note: local, item: { noteId: local.id, status: 'conflict', source }, conflict };
    }

    const localChanged = localHash !== metadata.baselineHash;
    const remoteChanged = remoteHash !== metadata.baselineHash;

    if (!localChanged && remoteChanged) {
      await stores.local.saveNote(remote);
      await markConfirmed(stores.local, remote, remote, stores.now);
      return { note: remote, item: { noteId: remote.id, status: 'synced', source } };
    }

    if (localChanged && !remoteChanged) {
      await markPending(stores.local, local, metadata, stores.now);
      const updated = await stores.remote.update(local, remote.updatedAt);
      if (updated) {
        await markConfirmed(stores.local, local, updated, stores.now);
        return { note: local, item: { noteId: local.id, status: 'synced', source } };
      }

      const current = await stores.remote.get(context, local.id);
      if (!current) {
        const conflict = await persistConflict(stores.local, local, 'remote-deleted', undefined, metadata, stores.now);
        return { note: local, item: { noteId: local.id, status: 'conflict', source: 'local' }, conflict };
      }
      assertScope(current, context);
      if (notesMatch(local, current)) {
        await markConfirmed(stores.local, local, current, stores.now);
        return { note: local, item: { noteId: local.id, status: 'synced', source } };
      }
      const conflict = await persistConflict(stores.local, local, 'both-changed', current, metadata, stores.now);
      return { note: local, item: { noteId: local.id, status: 'conflict', source }, conflict };
    }

    const conflict = await persistConflict(stores.local, local, 'both-changed', remote, metadata, stores.now);
    return { note: local, item: { noteId: local.id, status: 'conflict', source }, conflict };
  } catch (error) {
    const recoverable = local || remote;
    if (!recoverable) throw error;
    const message = local
      ? await markError(stores.local, local, metadata, error, stores.now)
      : errorMessage(error);
    return {
      note: recoverable,
      item: { noteId: recoverable.id, status: 'error', source, error: message },
    };
  }
}

function buildResult(results: SyncOneResult[], remoteReadError?: string): NotesSyncResult {
  const items = results.map(result => result.item);
  return {
    notes: results.flatMap(result => result.note ? [result.note] : []).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    items,
    conflicts: results.flatMap(result => result.conflict ? [result.conflict] : []),
    summary: {
      total: items.length,
      pending: items.filter(item => item.status === 'pending').length,
      synced: items.filter(item => item.status === 'synced').length,
      conflicts: items.filter(item => item.status === 'conflict').length,
      errors: items.filter(item => item.status === 'error').length,
    },
    remoteReadError,
  };
}

export async function syncNotes(context: NotesSyncContext, stores: NotesSyncStores): Promise<NotesSyncResult> {
  const localStore = stores.local || indexedDbNotesStore;
  const now = (stores.now || (() => new Date().toISOString()))();
  const [localNotes, metadataRecords] = await Promise.all([
    localStore.listNotes(context),
    localStore.listMetadata(context),
  ]);

  let remoteNotes: LocalNote[];
  try {
    remoteNotes = await stores.remote.list(context);
    for (const note of remoteNotes) assertScope(note, context);
  } catch (error) {
    const results = localNotes
      .filter(note => note.userId === context.userId && note.gameId === context.gameId)
      .map<SyncOneResult>(note => {
        const metadata = metadataRecords.find(record => record.noteId === note.id);
        if (metadata?.state === 'accepted-remote-deletion') {
          return { item: { noteId: note.id, status: 'synced', source: 'local' } };
        }
        if (metadata?.state === 'conflict' && metadata.conflict) {
          return {
            note,
            item: { noteId: note.id, status: 'conflict', source: metadata.conflict.remote ? 'both' : 'local' },
            conflict: toConflict(note, metadata.conflict.kind, metadata.conflict.remote),
          };
        }
        return {
          note,
          item: { noteId: note.id, status: 'error', source: 'local', error: errorMessage(error) },
        };
      });
    return buildResult(results, errorMessage(error));
  }

  const localById = new Map(localNotes.map(note => [note.id, note]));
  const remoteById = new Map(remoteNotes.map(note => [note.id, note]));
  const metadataById = new Map(metadataRecords.map(metadata => [metadata.noteId, metadata]));
  const ids = [...new Set([...localById.keys(), ...remoteById.keys()])];
  const results = await Promise.all(ids.map(id => syncOne(
    context,
    localById.get(id),
    remoteById.get(id),
    metadataById.get(id),
    { local: localStore, remote: stores.remote, now },
  )));
  return buildResult(results);
}

export class StaleNoteConflictError extends Error {
  constructor(noteId: string) {
    super(`A anotação ${noteId} mudou depois que o conflito foi exibido. Sincronize novamente.`);
    this.name = 'StaleNoteConflictError';
  }
}

export async function resolveNoteConflict(
  context: NotesSyncContext,
  noteId: string,
  resolution: NotesConflictResolution,
  stores: NotesSyncStores,
): Promise<LocalNote | null> {
  const localStore = stores.local || indexedDbNotesStore;
  const now = (stores.now || (() => new Date().toISOString()))();
  const [localNotes, metadata, currentRemote] = await Promise.all([
    localStore.listNotes(context),
    localStore.getMetadata(context.userId, noteId),
    stores.remote.get(context, noteId),
  ]);
  const local = localNotes.find(note => note.id === noteId);
  if (!local || metadata?.state !== 'conflict' || !metadata.conflict) {
    throw new Error(`Não existe conflito pendente para a anotação ${noteId}.`);
  }
  assertScope(local, context);
  if (currentRemote) assertScope(currentRemote, context);
  const kind = metadata.conflict.kind;

  if (resolution === 'accept-remote-deletion') {
    if (kind !== 'remote-deleted' || currentRemote) throw new StaleNoteConflictError(noteId);
    await localStore.saveMetadata({
      ...metadata,
      state: 'accepted-remote-deletion',
      localHash: noteFingerprint(local),
      attemptedAt: now,
      confirmedAt: now,
      lastError: undefined,
      conflict: undefined,
    });
    return null;
  }

  if (resolution === 'restore-local') {
    if (kind !== 'remote-deleted' || currentRemote) throw new StaleNoteConflictError(noteId);
    let inserted: LocalNote;
    try {
      inserted = await stores.remote.insert(local);
    } catch (error) {
      const found = await stores.remote.get(context, noteId);
      if (!found || !notesMatch(local, found)) throw error;
      inserted = found;
    }
    await markConfirmed(localStore, local, inserted, now);
    return local;
  }

  if (kind === 'remote-deleted' || !metadata.conflict.remote || !currentRemote) {
    throw new StaleNoteConflictError(noteId);
  }
  if (!notesMatch(metadata.conflict.remote, currentRemote)) throw new StaleNoteConflictError(noteId);

  if (resolution === 'use-remote') {
    await localStore.saveNote(currentRemote);
    await markConfirmed(localStore, currentRemote, currentRemote, now);
    return currentRemote;
  }

  if (resolution !== 'use-local') throw new Error(`Resolução inválida para a anotação ${noteId}.`);
  const updated = await stores.remote.update(local, currentRemote.updatedAt);
  if (!updated) throw new StaleNoteConflictError(noteId);
  await markConfirmed(localStore, local, updated, now);
  return local;
}

export async function rememberConfirmedNote(
  note: LocalNote,
  confirmedRemote: LocalNote,
  localStore: NotesLocalStore = indexedDbNotesStore,
  now = new Date().toISOString(),
) {
  if (!notesMatch(note, confirmedRemote)) {
    throw new Error(`O servidor não confirmou integralmente a anotação ${note.id}.`);
  }
  await localStore.saveNote(note);
  await markConfirmed(localStore, note, confirmedRemote, now);
}

export async function rememberConfirmedDeletion(
  context: NotesSyncContext,
  noteId: string,
  localStore: NotesLocalStore = indexedDbNotesStore,
  now = new Date().toISOString(),
) {
  const [notes, previous] = await Promise.all([
    localStore.listNotes(context),
    localStore.getMetadata(context.userId, noteId),
  ]);
  const local = notes.find(note => note.id === noteId);
  if (!local) return;
  await localStore.saveMetadata({
    ...previous,
    noteId,
    userId: context.userId,
    gameId: context.gameId,
    state: 'accepted-remote-deletion',
    localHash: noteFingerprint(local),
    baselineHash: previous?.baselineHash || noteFingerprint(local),
    baselineUpdatedAt: previous?.baselineUpdatedAt || local.updatedAt,
    attemptedAt: now,
    confirmedAt: now,
    lastError: undefined,
    conflict: undefined,
  });
}

interface GameNoteRow {
  id: string;
  user_id: string;
  game_id: string;
  body: string;
  image_data_url: string | null;
  created_at: string;
  updated_at: string;
}

function fromGameNoteRow(row: GameNoteRow): LocalNote {
  return {
    id: row.id,
    userId: row.user_id,
    gameId: row.game_id,
    body: row.body,
    imageDataUrl: row.image_data_url || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toGameNoteRow(note: LocalNote): GameNoteRow {
  return {
    id: note.id,
    user_id: note.userId,
    game_id: note.gameId,
    body: note.body,
    image_data_url: note.imageDataUrl || null,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
  };
}

function throwIfSupabaseError(error: { message?: string } | null) {
  if (error) throw new Error(error.message || 'Falha do Supabase ao sincronizar anotação.');
}

export function createSupabaseNotesRemote(supabase: SupabaseClient): NotesRemoteStore {
  return {
    async list(context) {
      const rows: GameNoteRow[] = [];
      const pageSize = 500;
      for (let start = 0; ; start += pageSize) {
        const { data, error } = await supabase
          .from('game_notes')
          .select('*')
          .eq('user_id', context.userId)
          .eq('game_id', context.gameId)
          .order('created_at')
          .order('id')
          .range(start, start + pageSize - 1);
        throwIfSupabaseError(error);
        const page = (data || []) as GameNoteRow[];
        rows.push(...page);
        if (page.length < pageSize) break;
      }
      return rows.map(fromGameNoteRow);
    },
    async get(context, noteId) {
      const { data, error } = await supabase
        .from('game_notes')
        .select('*')
        .eq('id', noteId)
        .eq('user_id', context.userId)
        .eq('game_id', context.gameId)
        .maybeSingle();
      throwIfSupabaseError(error);
      return data ? fromGameNoteRow(data as GameNoteRow) : null;
    },
    async insert(note) {
      const { data, error } = await supabase
        .from('game_notes')
        .insert(toGameNoteRow(note))
        .select('*')
        .single();
      throwIfSupabaseError(error);
      return fromGameNoteRow(data as GameNoteRow);
    },
    async update(note, expectedRemoteUpdatedAt) {
      const changes = {
        body: note.body,
        image_data_url: note.imageDataUrl || null,
        created_at: note.createdAt,
        updated_at: note.updatedAt,
      };
      const { data, error } = await supabase
        .from('game_notes')
        .update(changes)
        .eq('id', note.id)
        .eq('user_id', note.userId)
        .eq('game_id', note.gameId)
        .eq('updated_at', expectedRemoteUpdatedAt)
        .select('*');
      throwIfSupabaseError(error);
      const rows = (data || []) as GameNoteRow[];
      return rows[0] ? fromGameNoteRow(rows[0]) : null;
    },
  };
}
