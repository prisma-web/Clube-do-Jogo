import type { LocalNote } from './types';

const DB_NAME = 'clube-do-jogo-local';
const DB_VERSION = 3;
const NOTES_STORE = 'notes';
const SYNC_STORE = 'note-sync';

export type NoteSyncState = 'pending' | 'synced' | 'conflict' | 'error' | 'accepted-remote-deletion';
export type NoteConflictKind = 'different-without-baseline' | 'both-changed' | 'remote-deleted';

export interface NoteSyncMetadata {
  noteId: string;
  userId: string;
  gameId: string;
  state: NoteSyncState;
  localHash?: string;
  baselineHash?: string;
  baselineUpdatedAt?: string;
  attemptedAt?: string;
  confirmedAt?: string;
  lastError?: string;
  conflict?: {
    kind: NoteConflictKind;
    detectedAt: string;
    remote?: LocalNote;
  };
}

interface StoredNoteSyncMetadata extends NoteSyncMetadata {
  key: string;
}

function metadataKey(userId: string, noteId: string) {
  return `${userId}:${noteId}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(NOTES_STORE)) {
        const store = database.createObjectStore(NOTES_STORE, { keyPath: 'id' });
        store.createIndex('game', ['userId', 'gameId']);
      } else {
        const store = request.transaction!.objectStore(NOTES_STORE);
        if (store.indexNames.contains('context')) store.deleteIndex('context');
        if (!store.indexNames.contains('game')) store.createIndex('game', ['userId', 'gameId']);
      }

      if (!database.objectStoreNames.contains(SYNC_STORE)) {
        const store = database.createObjectStore(SYNC_STORE, { keyPath: 'key' });
        store.createIndex('game', ['userId', 'gameId']);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('O IndexedDB de notas está bloqueado por outra aba.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Falha na transação de notas locais.'));
    transaction.onabort = () => reject(transaction.error || new Error('Transação de notas locais cancelada.'));
  });
}

export async function loadNotes(userId: string, gameId: string): Promise<LocalNote[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(NOTES_STORE, 'readonly');
    const request = transaction.objectStore(NOTES_STORE).index('game').getAll([userId, gameId]);
    const notes = await new Promise<LocalNote[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as LocalNote[]);
      request.onerror = () => reject(request.error);
    });
    await transactionDone(transaction);
    return notes.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } finally {
    database.close();
  }
}

export async function saveNote(note: LocalNote): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(NOTES_STORE, 'readwrite');
    transaction.objectStore(NOTES_STORE).put(note);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function deleteNote(id: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(NOTES_STORE, 'readwrite');
    transaction.objectStore(NOTES_STORE).delete(id);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function loadNoteSyncMetadata(userId: string, gameId: string): Promise<NoteSyncMetadata[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(SYNC_STORE, 'readonly');
    const request = transaction.objectStore(SYNC_STORE).index('game').getAll([userId, gameId]);
    const records = await new Promise<StoredNoteSyncMetadata[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as StoredNoteSyncMetadata[]);
      request.onerror = () => reject(request.error);
    });
    await transactionDone(transaction);
    return records.map(record => {
      const { key, ...metadata } = record;
      void key;
      return metadata;
    });
  } finally {
    database.close();
  }
}

export async function getNoteSyncMetadata(userId: string, noteId: string): Promise<NoteSyncMetadata | undefined> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(SYNC_STORE, 'readonly');
    const request = transaction.objectStore(SYNC_STORE).get(metadataKey(userId, noteId));
    const record = await new Promise<StoredNoteSyncMetadata | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as StoredNoteSyncMetadata | undefined);
      request.onerror = () => reject(request.error);
    });
    await transactionDone(transaction);
    if (!record) return undefined;
    const { key, ...metadata } = record;
    void key;
    return metadata;
  } finally {
    database.close();
  }
}

export async function saveNoteSyncMetadata(metadata: NoteSyncMetadata): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(SYNC_STORE, 'readwrite');
    const record: StoredNoteSyncMetadata = {
      ...metadata,
      key: metadataKey(metadata.userId, metadata.noteId),
    };
    transaction.objectStore(SYNC_STORE).put(record);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}
