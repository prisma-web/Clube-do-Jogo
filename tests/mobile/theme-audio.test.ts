import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createThemeAudioController,
  type ThemeAudioPlatform,
  type ThemeAudioPlayer,
  type ThemeAudioPlayerStatus,
} from '../../apps/mobile/src/features/themes/audio-controller';

class Deferred<T> {
  promise: Promise<T>;
  resolve!: (value: T) => void;
  reject!: (reason: unknown) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

class FakePlayer implements ThemeAudioPlayer {
  currentStatus: ThemeAudioPlayerStatus = { isLoaded: false, error: null };
  loop = false;
  volume = 1;
  pauses = 0;
  plays = 0;
  releases = 0;
  listenerRemovals = 0;
  seekRequests: Deferred<void>[] = [];
  playFailure: unknown = null;
  private listeners = new Set<(status: ThemeAudioPlayerStatus) => void>();
  private retainedListeners: Array<(status: ThemeAudioPlayerStatus) => void> = [];

  constructor(readonly source: number) {}

  pause() {
    this.pauses += 1;
  }

  play() {
    if (this.playFailure) throw this.playFailure;
    this.plays += 1;
  }

  seekTo() {
    const request = new Deferred<void>();
    this.seekRequests.push(request);
    return request.promise;
  }

  addListener(_event: 'playbackStatusUpdate', listener: (status: ThemeAudioPlayerStatus) => void) {
    this.listeners.add(listener);
    this.retainedListeners.push(listener);
    return {
      remove: () => {
        this.listenerRemovals += 1;
        this.listeners.delete(listener);
      },
    };
  }

  release() {
    this.releases += 1;
  }

  emit(status: ThemeAudioPlayerStatus) {
    this.currentStatus = status;
    for (const listener of [...this.listeners]) listener(status);
  }

  emitRetained(status: ThemeAudioPlayerStatus) {
    this.currentStatus = status;
    for (const listener of this.retainedListeners) listener(status);
  }
}

function flush() {
  return new Promise<void>(resolve => setImmediate(resolve));
}

function loadPlayers(players: FakePlayer[]) {
  for (const player of players) player.emit({ isLoaded: true, error: null });
}

function fixture(configureMode: () => Promise<void> = async () => undefined) {
  const players: FakePlayer[] = [];
  const platform: ThemeAudioPlatform = {
    configureMode,
    createPlayer(source) {
      const player = new FakePlayer(source);
      players.push(player);
      return player;
    },
  };
  const controller = createThemeAudioController({
    platform,
    ambienceSources: { hearth: 1, spaceflight: 2 },
    signalSources: { enable: 3, press: 4, select: 5, open: 6, close: 7, navigate: 8 },
  });
  const bySource = (source: number) => players.filter(player => player.source === source);
  return { controller, players, bySource };
}

test('configura o modo antes de criar ou tocar players e cancelamento impede continuação', async () => {
  const mode = new Deferred<void>();
  const { controller, players } = fixture(() => mode.promise);

  controller.activate('hearth');
  assert.deepEqual(controller.getSnapshot(), { ready: false, error: null });
  assert.equal(players.length, 0);

  controller.deactivate();
  mode.resolve();
  await flush();

  assert.equal(players.length, 0);
  assert.deepEqual(controller.getSnapshot(), { ready: false, error: null });
});

test('seek antigo não toca nem publica erro depois de off e nova ativação', async () => {
  const { controller, players, bySource } = fixture();
  controller.activate('hearth');
  await flush();
  loadPlayers(players);
  const oldSignal = bySource(4)[0];
  assert.ok(oldSignal);

  controller.playSignal('press');
  controller.playSignal('press');
  assert.equal(oldSignal.seekRequests.length, 2);
  controller.deactivate();
  controller.activate('spaceflight');
  await flush();
  loadPlayers(players.slice(7));
  const newSignal = bySource(4)[1];
  assert.ok(newSignal);

  oldSignal.seekRequests[0].resolve();
  oldSignal.seekRequests[1].reject(new Error('erro antigo'));
  oldSignal.emitRetained({ isLoaded: false, error: 'status antigo' });
  await flush();
  assert.equal(oldSignal.plays, 0);
  assert.equal(controller.getSnapshot().error, null);

  controller.playSignal('press');
  newSignal.seekRequests[0].resolve();
  await flush();

  assert.equal(newSignal.plays, 1);
  assert.equal(controller.getSnapshot().error, null);
});

test('somente o sinal sobreposto mais recente pode tocar', async () => {
  const { controller, players, bySource } = fixture();
  controller.activate('hearth');
  await flush();
  loadPlayers(players);
  const signal = bySource(5)[0];

  controller.playSignal('select');
  controller.playSignal('select');
  signal.seekRequests[1].resolve();
  signal.seekRequests[0].resolve();
  await flush();

  assert.equal(signal.pauses, 2);
  assert.equal(signal.plays, 1);
});

test('falha antes do carregamento é recuperável e retry cria e toca uma sessão nova', async () => {
  const { controller, players, bySource } = fixture();
  controller.activate('hearth');
  await flush();
  const firstAmbience = bySource(1)[0];
  firstAmbience.emit({ isLoaded: false, error: 'falha do decoder' });

  assert.deepEqual(controller.getSnapshot(), { ready: false, error: 'falha do decoder' });
  assert.equal(firstAmbience.releases, 1);

  controller.retry();
  await flush();
  loadPlayers(players.slice(7));
  const secondAmbience = bySource(1)[1];
  assert.deepEqual(controller.getSnapshot(), { ready: true, error: null });
  assert.equal(secondAmbience.plays, 1);
});

test('retry repete configuração que falhou antes de criar players', async () => {
  let attempts = 0;
  const { controller, players } = fixture(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('modo indisponível');
  });

  controller.activate('hearth');
  await flush();
  assert.deepEqual(controller.getSnapshot(), { ready: false, error: 'modo indisponível' });
  assert.equal(players.length, 0);

  controller.retry();
  await flush();
  loadPlayers(players);
  assert.equal(attempts, 2);
  assert.deepEqual(controller.getSnapshot(), { ready: true, error: null });
  assert.equal(players.length, 7);
});

