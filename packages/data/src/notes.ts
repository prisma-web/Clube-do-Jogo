import type { SupabaseClient } from '@supabase/supabase-js';
import type { LocalNote } from '@clube-do-jogo/domain';
import type { DataScope } from './client';
import { DataError, withDataErrors } from './errors';

export interface NotesQuery extends DataScope {
  gameId: string;
  snapshotMonth?: string | null;
}

export interface NewNoteInput extends DataScope {
  note: LocalNote;
  historical?: boolean;
}

export interface NoteUpdateInput extends NewNoteInput {
  expectedUpdatedAt: string;
}

export interface NoteDeleteInput extends DataScope {
  gameId: string;
  noteId: string;
  expectedUpdatedAt?: string;
  historical?: boolean;
}

export interface NotesClient {
  read(input: NotesQuery): Promise<LocalNote[]>;
  create(input: NewNoteInput): Promise<LocalNote>;
  update(input: NoteUpdateInput): Promise<LocalNote>;
  remove(input: NoteDeleteInput): Promise<void>;
  readNotes(input: NotesQuery): Promise<LocalNote[]>;
  createNote(input: NewNoteInput): Promise<LocalNote>;
  updateNote(input: NoteUpdateInput): Promise<LocalNote>;
  deleteNote(input: NoteDeleteInput): Promise<void>;
}

export class NotesConflictError extends DataError {
  readonly kind: 'changed' | 'deleted';
  readonly remote: LocalNote | null;

  constructor(kind: 'changed' | 'deleted', remote: LocalNote | null, cause?: unknown) {
    super(
      kind === 'changed' ? 'atualizar anotação' : 'apagar anotação',
      kind === 'changed'
        ? 'A anotação mudou no servidor. Atualize antes de salvar novamente.'
        : 'A anotação foi removida no servidor. Atualize antes de salvar novamente.',
      cause,
    );
    this.name = 'NotesConflictError';
    this.kind = kind;
    this.remote = remote;
  }
}

type NoteRow = {
  id: string;
  user_id: string;
  game_id: string;
  body: string;
  image_data_url: string | null;
  created_at: string;
  updated_at: string;
};

type SnapshotRow = Omit<NoteRow, 'id'> & { note_id: string };

function validateScope(input: DataScope & { gameId: string }, operation: string) {
  if (!input || typeof input !== 'object') throw new DataError(operation, 'O contexto da anotação é inválido.');
  if (typeof input.userId !== 'string' || !input.userId.trim()) throw new DataError(operation, 'A conta não foi informada.');
  if (typeof input.gameId !== 'string' || !input.gameId.trim()) throw new DataError(operation, 'O jogo não foi informado.');
}

function validateSnapshotMonth(month: string | null | undefined, operation: string) {
  if (month !== undefined && month !== null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new DataError(operation, 'O ciclo histórico informado é inválido.');
  }
}

function requireLive(historical: boolean | undefined, operation: string) {
  if (historical) throw new DataError(operation, 'O histórico é somente leitura.');
}

function validateNote(note: LocalNote, userId: string, gameId: string, operation: string) {
  if (!note || typeof note !== 'object') throw new DataError(operation, 'A anotação é inválida.');
  if (typeof note.id !== 'string' || !note.id.trim()) throw new DataError(operation, 'A anotação não tem identificador.');
  if (note.userId !== userId || note.gameId !== gameId) throw new DataError(operation, 'A anotação não pertence a esta conta e jogo.');
  if (typeof note.body !== 'string' || note.body.length > 10000) throw new DataError(operation, 'A anotação deve ter no máximo 10000 caracteres.');
  if (typeof note.imageDataUrl !== 'undefined' && typeof note.imageDataUrl !== 'string') throw new DataError(operation, 'A imagem da anotação é inválida.');
  if (!note.body.trim() && !note.imageDataUrl) throw new DataError(operation, 'A anotação precisa de texto ou imagem.');
  if (typeof note.createdAt !== 'string' || !note.createdAt || typeof note.updatedAt !== 'string' || !note.updatedAt) {
    throw new DataError(operation, 'Os horários da anotação são inválidos.');
  }
}

function noteFromRow(value: unknown, userId: string, gameId: string, operation: string, noteId?: string): LocalNote | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<NoteRow> & Partial<SnapshotRow>;
  const id = noteId || row.id || row.note_id;
  if (typeof id !== 'string' || typeof row.user_id !== 'string' || typeof row.game_id !== 'string'
    || typeof row.body !== 'string' || (row.image_data_url !== null && typeof row.image_data_url !== 'string')
    || typeof row.created_at !== 'string' || typeof row.updated_at !== 'string') return null;
  if (row.user_id !== userId || row.game_id !== gameId) return null;
  if (!id || !row.created_at || !row.updated_at) return null;
  const note: LocalNote = {
    id,
    userId: row.user_id,
    gameId: row.game_id,
    body: row.body,
    imageDataUrl: row.image_data_url || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  try {
    validateNote(note, userId, gameId, operation);
  } catch {
    return null;
  }
  return note;
}

