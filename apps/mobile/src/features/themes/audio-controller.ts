export type CosmicSceneMode = 'hearth' | 'spaceflight';
export type ThemeAudioSignal = 'enable' | 'press' | 'select' | 'open' | 'close' | 'navigate';

export interface ThemeAudioPlayerStatus {
  isLoaded: boolean;
  error: string | null;
}

export interface ThemeAudioPlayer {
  readonly currentStatus: ThemeAudioPlayerStatus;
  loop: boolean;
  volume: number;
  pause(): void;
  play(): void;
  seekTo(seconds: number): Promise<void>;
  addListener(
    event: 'playbackStatusUpdate',
    listener: (status: ThemeAudioPlayerStatus) => void,
  ): { remove(): void };
  release(): void;
}

export interface ThemeAudioPlatform {
  configureMode(): Promise<void>;
  createPlayer(source: number): ThemeAudioPlayer;
}

export interface ThemeAudioControllerSnapshot {
  ready: boolean;
  error: string | null;
}

export interface ThemeAudioController {
  activate(mode: CosmicSceneMode): void;
  deactivate(): void;
  dispose(): void;
  retry(): void;
  playSignal(signal: ThemeAudioSignal): void;
  setAmbienceEnabled(enabled: boolean): void;
  setAmbienceVolume(volume: number): void;
  isModeActive(mode: CosmicSceneMode): boolean;
  subscribe(listener: () => void): () => void;
  getSnapshot(): ThemeAudioControllerSnapshot;
}

interface ControllerOptions {
  platform: ThemeAudioPlatform;
  ambienceSources: Record<CosmicSceneMode, number>;
  signalSources: Record<ThemeAudioSignal, number>;
}

interface PlayerResources {
  epoch: number;
  players: ThemeAudioPlayer[];
  ambience: ThemeAudioPlayer | null;
  signals: Partial<Record<ThemeAudioSignal, ThemeAudioPlayer>>;
  subscriptions: Array<{ remove(): void }>;
  loadedPlayers: Set<ThemeAudioPlayer>;
  ambienceStarted: boolean;
  released: boolean;
}

const SIGNALS: ThemeAudioSignal[] = ['enable', 'press', 'select', 'open', 'close', 'navigate'];
const DEFAULT_AMBIENCE_VOLUME = 0.8;
const SIGNAL_VOLUME = 0.7;

function describe(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return 'O áudio do tema não pôde ser iniciado neste dispositivo.';
}

function releaseResources(resources: PlayerResources | null): void {
  if (!resources || resources.released) return;
  resources.released = true;
  for (const subscription of resources.subscriptions) {
    try {
      subscription.remove();
    } catch {}
  }
  for (const player of resources.players) {
    try {
      player.pause();
    } catch {}
    try {
      player.release();
    } catch {}
  }
}

