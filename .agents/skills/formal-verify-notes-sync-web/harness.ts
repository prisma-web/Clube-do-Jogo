// Exhaustive interleaving checker for the real web notes sync code.
// Every IndexedDB call and every Supabase request is one atomic step; JS between
// two awaits runs without interruption, exactly as in the browser.
import type { LocalNote } from '../../../src/lib/types';
import type { NoteSyncMetadata } from '../../../src/lib/local-notes';
import {
  noteFingerprint,
  rememberConfirmedDeletion,
  rememberConfirmedNote,
  resolveNoteConflict,
  StaleNoteConflictError,
  syncNotes,
  type NotesConflictResolution,
  type NotesLocalStore,
  type NotesRemoteStore,
} from '../../../src/lib/notes-sync';

export const ctx = { userId: 'user-a', gameId: 'game-a' };
const NOW = '2026-11-23T12:00:00.000Z';

export type Property = 'NoSilentRollback' | 'QuietSyncConverges';
export type WriterKind = 'automatic' | 'user';

export interface Violation {
  property: Property;
  signature: string;
  message: string;
}

const copy = <T>(value: T): T => structuredClone(value);
const timestamp = (version: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, version)).toISOString();

export function makeNote(id: string, version: number): LocalNote {
  return {
    id,
    userId: ctx.userId,
    gameId: ctx.gameId,
    body: `${id}@v${version}`,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: timestamp(version),
  };
}

export const versionOf = (note: LocalNote) => Number(note.body.split('@v')[1]);
const label = (note: LocalNote | undefined) => note ? `${note.id}@v${versionOf(note)}` : '—';

class Scheduler {
  readonly pending: Array<{ actor: string; release: () => void }> = [];
  readonly taken: Array<[choice: number, options: number]> = [];

  constructor(private readonly prefix: number[]) {}

  choose(options: number) {
    if (options === 1) return 0;
    const index = this.taken.length;
    const choice = index < this.prefix.length ? this.prefix[index] : 0;
    this.taken.push([choice, options]);
    return choice;
  }

  gate(actor: string) {
    return new Promise<void>(release => this.pending.push({ actor, release }));
  }
}

export class World {
  readonly idbNotes = new Map<string, LocalNote>();
  readonly idbMeta = new Map<string, NoteSyncMetadata>();
  readonly server = new Map<string, LocalNote>();
  readonly serverEverHad = new Set<string>();
  readonly trace: string[] = [];
  readonly violations: Violation[] = [];
  private lastVersion = 0;

  constructor(readonly scheduler: Scheduler) {}

  newVersion() {
    this.lastVersion += 1;
    return this.lastVersion;
  }

  seedVersion(version: number) {
    this.lastVersion = Math.max(this.lastVersion, version);
  }

  seedServer(note: LocalNote) {
    this.seedVersion(versionOf(note));
    this.server.set(note.id, copy(note));
    this.serverEverHad.add(note.id);
  }

  seedLocal(note: LocalNote, metadata?: Partial<NoteSyncMetadata>) {
    this.seedVersion(versionOf(note));
    this.idbNotes.set(note.id, copy(note));
    if (metadata) {
      this.idbMeta.set(note.id, { noteId: note.id, userId: note.userId, gameId: note.gameId, state: 'synced', ...metadata });
    }
  }

  seedSynced(note: LocalNote) {
    this.seedServer(note);
    this.seedLocal(note, { state: 'synced', localHash: noteFingerprint(note), baselineHash: noteFingerprint(note), baselineUpdatedAt: note.updatedAt });
  }

  step(actor: string) {
    return this.scheduler.gate(actor);
  }

  log(actor: string, text: string) {
    this.trace.push(`${actor}  ${text}`);
  }

  describeMeta(metadata: NoteSyncMetadata | undefined) {
    if (!metadata) return '—';
    const versionByHash = (hash: string | undefined) => {
      if (!hash) return '∅';
      for (let version = 0; version <= this.lastVersion + 1; version += 1) {
        for (const id of new Set([...this.idbNotes.keys(), ...this.server.keys(), metadata.noteId])) {
          if (noteFingerprint(makeNote(id, version)) === hash) return `v${version}`;
        }
      }
      return '?';
    };
    const conflict = metadata.conflict ? ` conflito=${metadata.conflict.kind}` : '';
    return `${metadata.noteId}{${metadata.state} local=${versionByHash(metadata.localHash)} base=${versionByHash(metadata.baselineHash)}${conflict}}`;
  }

