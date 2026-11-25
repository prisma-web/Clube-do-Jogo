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

export type Property = 'NoSilentRollback' | 'NoLostLocalEdit' | 'QuietSyncConverges';
export type WriterKind = 'automatic' | 'user';
export type Shape = 'torn-read' | 'torn-write' | 'half-write';

export interface Violation {
  property: Property;
  signature: string;
  shape?: Shape;
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
  private readonly serverVersions = new Set<string>();
  readonly trace: string[] = [];
  private readonly flags: Array<{ actor: string; id: string; property: Property; signature: string; message: string; line: number }> = [];
  private lastVersion = 0;
  private readonly idbWrites: Array<{ actor: string; store: 'note' | 'meta'; id: string }> = [];
  private readonly pairReads = new Map<string, { note?: number; meta?: number }>();

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
    this.setServer(note);
  }

  setServer(note: LocalNote) {
    this.server.set(note.id, copy(note));
    this.serverEverHad.add(note.id);
    this.serverVersions.add(noteFingerprint(note));
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

  private recordServerWrite(actor: string, kind: WriterKind, mayReplace: number | undefined, op: string, id: string, before: LocalNote | undefined, after: LocalNote) {
    if (kind === 'user') {
      if (mayReplace !== undefined && before && versionOf(after) < versionOf(before) && versionOf(before) !== mayReplace) {
        this.flag(actor, id, 'NoSilentRollback', `${op}:overwrote-unseen`, `${actor} (escolha de conflito) trocou no servidor ${label(before)} por ${label(after)}, mas o conflito mostrado era contra v${mayReplace}`);
      }
      return;
    }
    if (before && versionOf(after) < versionOf(before)) {
      this.flag(actor, id, 'NoSilentRollback', `${op}:rollback`, `${actor} (sincronização automática) trocou no servidor ${label(before)} por ${label(after)}, mais antiga`);
    }
    if (!before && this.serverEverHad.has(id)) {
      this.flag(actor, id, 'NoSilentRollback', `${op}:resurrect`, `${actor} (sincronização automática) recriou no servidor ${label(after)}, que já tinha sido apagada`);
    }
  }

  private shapeOf(actor: string, id: string): { shape?: Shape; detail: string } {
    const none = { detail: 'sem leitura rasgada, escrita rasgada nem meia gravação de outra aba' };
    const read = this.pairReads.get(actor);
    if (read?.note === undefined || read.meta === undefined) return none;
    const writes = this.idbWrites.map((write, index) => ({ ...write, index })).filter(write => write.id === id);
    const [from, to] = [read.note, read.meta].sort((a, b) => a - b);
    const between = writes.find(write => write.index >= from && write.index < to && write.actor !== actor);
    if (between) return { shape: 'torn-read', detail: `leitura rasgada: ${between.actor} gravou ${id} entre as leituras de nota e metadado de ${actor}` };
    const partner = new Map<number, number>();
    for (const tab of new Set(writes.map(write => write.actor))) {
      const own = writes.filter(write => write.actor === tab);
      for (let index = 0; index + 1 < own.length; index += 1) {
        if (own[index].store === own[index + 1].store) continue;
        partner.set(own[index].index, own[index + 1].index);
        index += 1;
      }
    }
    const seen = writes.filter(write => write.index < to);
    const note = seen.filter(write => write.store === 'note').at(-1);
    const meta = seen.filter(write => write.store === 'meta').at(-1);
    const opening = meta && [...partner].find(([, closing]) => closing === meta.index)?.[0];
    if (note && meta && opening !== undefined && opening < note.index && note.index < meta.index) {
      return { shape: 'torn-write', detail: `escrita rasgada: ${actor} leu a nota de ${note.actor}, gravada no meio do par nota→metadado de ${meta.actor}, com o metadado de ${meta.actor}` };
    }
    const last = seen.at(-1);
    if (last && last.actor !== actor && partner.has(last.index)) {
      return { shape: 'half-write', detail: `meia gravação: ${actor} leu ${id} depois de ${last.actor} gravar ${last.store === 'note' ? 'a nota' : 'o metadado'} e antes de gravar ${last.store === 'note' ? 'o metadado' : 'a nota'}` };
    }
    return none;
  }

  flag(actor: string, id: string, property: Property, signature: string, message: string) {
    this.flags.push({ actor, id, property, signature: `${property}:${signature}`, message, line: this.trace.length });
    this.trace.push(`   ✗ ${property}: ${message}`);
  }

  classifyViolations(): Violation[] {
    return this.flags.map(({ actor, id, property, signature, message, line }) => {
      const { shape, detail } = this.shapeOf(actor, id);
      this.trace[line] = `   ✗ ${property}: ${message} (${detail})`;
      return { property, signature, shape, message: `${message} (${detail})` };
    });
  }

  private markRead(actor: string, store: 'note' | 'meta') {
    this.pairReads.set(actor, { ...this.pairReads.get(actor), [store]: this.idbWrites.length });
  }

  local(actor: string, kind: WriterKind): NotesLocalStore {
    const scoped = <T extends { userId: string; gameId: string }>(items: Iterable<T>) =>
      [...items].filter(item => item.userId === ctx.userId && item.gameId === ctx.gameId).map(copy);
    return {
      listNotes: async () => {
        await this.step(actor);
        const notes = scoped(this.idbNotes.values());
        this.markRead(actor, 'note');
        this.log(actor, `idb.listNotes → [${notes.map(label).join(', ')}]`);
        return notes;
      },
      saveNote: async note => {
        await this.step(actor);
        const before = this.idbNotes.get(note.id);
        this.idbNotes.set(note.id, copy(note));
        this.idbWrites.push({ actor, store: 'note', id: note.id });
        this.log(actor, `idb.saveNote(${label(note)})`);
        if (kind === 'automatic' && before && noteFingerprint(before) !== noteFingerprint(note) && !this.serverVersions.has(noteFingerprint(before))) {
          this.flag(actor, note.id, 'NoLostLocalEdit', 'idb.saveNote:dropped-unsynced', `${actor} (sincronização automática) trocou no IndexedDB ${label(before)}, que o servidor nunca recebeu, por ${label(note)}`);
        }
      },
      listMetadata: async () => {
        await this.step(actor);
        const records = scoped(this.idbMeta.values());
        this.markRead(actor, 'meta');
        this.log(actor, `idb.listMetadata → [${records.map(record => this.describeMeta(record)).join(', ')}]`);
        return records;
      },
      getMetadata: async (_userId, noteId) => {
        await this.step(actor);
        const record = this.idbMeta.get(noteId);
        this.markRead(actor, 'meta');
        this.log(actor, `idb.getMetadata(${noteId}) → ${this.describeMeta(record)}`);
        return record ? copy(record) : undefined;
      },
      saveMetadata: async metadata => {
        await this.step(actor);
        this.idbMeta.set(metadata.noteId, copy(metadata));
        this.idbWrites.push({ actor, store: 'meta', id: metadata.noteId });
        this.log(actor, `idb.saveMetadata(${this.describeMeta(metadata)})`);
      },
    };
  }

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
        this.setServer(note);
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
        this.setServer(next);
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

export type Actor = { name: string; run(world: World): Promise<string> };

export function sync(name: string): Actor {
  return {
    name,
    async run(world) {
      const result = await syncNotes(ctx, { local: world.local(name, 'automatic'), remote: world.remote(name, 'automatic'), now: () => NOW });
      return result.items.map(item => {
        const conflict = result.conflicts.find(entry => entry.noteId === item.noteId);
        return `${item.noteId}:${item.status}${conflict ? `/${conflict.kind}` : ''}`;
      }).sort().join(',') || 'vazio';
    },
  };
}

export function edit(name: string, shown: LocalNote): Actor {
  return {
    name,
    async run(world) {
      const noteToSave = makeNote(shown.id, world.newVersion());
      const confirmed = await world.remote(name, 'user').update(noteToSave, shown.updatedAt);
      if (!confirmed) return 'edit:stale';
      try {
        await rememberConfirmedNote(noteToSave, confirmed, world.local(name, 'user'), NOW);
      } catch {
        return 'edit:cache-error';
      }
      return 'edit:saved';
    },
  };
}

async function createNote(world: World, name: string, id: string) {
  const noteToSave = makeNote(id, world.newVersion());
  const confirmed = await world.remote(name, 'user').insert(noteToSave);
  try {
    await rememberConfirmedNote(noteToSave, confirmed, world.local(name, 'user'), NOW);
  } catch {
    return { outcome: 'create:cache-error', note: noteToSave };
  }
  return { outcome: 'create:saved', note: noteToSave };
}

export function create(name: string, id: string): Actor {
  return { name, run: async world => (await createNote(world, name, id)).outcome };
}

export async function removeNote(world: World, name: string, shown: LocalNote) {
  const remote = world.remote(name, 'user');
  const deleted = await remote.deleteIfVersion(shown.id, shown.updatedAt);
  if (!deleted && await remote.get(ctx, shown.id)) return 'remove:stale';
  await rememberConfirmedDeletion(ctx, shown.id, world.local(name, 'user'), NOW);
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
        await resolveNoteConflict(ctx, noteId, resolution, { local: world.local(name, 'user'), remote, now: () => NOW });
        return `resolve:${resolution}`;
      } catch (error) {
        return error instanceof StaleNoteConflictError ? 'resolve:stale' : 'resolve:error';
      }
    },
  };
}

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
      world.setServer(next);
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
  steps: Set<string>;
  counterexamples: Map<string, Counterexample>;
}

