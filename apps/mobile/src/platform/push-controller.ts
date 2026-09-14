import type { NativeStorage } from './storage';
import type { NativePushApi } from './push-api';

const INSTALLATION_KEY = '@clube-do-jogo/push/installation-id';
const BINDING_KEY = '@clube-do-jogo/push/binding';

export type PushPlatform = 'android' | 'ios';
export type PushPermission = 'undetermined' | 'denied' | 'granted';
export type PushPermissionState = 'unavailable' | 'not-requested' | 'denied' | 'enabling' | 'enabled' | 'error';

export type PushSession = { userId: string; epoch: number };
export type PushToken = { expoPushToken: string; projectId: string; platform: PushPlatform };
export type NativeNotification = { identifier: string; data: Record<string, unknown> };
export type NativeNotificationResponse = NativeNotification & { actionIdentifier: string };

export type PushNotificationsSnapshot = {
  status: PushPermissionState;
  registered: boolean;
  remoteUnlinkPending: boolean;
  error: string | null;
};

export interface NotificationsAdapter {
  availability(): { available: boolean; projectId: string | null; platform: PushPlatform | null };
  getPermission(): Promise<PushPermission>;
  requestPermission(): Promise<PushPermission>;
  getToken(): Promise<PushToken>;
  subscribeToken(listener: (token: PushToken) => void): () => void;
  subscribeReceived(listener: (notification: NativeNotification) => void): () => void;
  subscribeResponses(listener: (response: NativeNotificationResponse) => void): () => void;
  getLastResponse(): Promise<NativeNotificationResponse | null>;
  clearLastResponse(): Promise<void>;
  subscribeForeground(listener: () => void): () => void;
}

export interface PushController {
  getSnapshot(): PushNotificationsSnapshot;
  subscribe(listener: () => void): () => void;
  setSession(session: PushSession | null): Promise<void>;
  start(): Promise<() => void>;
  requestPermission(): Promise<void>;
  retry(): Promise<void>;
  reconcile(): Promise<void>;
  prepareSignOut(): Promise<{ unlinked: boolean; reason?: 'offline' | 'timeout' | 'stale' }>;
  clearSession(): void;
}

type Binding = PushToken & { installationId: string };

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Não foi possível configurar as notificações.';
}

function validBinding(raw: string | null): Binding | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Binding>;
    if (typeof value.installationId !== 'string' || typeof value.expoPushToken !== 'string'
      || typeof value.projectId !== 'string' || (value.platform !== 'android' && value.platform !== 'ios')) return null;
    return value as Binding;
  } catch {
    return null;
  }
}