  // A user may only replace what the screen showed: an explicit conflict choice
  // passes the server version the conflict displayed as `mayReplace`.
  private recordServerWrite(actor: string, kind: WriterKind, mayReplace: number | undefined, op: string, id: string, before: LocalNote | undefined, after: LocalNote) {
    if (kind === 'user') {
      if (mayReplace !== undefined && before && versionOf(after) < versionOf(before) && versionOf(before) !== mayReplace) {
        this.flag('NoSilentRollback', `${op}:overwrote-unseen`, `${actor} (escolha de conflito) trocou no servidor ${label(before)} por ${label(after)}, mas o conflito mostrado era contra v${mayReplace}`);
      }
      return;
    }
    if (before && versionOf(after) < versionOf(before)) {
      this.flag('NoSilentRollback', `${op}:rollback`, `${actor} (sincronização automática) trocou no servidor ${label(before)} por ${label(after)}, mais antiga`);
    }
    if (!before && this.serverEverHad.has(id)) {
      this.flag('NoSilentRollback', `${op}:resurrect`, `${actor} (sincronização automática) recriou no servidor ${label(after)}, que já tinha sido apagada`);
    }
  }

  flag(property: Property, signature: string, message: string) {
    this.violations.push({ property, signature: `${property}:${signature}`, message });
    this.trace.push(`   ✗ ${property}: ${message}`);
  }

  local(actor: string): NotesLocalStore {
    const scoped = <T extends { userId: string; gameId: string }>(items: Iterable<T>) =>
      [...items].filter(item => item.userId === ctx.userId && item.gameId === ctx.gameId).map(copy);
    return {
      listNotes: async () => {
        await this.step(actor);
        const notes = scoped(this.idbNotes.values());
        this.log(actor, `idb.listNotes → [${notes.map(label).join(', ')}]`);
        return notes;
      },
      saveNote: async note => {
        await this.step(actor);
        this.idbNotes.set(note.id, copy(note));
        this.log(actor, `idb.saveNote(${label(note)})`);
      },
      listMetadata: async () => {
        await this.step(actor);
        const records = scoped(this.idbMeta.values());
        this.log(actor, `idb.listMetadata → [${records.map(record => this.describeMeta(record)).join(', ')}]`);
        return records;
      },
      getMetadata: async (_userId, noteId) => {
        await this.step(actor);
        const record = this.idbMeta.get(noteId);
        this.log(actor, `idb.getMetadata(${noteId}) → ${this.describeMeta(record)}`);
        return record ? copy(record) : undefined;
      },
      saveMetadata: async metadata => {
        await this.step(actor);
        this.idbMeta.set(metadata.noteId, copy(metadata));
        this.log(actor, `idb.saveMetadata(${this.describeMeta(metadata)})`);
      },
    };
  }