export function createThemeAudioController({
  platform,
  ambienceSources,
  signalSources,
}: ControllerOptions): ThemeAudioController {
  let snapshot: ThemeAudioControllerSnapshot = { ready: false, error: null };
  let desiredMode: CosmicSceneMode | null = null;
  let epoch = 0;
  let resources: PlayerResources | null = null;
  let pendingModeSignal = false;
  let ambienceEnabled = true;
  let ambienceVolume = DEFAULT_AMBIENCE_VOLUME;
  const listeners = new Set<() => void>();
  const signalTokens: Record<ThemeAudioSignal, number> = {
    enable: 0,
    press: 0,
    select: 0,
    open: 0,
    close: 0,
    navigate: 0,
  };

  function publish(next: ThemeAudioControllerSnapshot): void {
    if (snapshot.ready === next.ready && snapshot.error === next.error) return;
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function invalidate(): number {
    epoch += 1;
    const previous = resources;
    resources = null;
    for (const signal of SIGNALS) signalTokens[signal] += 1;
    releaseResources(previous);
    return epoch;
  }

  function isCurrent(targetEpoch: number, targetResources?: PlayerResources): boolean {
    return (
      desiredMode !== null &&
      epoch === targetEpoch &&
      (targetResources === undefined || resources === targetResources)
    );
  }

  function fail(targetEpoch: number, failure: unknown, targetResources?: PlayerResources): void {
    if (!isCurrent(targetEpoch, targetResources)) return;
    invalidate();
    publish({ ready: false, error: describe(failure) });
  }

  function maybePlayModeSignal(targetResources: PlayerResources): void {
    const player = targetResources.signals.navigate;
    if (
      !pendingModeSignal ||
      !player ||
      !targetResources.loadedPlayers.has(player) ||
      !snapshot.ready ||
      !isCurrent(targetResources.epoch, targetResources)
    ) {
      return;
    }
    pendingModeSignal = false;
    const token = signalTokens.navigate + 1;
    signalTokens.navigate = token;
    void restartSignal('navigate', player, targetResources, token);
  }

  function updatePlayerStatus(
    targetResources: PlayerResources,
    player: ThemeAudioPlayer,
    status: ThemeAudioPlayerStatus,
  ): void {
    if (!isCurrent(targetResources.epoch, targetResources)) return;
    if (status.error) {
      fail(targetResources.epoch, status.error, targetResources);
      return;
    }
    if (status.isLoaded) targetResources.loadedPlayers.add(player);
    else targetResources.loadedPlayers.delete(player);

    if (player === targetResources.ambience) {
      if (status.isLoaded && !targetResources.ambienceStarted && ambienceEnabled) {
        targetResources.ambienceStarted = true;
        try {
          player.play();
        } catch (failure) {
          fail(targetResources.epoch, failure, targetResources);
          return;
        }
      }
      if (!isCurrent(targetResources.epoch, targetResources)) return;
      publish({
        ready: targetResources.loadedPlayers.has(player),
        error: null,
      });
    }
    maybePlayModeSignal(targetResources);
  }

  async function prepare(targetEpoch: number, mode: CosmicSceneMode): Promise<void> {
    try {
      await platform.configureMode();
    } catch (failure) {
      fail(targetEpoch, failure);
      return;
    }
    if (!isCurrent(targetEpoch) || desiredMode !== mode) return;

    const created: PlayerResources = {
      epoch: targetEpoch,
      players: [],
      ambience: null,
      signals: {},
      subscriptions: [],
      loadedPlayers: new Set(),
      ambienceStarted: false,
      released: false,
    };
    try {
      const ambience = platform.createPlayer(ambienceSources[mode]);
      created.players.push(ambience);
      created.ambience = ambience;
      ambience.loop = true;
      ambience.volume = ambienceVolume;

      for (const signal of SIGNALS) {
        const player = platform.createPlayer(signalSources[signal]);
        created.players.push(player);
        created.signals[signal] = player;
        player.volume = SIGNAL_VOLUME;
      }

      for (const player of created.players) {
        const subscription = player.addListener('playbackStatusUpdate', status => {
          updatePlayerStatus(created, player, status);
        });
        created.subscriptions.push(subscription);
      }

      if (!isCurrent(targetEpoch) || desiredMode !== mode) {
        releaseResources(created);
        return;
      }
      resources = created;
      for (const player of created.players) {
        if (!isCurrent(targetEpoch, created)) break;
        updatePlayerStatus(created, player, player.currentStatus);
      }
    } catch (failure) {
      releaseResources(created);
      fail(targetEpoch, failure, resources === created ? created : undefined);
    }
  }

  function startSession(mode: CosmicSceneMode): void {
    const targetEpoch = invalidate();
    desiredMode = mode;
    publish({ ready: false, error: null });
    void prepare(targetEpoch, mode);
  }

  function activate(mode: CosmicSceneMode): void {
    if (desiredMode === mode) return;
    pendingModeSignal = desiredMode !== null;
    startSession(mode);
  }

  function deactivate(): void {
    desiredMode = null;
    pendingModeSignal = false;
    invalidate();
    publish({ ready: false, error: null });
  }

  async function restartSignal(
    signal: ThemeAudioSignal,
    player: ThemeAudioPlayer,
    targetResources: PlayerResources,
    token: number,
  ): Promise<void> {
    try {
      player.volume = SIGNAL_VOLUME;
      player.pause();
      await player.seekTo(0);
      if (
        !isCurrent(targetResources.epoch, targetResources) ||
        !targetResources.loadedPlayers.has(player) ||
        !snapshot.ready ||
        signalTokens[signal] !== token
      ) {
        return;
      }
      player.play();
    } catch (failure) {
      if (
        isCurrent(targetResources.epoch, targetResources) &&
        snapshot.ready &&
        signalTokens[signal] === token
      ) {
        fail(targetResources.epoch, failure, targetResources);
      }
    }
  }

  function playSignal(signal: ThemeAudioSignal): void {
    const current = resources;
    const player = current?.signals[signal];
    if (
      !current ||
      !player ||
      !current.loadedPlayers.has(player) ||
      !snapshot.ready ||
      !isCurrent(current.epoch, current)
    ) {
      return;
    }
    const token = signalTokens[signal] + 1;
    signalTokens[signal] = token;
    void restartSignal(signal, player, current, token);
  }

  function retry(): void {
    if (desiredMode === null) return;
    startSession(desiredMode);
  }

  function setAmbienceEnabled(enabled: boolean): void {
    ambienceEnabled = enabled;
    const current = resources;
    if (!current || !current.ambience) return;
    const player = current.ambience;
    if (enabled) {
      if (current.loadedPlayers.has(player) && !current.ambienceStarted) {
        current.ambienceStarted = true;
        try {
          player.play();
        } catch (failure) {
          fail(current.epoch, failure, current);
        }
      }
    } else if (current.ambienceStarted) {
      current.ambienceStarted = false;
      try {
        player.pause();
      } catch {}
    }
  }

  function setAmbienceVolume(volume: number): void {
    ambienceVolume = volume;
    if (resources?.ambience) resources.ambience.volume = volume;
  }

  return {
    activate,
    deactivate,
    dispose: deactivate,
    retry,
    playSignal,
    setAmbienceEnabled,
    setAmbienceVolume,
    isModeActive: mode => desiredMode === mode,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
  };
}