export const violationKey = (signature: string, shape?: Shape) => shape ? `${signature} [${shape}]` : signature;

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

  world.trace.push('-- sincronização final, sem concorrência --');
  const quiet = await (async () => {
    const pending = syncNotes(ctx, { local: world.local('Q', 'automatic'), remote: world.remote('Q', 'automatic'), now: () => NOW });
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
      world.flag('Q', item.noteId, 'QuietSyncConverges', 'error', `sincronização final terminou em erro para ${item.noteId}: ${item.error}`);
      continue;
    }
    const hiddenDeletion = !server && meta?.state === 'accepted-remote-deletion';
    const same = server && local && noteFingerprint(server) === noteFingerprint(local) && meta?.state === 'synced';
    if (!hiddenDeletion && !same) {
      world.flag('Q', item.noteId, 'QuietSyncConverges', 'diverged', `sincronização final disse "synced" para ${item.noteId}, mas o servidor tem ${label(server)} e o navegador ${label(local)} (${world.describeMeta(meta)})`);
    }
  }

  let switches = 0;
  for (let index = 1; index < actorOrder.length; index += 1) if (actorOrder[index] !== actorOrder[index - 1]) switches += 1;
  return { scheduler, world, outcomes: results.map(result => result.outcome!), switches };
}

export async function explore(scenario: Scenario): Promise<ScenarioReport> {
  const report: ScenarioReport = { schedules: 0, outcomes: new Set(), steps: new Set(), counterexamples: new Map() };
  let prefix: number[] = [];
  for (;;) {
    const { scheduler, world, outcomes, switches } = await runOnce(scenario, prefix);
    const violations = world.classifyViolations();
    report.schedules += 1;
    for (const outcome of outcomes) report.outcomes.add(outcome);
    for (const line of world.trace) report.steps.add(line);
    for (const violation of violations) {
      const key = violationKey(violation.signature, violation.shape);
      const best = report.counterexamples.get(key);
      const better = !best || switches < best.switches || (switches === best.switches && world.trace.length < best.trace.length);
      if (better) report.counterexamples.set(key, { violation, trace: [...world.trace], switches });
    }
    let index = scheduler.taken.length - 1;
    while (index >= 0 && scheduler.taken[index][0] + 1 >= scheduler.taken[index][1]) index -= 1;
    if (index < 0) return report;
    prefix = [...scheduler.taken.slice(0, index).map(([choice]) => choice), scheduler.taken[index][0] + 1];
  }
}