  // Mirrors createSupabaseNotesRemote (src/lib/notes-sync.ts) over the game_notes
  // table: primary key on id, no trigger on updated_at, CAS through .eq('updated_at').
  remote(actor: string, kind: WriterKind, mayReplace?: number): NotesRemoteStore & { deleteIfVersion(id: string, expectedUpdatedAt: string): Promise<number> } {
    return {
      list: async () => {
        await this.step(actor);
        const notes = [...this.server.values()].filter(note => note.userId === ctx.userId && note.gameId === ctx.gameId).map(copy);
        this.log(actor, `remote.list → [${notes.map(label).join(', ')}]`);
        return notes;
      },
      get: async (_context, noteId) => {
        await this.step(actor);
        const note = this.server.get(noteId);
        this.log(actor, `remote.get(${noteId}) → ${label(note)}`);
        return note ? copy(note) : null;
      },
      insert: async note => {
        await this.step(actor);
        if (this.server.has(note.id)) {
          this.log(actor, `remote.insert(${label(note)}) → erro: id duplicado`);
          throw new Error('duplicate key value violates unique constraint "game_notes_pkey"');
        }
        this.log(actor, `remote.insert(${label(note)}) → ok`);
        this.recordServerWrite(actor, kind, mayReplace, 'remote.insert', note.id, undefined, note);
        this.server.set(note.id, copy(note));
        this.serverEverHad.add(note.id);
        return copy(note);
      },
      update: async (note, expectedRemoteUpdatedAt) => {
        await this.step(actor);
        const current = this.server.get(note.id);
        const expected = `esperado v${Math.round((Date.parse(expectedRemoteUpdatedAt) - Date.UTC(2026, 0, 1)) / 1000)}`;
        if (!current || current.updatedAt !== expectedRemoteUpdatedAt) {
          this.log(actor, `remote.update(${label(note)}, ${expected}) → 0 linhas (servidor: ${label(current)})`);
          return null;
        }
        this.log(actor, `remote.update(${label(note)}, ${expected}) → ok (servidor tinha ${label(current)})`);
        const next = { ...current, body: note.body, imageDataUrl: note.imageDataUrl, createdAt: note.createdAt, updatedAt: note.updatedAt };
        this.recordServerWrite(actor, kind, mayReplace, 'remote.update', note.id, current, next);
        this.server.set(note.id, copy(next));
        return copy(next);
      },
      deleteIfVersion: async (id, expectedUpdatedAt) => {
        await this.step(actor);
        const current = this.server.get(id);
        if (!current || current.updatedAt !== expectedUpdatedAt) {
          this.log(actor, `remote.delete(${id}) → 0 linhas (servidor: ${label(current)})`);
          return 0;
        }
        this.server.delete(id);
        this.log(actor, `remote.delete(${id}) → apagou ${label(current)}`);
        return 1;
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Actors. Each returns a short outcome label used for non-vacuity checks.
// ---------------------------------------------------------------------------

export type Actor = { name: string; run(world: World): Promise<string> };

export function sync(name: string): Actor {
  return {
    name,
    async run(world) {
      const result = await syncNotes(ctx, { local: world.local(name), remote: world.remote(name, 'automatic'), now: () => NOW });
      return result.items.map(item => {
        const conflict = result.conflicts.find(entry => entry.noteId === item.noteId);
        return `${item.noteId}:${item.status}${conflict ? `/${conflict.kind}` : ''}`;
      }).sort().join(',') || 'vazio';
    },
  };
}

// src/components/notes-chat.tsx submit(), editing branch: CAS on the version the
// tab is showing, then rememberConfirmedNote.
export function edit(name: string, shown: LocalNote): Actor {
  return {
    name,
    async run(world) {
      const noteToSave = makeNote(shown.id, world.newVersion());
      const confirmed = await world.remote(name, 'user').update(noteToSave, shown.updatedAt);
      if (!confirmed) return 'edit:stale';
      try {
        await rememberConfirmedNote(noteToSave, confirmed, world.local(name), NOW);
      } catch {
        return 'edit:cache-error';
      }
      return 'edit:saved';
    },
  };
}

// src/components/notes-chat.tsx submit(), new note branch.
async function createNote(world: World, name: string, id: string) {
  const noteToSave = makeNote(id, world.newVersion());
  const confirmed = await world.remote(name, 'user').insert(noteToSave);
  try {
    await rememberConfirmedNote(noteToSave, confirmed, world.local(name), NOW);
  } catch {
    return { outcome: 'create:cache-error', note: noteToSave };
  }
  return { outcome: 'create:saved', note: noteToSave };
}

export function create(name: string, id: string): Actor {
  return { name, run: async world => (await createNote(world, name, id)).outcome };
}

// src/components/notes-chat.tsx remove(): CAS delete, then rememberConfirmedDeletion.
export async function removeNote(world: World, name: string, shown: LocalNote) {
  const remote = world.remote(name, 'user');
  const deleted = await remote.deleteIfVersion(shown.id, shown.updatedAt);
  if (!deleted && await remote.get(ctx, shown.id)) return 'remove:stale';
  await rememberConfirmedDeletion(ctx, shown.id, world.local(name), NOW);
  return 'remove:done';
}

export function remove(name: string, shown: LocalNote): Actor {
  return { name, run: world => removeNote(world, name, shown) };
}

export function createThenRemove(name: string, id: string): Actor {
  return {
    name,
    async run(world) {
      const created = await createNote(world, name, id);
      return `${created.outcome}+${await removeNote(world, name, created.note)}`;
    },
  };
}

export function resolve(name: string, noteId: string, resolution: NotesConflictResolution): Actor {
  return {
    name,
    async run(world) {
      const shownRemote = world.idbMeta.get(noteId)?.conflict?.remote;
      const remote = world.remote(name, 'user', shownRemote ? versionOf(shownRemote) : undefined);
      try {
        await resolveNoteConflict(ctx, noteId, resolution, { local: world.local(name), remote, now: () => NOW });
        return `resolve:${resolution}`;
      } catch (error) {
        return error instanceof StaleNoteConflictError ? 'resolve:stale' : 'resolve:error';
      }
    },
  };
}

// Another device of the same user (mobile app, packages/data/src/notes.ts) writing
// with its own CAS. Its logic is not under verification, so one atomic step.
export function deviceEdit(noteId: string): Actor {
  return {
    name: 'D',
    async run(world) {
      await world.step('D');
      const current = world.server.get(noteId);
      if (!current) {
        world.log('D', `outro aparelho tenta editar ${noteId} → já não existe`);
        return 'device:missing';
      }
      const next = makeNote(noteId, world.newVersion());
      world.server.set(noteId, next);
      world.log('D', `outro aparelho edita ${label(current)} → ${label(next)}`);
      return 'device:edited';
    },
  };
}

export function deviceDelete(noteId: string): Actor {
  return {
    name: 'D',
    async run(world) {
      await world.step('D');
      const current = world.server.get(noteId);
      world.server.delete(noteId);
      world.log('D', `outro aparelho apaga ${label(current)}`);
      return current ? 'device:deleted' : 'device:missing';
    },
  };
}

// ---------------------------------------------------------------------------
// Exploration.
// ---------------------------------------------------------------------------

export interface Scenario {
  name: string;
  summary: string;
  setup(world: World): void;
  actors: Actor[];
  reaches: string[];
  knownFindings: string[];
}

export interface Counterexample {
  violation: Violation;
  trace: string[];
  switches: number;
}

export interface ScenarioReport {
  schedules: number;
  outcomes: Set<string>;
  counterexamples: Map<string, Counterexample>;
}

const settle = () => new Promise<void>(resolve => setImmediate(resolve));
const MAX_STEPS = 400;

async function runOnce(scenario: Scenario, prefix: number[]) {
  const scheduler = new Scheduler(prefix);
  const world = new World(scheduler);
  scenario.setup(world);
  const results: Array<{ done: boolean; outcome?: string; error?: unknown }> = scenario.actors.map(() => ({ done: false }));
  scenario.actors.forEach((actor, index) => {
    actor.run(world).then(
      outcome => { results[index] = { done: true, outcome: `${actor.name}:${outcome}` }; },
      error => { results[index] = { done: true, error }; },
    );
  });
  await settle();
  const actorOrder: string[] = [];
  for (let steps = 0; scheduler.pending.length; steps += 1) {
    if (steps > MAX_STEPS) throw new Error(`${scenario.name}: mais de ${MAX_STEPS} passos; o harness entrou em laço`);
    const [next] = scheduler.pending.splice(scheduler.choose(scheduler.pending.length), 1);
    actorOrder.push(next.actor);
    next.release();
    await settle();
  }
  for (const [index, result] of results.entries()) {
    if (!result.done) throw new Error(`${scenario.name}: ${scenario.actors[index].name} ficou preso fora de um passo do harness`);
    if (result.error) throw new Error(`${scenario.name}: ${scenario.actors[index].name} lançou ${String(result.error)}`);
  }

  // QuietSyncConverges: once the dust settles, one sync with nobody else running
  // must leave this browser and the server on the same version, or show a conflict.
  world.trace.push('-- sincronização final, sem concorrência --');
  const quiet = await (async () => {
    const pending = syncNotes(ctx, { local: world.local('Q'), remote: world.remote('Q', 'automatic'), now: () => NOW });
    for (let steps = 0; ; steps += 1) {
      await settle();
      if (!scheduler.pending.length) break;
      if (steps > MAX_STEPS) throw new Error(`${scenario.name}: sincronização final não termina`);
      scheduler.pending.shift()!.release();
    }
    return pending;
  })();
  for (const item of quiet.items) {
    const server = world.server.get(item.noteId);
    const local = world.idbNotes.get(item.noteId);
    const meta = world.idbMeta.get(item.noteId);
    if (item.status === 'conflict') continue;
    if (item.status === 'error') {
      world.flag('QuietSyncConverges', 'error', `sincronização final terminou em erro para ${item.noteId}: ${item.error}`);
      continue;
    }
    const hiddenDeletion = !server && meta?.state === 'accepted-remote-deletion';
    const same = server && local && noteFingerprint(server) === noteFingerprint(local) && meta?.state === 'synced';
    if (!hiddenDeletion && !same) {
      world.flag('QuietSyncConverges', 'diverged', `sincronização final disse "synced" para ${item.noteId}, mas o servidor tem ${label(server)} e o navegador ${label(local)} (${world.describeMeta(meta)})`);
    }
  }

  let switches = 0;
  for (let index = 1; index < actorOrder.length; index += 1) if (actorOrder[index] !== actorOrder[index - 1]) switches += 1;
  return { scheduler, world, outcomes: results.map(result => result.outcome!), switches };
}

export async function explore(scenario: Scenario): Promise<ScenarioReport> {
  const report: ScenarioReport = { schedules: 0, outcomes: new Set(), counterexamples: new Map() };
  let prefix: number[] = [];
  for (;;) {
    const { scheduler, world, outcomes, switches } = await runOnce(scenario, prefix);
    report.schedules += 1;
    for (const outcome of outcomes) report.outcomes.add(outcome);
    for (const violation of world.violations) {
      const best = report.counterexamples.get(violation.signature);
      const better = !best || switches < best.switches || (switches === best.switches && world.trace.length < best.trace.length);
      if (better) report.counterexamples.set(violation.signature, { violation, trace: [...world.trace], switches });
    }
    let index = scheduler.taken.length - 1;
    while (index >= 0 && scheduler.taken[index][0] + 1 >= scheduler.taken[index][1]) index -= 1;
    if (index < 0) return report;
    prefix = [...scheduler.taken.slice(0, index).map(([choice]) => choice), scheduler.taken[index][0] + 1];
  }
}