test('exceção síncrona de play libera a sessão e fica recuperável', async () => {
  let failPlay = true;
  const players: FakePlayer[] = [];
  const controller = createThemeAudioController({
    platform: {
      configureMode: async () => undefined,
      createPlayer(source) {
        const player = new FakePlayer(source);
        if (source === 1 && failPlay) player.playFailure = new Error('play falhou');
        players.push(player);
        return player;
      },
    },
    ambienceSources: { hearth: 1, spaceflight: 2 },
    signalSources: { enable: 3, press: 4, select: 5, open: 6, close: 7, navigate: 8 },
  });

  controller.activate('hearth');
  await flush();
  loadPlayers(players);
  assert.deepEqual(controller.getSnapshot(), { ready: false, error: 'play falhou' });
  assert.ok(players.every(player => player.releases === 1));

  failPlay = false;
  controller.retry();
  await flush();
  loadPlayers(players.slice(7));
  assert.deepEqual(controller.getSnapshot(), { ready: true, error: null });
});

test('falha de seek atual aparece e rejeição obsoleta é descartada', async () => {
  const { controller, players, bySource } = fixture();
  controller.activate('hearth');
  await flush();
  loadPlayers(players);
  const signal = bySource(3)[0];

  controller.playSignal('enable');
  controller.playSignal('enable');
  signal.seekRequests[0].reject(new Error('obsoleto'));
  await flush();
  assert.equal(controller.getSnapshot().error, null);

  signal.seekRequests[1].reject(new Error('seek atual falhou'));
  await flush();
  assert.deepEqual(controller.getSnapshot(), { ready: false, error: 'seek atual falhou' });
});

test('criação parcial e dispose liberam todos os players criados', async () => {
  const players: FakePlayer[] = [];
  let creations = 0;
  const controller = createThemeAudioController({
    platform: {
      configureMode: async () => undefined,
      createPlayer(source) {
        creations += 1;
        if (creations === 4) throw new Error('sem recurso nativo');
        const player = new FakePlayer(source);
        players.push(player);
        return player;
      },
    },
    ambienceSources: { hearth: 1, spaceflight: 2 },
    signalSources: { enable: 3, press: 4, select: 5, open: 6, close: 7, navigate: 8 },
  });

  controller.activate('hearth');
  await flush();
  assert.deepEqual(controller.getSnapshot(), { ready: false, error: 'sem recurso nativo' });
  assert.equal(players.length, 3);
  assert.ok(players.every(player => player.releases === 1));

  controller.retry();
  await flush();
  loadPlayers(players.slice(3));
  controller.dispose();
  assert.ok(players.every(player => player.releases === 1));
  assert.deepEqual(controller.getSnapshot(), { ready: false, error: null });
});

test('publica ready somente após a ambiência carregar e exige carregamento do sinal', async () => {
  const { controller, bySource } = fixture();

  controller.activate('hearth');
  await flush();

  assert.deepEqual(controller.getSnapshot(), { ready: false, error: null });
  const ambience = bySource(1)[0];
  const press = bySource(4)[0];
  const select = bySource(5)[0];
  press.emit({ isLoaded: true, error: null });
  assert.deepEqual(controller.getSnapshot(), { ready: false, error: null });
  assert.equal(ambience.plays, 0);

  ambience.emit({ isLoaded: true, error: null });
  assert.deepEqual(controller.getSnapshot(), { ready: true, error: null });
  assert.equal(ambience.plays, 1);

  controller.playSignal('select');
  assert.equal(select.seekRequests.length, 0);
  controller.playSignal('press');
  assert.equal(press.seekRequests.length, 1);
});

test('ativar o mesmo modo novamente não recria a sessão', async () => {
  const { controller, players } = fixture();

  controller.activate('hearth');
  await flush();
  controller.activate('hearth');
  await flush();

  assert.equal(players.length, 7);
});

test('troca de modo toca navigate uma vez somente após o player novo ficar pronto', async () => {
  const { controller, players, bySource } = fixture();

  controller.activate('hearth');
  await flush();
  loadPlayers(players);
  controller.activate('spaceflight');
  await flush();

  const ambience = bySource(2)[0];
  const navigate = bySource(8)[1];
  assert.deepEqual(controller.getSnapshot(), { ready: false, error: null });
  assert.equal(navigate.seekRequests.length, 0);

  navigate.emit({ isLoaded: true, error: null });
  assert.equal(navigate.seekRequests.length, 0);
  ambience.emit({ isLoaded: true, error: null });
  assert.deepEqual(controller.getSnapshot(), { ready: true, error: null });
  assert.equal(navigate.seekRequests.length, 1);

  navigate.seekRequests[0].resolve();
  await flush();
  navigate.emit({ isLoaded: true, error: null });
  assert.equal(navigate.plays, 1);
  assert.equal(navigate.seekRequests.length, 1);
});

test('desativação antes do carregamento libera e bloqueia status tardio', async () => {
  const { controller, players, bySource } = fixture();

  controller.activate('hearth');
  await flush();
  const ambience = bySource(1)[0];
  controller.deactivate();
  ambience.emitRetained({ isLoaded: true, error: null });

  assert.deepEqual(controller.getSnapshot(), { ready: false, error: null });
  assert.equal(ambience.plays, 0);
  assert.ok(players.every(player => player.releases === 1));
});