function fallbackUuid() {
  const random = () => Math.floor(Math.random() * 16);
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const value = random();
    return (character === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
}

function defaultInstallationId() {
  return globalThis.crypto?.randomUUID?.() ?? fallbackUuid();
}

function sameSession(left: PushSession | null, right: PushSession | null) {
  return left?.userId === right?.userId && left?.epoch === right?.epoch;
}

class PushTimeoutError extends Error {}

function timeout<T>(promise: Promise<T>, milliseconds: number, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new PushTimeoutError('timeout'));
    }, milliseconds);
    promise.then(value => {
      clearTimeout(timer);
      resolve(value);
    }, error => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

export function createPushController(options: {
  adapter: NotificationsAdapter;
  api: NativePushApi;
  storage: NativeStorage;
  createInstallationId?: () => string;
  unlinkTimeoutMs?: number;
}): PushController {
  let snapshot: PushNotificationsSnapshot = {
    status: 'unavailable', registered: false, remoteUnlinkPending: false, error: null,
  };
  let session: PushSession | null = null;
  let confirmedBinding: Binding | null = null;
  let started = false;
  let queue: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();
  const disposers: Array<() => void> = [];

  const publish = (next: Partial<PushNotificationsSnapshot>, expected?: PushSession | null) => {
    if (expected !== undefined && !sameSession(expected, session)) return;
    snapshot = { ...snapshot, ...next };
    listeners.forEach(listener => listener());
  };
  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.then(operation, operation);
    queue = result.catch(() => undefined);
    return result;
  };
  const installationId = async () => {
    const stored = await options.storage.getItem(INSTALLATION_KEY);
    if (stored && stored.length >= 8 && stored.length <= 200) return stored;
    const created = (options.createInstallationId ?? defaultInstallationId)();
    await options.storage.setItem(INSTALLATION_KEY, created);
    return created;
  };
  const reconcileNow = async (expected: PushSession | null, suppliedToken?: PushToken) => {
    try {
      const available = options.adapter.availability();
      if (!available.available || !available.projectId || !available.platform) {
        publish({ status: 'unavailable', registered: false, error: null }, expected);
        return;
      }
      const permission = await options.adapter.getPermission();
      if (permission !== 'granted') {
        publish({ status: permission === 'denied' ? 'denied' : 'not-requested', registered: false, error: null }, expected);
        return;
      }
      if (!expected) {
        publish({ status: 'enabled', registered: false, error: null });
        return;
      }
      publish({ status: 'enabling', error: null }, expected);
      const [id, token] = await Promise.all([installationId(), suppliedToken ?? options.adapter.getToken()]);
      if (token.projectId !== available.projectId || token.platform !== available.platform) {
        throw new Error('O token pertence a outro projeto ou plataforma.');
      }
      if (!sameSession(expected, session)) return;
      await options.api.register({ installationId: id, ...token });
      if (!sameSession(expected, session)) return;
      const binding = { installationId: id, ...token };
      await options.storage.setItem(BINDING_KEY, JSON.stringify(binding));
      if (!sameSession(expected, session)) return;
      confirmedBinding = binding;
      publish({ status: 'enabled', registered: true, remoteUnlinkPending: false, error: null }, expected);
    } catch (error) {
      publish({ status: 'error', registered: false, error: errorMessage(error) }, expected);
    }
  };
  const reconcile = () => enqueue(() => reconcileNow(session));

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async start() {
      if (started) return () => undefined;
      started = true;
      const expected = session;
      await enqueue(async () => {
        try {
          confirmedBinding = validBinding(await options.storage.getItem(BINDING_KEY));
          const available = options.adapter.availability();
          if (!available.available || !available.projectId || !available.platform) {
            publish({ status: 'unavailable', registered: false, error: null }, expected);
          } else {
            const permission = await options.adapter.getPermission();
            publish({
              status: permission === 'granted' ? 'enabled' : permission === 'denied' ? 'denied' : 'not-requested',
              registered: false,
              error: null,
            }, expected);
          }
        } catch (error) {
          publish({ status: 'error', registered: false, error: errorMessage(error) }, expected);
        }
      });
      try {
        disposers.push(options.adapter.subscribeToken(token => { void enqueue(() => reconcileNow(session, token)); }));
        disposers.push(options.adapter.subscribeForeground(() => { void reconcile(); }));
      } catch (error) {
        publish({ status: 'error', registered: false, error: errorMessage(error) }, session);
      }
      return () => {
        started = false;
        while (disposers.length) disposers.pop()?.();
      };
    },
    setSession(next) {
      if (!sameSession(next, session)) {
        session = next;
        publish({ registered: false, remoteUnlinkPending: false, error: null });
      }
      return reconcile();
    },
    requestPermission() {
      const expected = session;
      return enqueue(async () => {
        const available = options.adapter.availability();
        if (!available.available || !available.projectId || !available.platform) {
          publish({ status: 'unavailable', registered: false, error: null }, expected);
          return;
        }
        publish({ status: 'enabling', error: null }, expected);
        try {
          const permission = await options.adapter.requestPermission();
          if (!sameSession(expected, session)) return;
          if (permission !== 'granted') {
            publish({ status: permission === 'denied' ? 'denied' : 'not-requested', registered: false }, expected);
            return;
          }
          await reconcileNow(expected);
        } catch (error) {
          publish({ status: 'error', registered: false, error: errorMessage(error) }, expected);
        }
      });
    },
    retry: reconcile,
    reconcile,
    async prepareSignOut() {
      const expected = session;
      if (!expected) return { unlinked: false, reason: 'stale' };
      const timeoutMs = options.unlinkTimeoutMs ?? 2500;
      const deadline = Date.now() + timeoutMs;
      const abort = new AbortController();
      const work = enqueue(async () => {
        const remaining = deadline - Date.now();
        if (remaining <= 0) return { unlinked: false, reason: 'timeout' as const };
        if (!sameSession(expected, session)) {
          return { unlinked: false, reason: 'stale' as const };
        }
        const binding = confirmedBinding;
        if (!binding) return { unlinked: false, reason: 'stale' as const };
        try {
          const result = await timeout(options.api.unlink({
              installationId: binding.installationId,
              expoPushToken: binding.expoPushToken,
            }, { signal: abort.signal }), remaining, () => abort.abort());
          if (!sameSession(expected, session)) return { unlinked: false, reason: 'stale' as const };
          if (result.unlinked) {
            confirmedBinding = null;
            await options.storage.removeItem(BINDING_KEY);
          }
          return result.unlinked
            ? { unlinked: true }
            : { unlinked: false, reason: 'stale' as const };
        } catch (error) {
          publish({ remoteUnlinkPending: true }, expected);
          return { unlinked: false, reason: error instanceof PushTimeoutError ? 'timeout' as const : 'offline' as const };
        }
      });
      try {
        return await timeout(work, timeoutMs, () => abort.abort());
      } catch {
        publish({ remoteUnlinkPending: true }, expected);
        return { unlinked: false, reason: 'timeout' };
      }
    },
    clearSession() {
      session = null;
      confirmedBinding = null;
      publish({ registered: false, remoteUnlinkPending: false, error: null });
    },
  };
}