function matchesSavedNote(remote: LocalNote, input: LocalNote) {
  return remote.id === input.id && remote.body === input.body && remote.imageDataUrl === input.imageDataUrl
    && Date.parse(remote.createdAt) === Date.parse(input.createdAt)
    && Date.parse(remote.updatedAt) === Date.parse(input.updatedAt);
}

function cloneNote(note: LocalNote): LocalNote {
  return { ...note };
}

async function authenticatedClient(supabase: SupabaseClient, userId: string, operation: string) {
  const auth = supabase.auth;
  if (!auth) throw new DataError(operation, 'Configure o Supabase para acessar suas anotações.');
  const { data, error } = await auth.getUser();
  if (error) throw error;
  if (!data.user || data.user.id !== userId) throw new DataError(operation, 'Sua sessão não está autorizada para essa operação.');
  return supabase;
}

async function readRemote(supabase: SupabaseClient, input: NotesQuery) {
  const client = await authenticatedClient(supabase, input.userId, 'ler anotações');
  validateSnapshotMonth(input.snapshotMonth, 'ler anotações');
  if (input.snapshotMonth) {
    const { data, error } = await client.from('cycle_note_snapshots').select('*')
      .eq('user_id', input.userId).eq('game_id', input.gameId).eq('cycle_month', input.snapshotMonth)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(row => noteFromRow(row, input.userId, input.gameId, 'ler anotações')).filter((note): note is LocalNote => Boolean(note));
  }
  const { data, error } = await client.from('game_notes').select('*')
    .eq('user_id', input.userId).eq('game_id', input.gameId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(row => noteFromRow(row, input.userId, input.gameId, 'ler anotações')).filter((note): note is LocalNote => Boolean(note));
}

async function readRemoteById(supabase: SupabaseClient, input: DataScope & { gameId: string; noteId: string }) {
  const client = await authenticatedClient(supabase, input.userId, 'ler anotação');
  const { data, error } = await client.from('game_notes').select('*')
    .eq('id', input.noteId).eq('user_id', input.userId).eq('game_id', input.gameId).maybeSingle();
  if (error) throw error;
  return noteFromRow(data, input.userId, input.gameId, 'ler anotação');
}

class DemoNotesStore {
  private readonly notes = new Map<string, LocalNote[]>();

  private key(userId: string, gameId: string) {
    return `${userId}:${gameId}`;
  }

  read(input: NotesQuery) {
    return (this.notes.get(this.key(input.userId, input.gameId)) || []).map(cloneNote);
  }

  create(input: NewNoteInput) {
    validateNote(input.note, input.userId, input.note.gameId, 'criar anotação');
    const key = this.key(input.userId, input.note.gameId);
    const current = this.notes.get(key) || [];
    const existing = current.find(note => note.id === input.note.id);
    if (existing) {
      if (matchesSavedNote(existing, input.note)) return cloneNote(existing);
      throw new NotesConflictError('changed', cloneNote(existing));
    }
    current.push(cloneNote(input.note));
    this.notes.set(key, current);
    return cloneNote(input.note);
  }

  update(input: NoteUpdateInput) {
    validateNote(input.note, input.userId, input.note.gameId, 'atualizar anotação');
    const key = this.key(input.userId, input.note.gameId);
    const current = this.notes.get(key) || [];
    const index = current.findIndex(note => note.id === input.note.id);
    if (index < 0) throw new NotesConflictError('deleted', null);
    if (current[index].updatedAt !== input.expectedUpdatedAt) throw new NotesConflictError('changed', cloneNote(current[index]));
    current[index] = cloneNote(input.note);
    return cloneNote(current[index]);
  }

  remove(input: NoteDeleteInput) {
    const key = this.key(input.userId, input.gameId);
    const current = this.notes.get(key) || [];
    const index = current.findIndex(note => note.id === input.noteId);
    if (index < 0) {
      if (input.expectedUpdatedAt) throw new NotesConflictError('deleted', null);
      return;
    }
    if (input.expectedUpdatedAt && current[index].updatedAt !== input.expectedUpdatedAt) throw new NotesConflictError('changed', cloneNote(current[index]));
    current.splice(index, 1);
  }
}

export function createNotesClient(options: { supabase?: SupabaseClient | null; demo?: boolean } = {}): NotesClient {
  const demo = options.demo === true;
  const demoStore = demo ? new DemoNotesStore() : null;
  const read = (input: NotesQuery) => {
    validateScope(input, 'ler anotações');
    validateSnapshotMonth(input.snapshotMonth, 'ler anotações');
    if (demo) return Promise.resolve(demoStore!.read(input));
    if (!options.supabase) return Promise.reject(new DataError('ler anotações', 'Configure o Supabase para acessar suas anotações.'));
    return withDataErrors('ler anotações', 'Não foi possível carregar suas anotações.', () => readRemote(options.supabase as SupabaseClient, input));
  };
  const create = async (input: NewNoteInput) => {
    validateScope({ ...input, gameId: input.note?.gameId || '' }, 'criar anotação');
    requireLive(input.historical, 'criar anotação');
    validateNote(input.note, input.userId, input.note?.gameId || '', 'criar anotação');
    if (demo) return demoStore!.create(input);
    if (!options.supabase) throw new DataError('criar anotação', 'Configure o Supabase para acessar suas anotações.');
    return withDataErrors('criar anotação', 'Não foi possível criar a anotação.', async () => {
      const client = await authenticatedClient(options.supabase as SupabaseClient, input.userId, 'criar anotação');
      const { data, error } = await client.from('game_notes').insert({
        id: input.note.id,
        user_id: input.note.userId,
        game_id: input.note.gameId,
        body: input.note.body,
        image_data_url: input.note.imageDataUrl || null,
        created_at: input.note.createdAt,
        updated_at: input.note.updatedAt,
      }).select('*').single();
      if (error) {
        const existing = await readRemoteById(client, {
          userId: input.userId, isDemo: input.isDemo, gameId: input.note.gameId, noteId: input.note.id,
        }).catch(() => null);
        if (existing && matchesSavedNote(existing, input.note)) return existing;
        if (existing) throw new NotesConflictError('changed', existing);
        throw error;
      }
      const note = noteFromRow(data, input.userId, input.note.gameId, 'criar anotação');
      if (!note) throw new DataError('criar anotação', 'O servidor devolveu uma anotação inválida.');
      return note;
    });
  };
  const update = async (input: NoteUpdateInput) => {
    validateScope({ ...input, gameId: input.note?.gameId || '' }, 'atualizar anotação');
    requireLive(input.historical, 'atualizar anotação');
    validateNote(input.note, input.userId, input.note?.gameId || '', 'atualizar anotação');
    if (typeof input.expectedUpdatedAt !== 'string' || !input.expectedUpdatedAt.trim()) throw new DataError('atualizar anotação', 'A versão da anotação não foi informada.');
    if (demo) return demoStore!.update(input);
    if (!options.supabase) throw new DataError('atualizar anotação', 'Configure o Supabase para acessar suas anotações.');
    return withDataErrors('atualizar anotação', 'Não foi possível atualizar a anotação.', async () => {
      const client = await authenticatedClient(options.supabase as SupabaseClient, input.userId, 'atualizar anotação');
      const { data, error } = await client.from('game_notes').update({
        body: input.note.body,
        image_data_url: input.note.imageDataUrl || null,
        updated_at: input.note.updatedAt,
      }).eq('id', input.note.id).eq('user_id', input.userId).eq('game_id', input.note.gameId)
        .eq('updated_at', input.expectedUpdatedAt).select('*').maybeSingle();
      if (error) throw error;
      const note = noteFromRow(data, input.userId, input.note.gameId, 'atualizar anotação');
      if (note) return note;
      const remote = await readRemoteById(options.supabase as SupabaseClient, {
        userId: input.userId,
        isDemo: input.isDemo,
        gameId: input.note.gameId,
        noteId: input.note.id,
      });
      throw new NotesConflictError(remote ? 'changed' : 'deleted', remote);
    });
  };
  const remove = async (input: NoteDeleteInput) => {
    validateScope(input, 'apagar anotação');
    requireLive(input.historical, 'apagar anotação');
    if (typeof input.noteId !== 'string' || !input.noteId.trim()) throw new DataError('apagar anotação', 'A anotação não foi informada.');
    if (demo) {
      demoStore!.remove(input);
      return;
    }
    if (!options.supabase) throw new DataError('apagar anotação', 'Configure o Supabase para acessar suas anotações.');
    return withDataErrors('apagar anotação', 'Não foi possível apagar a anotação.', async () => {
      const client = await authenticatedClient(options.supabase as SupabaseClient, input.userId, 'apagar anotação');
      let query = client.from('game_notes').delete().eq('id', input.noteId).eq('user_id', input.userId).eq('game_id', input.gameId);
      if (input.expectedUpdatedAt) query = query.eq('updated_at', input.expectedUpdatedAt);
      const { data, error } = await query.select('id').maybeSingle();
      if (error) throw error;
      if (data || !input.expectedUpdatedAt) return;
      const remote = await readRemoteById(options.supabase as SupabaseClient, input);
      throw new NotesConflictError(remote ? 'changed' : 'deleted', remote);
    });
  };
  return {
    read,
    create,
    update,
    remove,
    readNotes: read,
    createNote: create,
    updateNote: update,
    deleteNote: remove,
  };
}

export const createNotesDataClient = createNotesClient;

export function readNotes(supabase: SupabaseClient, input: NotesQuery) {
  return createNotesClient({ supabase }).read(input);
}

export function createNote(supabase: SupabaseClient, input: NewNoteInput) {
  return createNotesClient({ supabase }).create(input);
}

export function updateNote(supabase: SupabaseClient, input: NoteUpdateInput) {
  return createNotesClient({ supabase }).update(input);
}

export function deleteNote(supabase: SupabaseClient, input: NoteDeleteInput) {
  return createNotesClient({ supabase }).remove(input);
}
