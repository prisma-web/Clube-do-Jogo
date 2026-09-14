import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createPushController,
  type NotificationsAdapter,
  type PushPermission,
  type PushToken,
} from '../../apps/mobile/src/platform/push-controller';
import { createNativePushApi, type NativePushApi, type NativePushRegistrationInput } from '../../apps/mobile/src/platform/push-api';
import type { NativeStorage } from '../../apps/mobile/src/platform/storage';

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

class MemoryStorage implements NativeStorage {
  values = new Map<string, string>();
  getItem = async (key: string) => this.values.get(key) ?? null;
  setItem = async (key: string, value: string) => { this.values.set(key, value); };
  removeItem = async (key: string) => { this.values.delete(key); };
}

class FakeAdapter implements NotificationsAdapter {
  available = true;
  permission: PushPermission = 'undetermined';
  requested = 0;
  tokenReads = 0;
  token: PushToken = {
    expoPushToken: 'ExpoPushToken[token-old-123456]',
    projectId: 'project-real',
    platform: 'android',
  };
  tokenListener: ((token: PushToken) => void) | null = null;

  availability = () => ({ available: this.available, projectId: this.available ? 'project-real' : null, platform: 'android' as const });
  getPermission = async () => this.permission;
  requestPermission = async () => { this.requested += 1; return this.permission; };
  getToken = async () => { this.tokenReads += 1; return { ...this.token }; };
  subscribeToken = (listener: (token: PushToken) => void) => { this.tokenListener = listener; return () => { this.tokenListener = null; }; };
  subscribeReceived = () => () => undefined;
  subscribeResponses = () => () => undefined;
  getLastResponse = async () => null;
  clearLastResponse = async () => undefined;
  subscribeForeground = () => () => undefined;

  rotate(token: string) {
    this.token = { ...this.token, expoPushToken: token };
    this.tokenListener?.(this.token);
  }
}

class FakeApi implements NativePushApi {
  registrations: NativePushRegistrationInput[] = [];
  unlinks: Array<Pick<NativePushRegistrationInput, 'installationId' | 'expoPushToken'>> = [];
  unlinkSignals: Array<AbortSignal | undefined> = [];
  registerImpl: (input: NativePushRegistrationInput) => Promise<{ rotated: boolean; transferred: boolean }> = async () => ({ rotated: false, transferred: false });
  unlinkImpl: (input: Pick<NativePushRegistrationInput, 'installationId' | 'expoPushToken'>) => Promise<{ unlinked: boolean }> = async () => ({ unlinked: true });

  async register(input: NativePushRegistrationInput) {
    this.registrations.push(input);
    return this.registerImpl(input);
  }
  async unlink(input: Pick<NativePushRegistrationInput, 'installationId' | 'expoPushToken'>, options?: { signal?: AbortSignal }) {
    this.unlinks.push(input);
    this.unlinkSignals.push(options?.signal);
    return this.unlinkImpl(input);
  }
}

function createFixture() {
  const adapter = new FakeAdapter();
  const api = new FakeApi();
  const storage = new MemoryStorage();
  const controller = createPushController({
    adapter,
    api,
    storage,
    createInstallationId: () => '11111111-1111-4111-8111-111111111111',
    unlinkTimeoutMs: 20,
  });
  return { adapter, api, storage, controller };
}

const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test('mount and login never prompt; explicit action grants and confirms one server binding', async () => {
  const { adapter, api, controller } = createFixture();
  await controller.start();
  await controller.setSession({ userId: 'account-a', epoch: 1 });
  assert.equal(controller.getSnapshot().status, 'not-requested');
  assert.equal(adapter.requested, 0);
  assert.equal(adapter.tokenReads, 0);

  adapter.permission = 'granted';
  await controller.requestPermission();
  assert.equal(adapter.requested, 1);
  assert.equal(api.registrations.length, 1);
  assert.deepEqual(controller.getSnapshot(), {
    status: 'enabled', registered: true, remoteUnlinkPending: false, error: null,
  });
});

test('missing project configuration stays unavailable without a technical error or permission prompt', async () => {
  const { adapter, api, controller } = createFixture();
  adapter.available = false;
  await controller.start();
  await controller.setSession({ userId: 'account-a', epoch: 1 });
  await controller.requestPermission();
  assert.deepEqual(controller.getSnapshot(), {
    status: 'unavailable', registered: false, remoteUnlinkPending: false, error: null,
  });
  assert.equal(adapter.requested, 0);
  assert.equal(api.registrations.length, 0);
});

test('denial remains denied and automatic retry does not open a second system prompt', async () => {
  const { adapter, api, controller } = createFixture();
  await controller.start();
  await controller.setSession({ userId: 'account-a', epoch: 1 });
  adapter.permission = 'denied';
  await controller.requestPermission();
  await controller.retry();
  assert.equal(controller.getSnapshot().status, 'denied');
  assert.equal(adapter.requested, 1);
  assert.equal(api.registrations.length, 0);
});

test('offline registration is observable and retry reuses the installation ID idempotently', async () => {
  const { adapter, api, controller } = createFixture();
  adapter.permission = 'granted';
  let attempts = 0;
  api.registerImpl = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('rede indisponível');
    return { rotated: false, transferred: false };
  };
  await controller.start();
  await controller.setSession({ userId: 'account-a', epoch: 1 });
  assert.equal(controller.getSnapshot().status, 'error');
  assert.match(controller.getSnapshot().error ?? '', /rede indisponível/);
  await controller.retry();
  assert.equal(controller.getSnapshot().registered, true);
  assert.equal(api.registrations[0].installationId, api.registrations[1].installationId);
});

test('late account A registration cannot publish into account B and B is rebound afterward', async () => {
  const { adapter, api, controller } = createFixture();
  adapter.permission = 'granted';
  const first = new Deferred<{ rotated: boolean; transferred: boolean }>();
  const second = new Deferred<{ rotated: boolean; transferred: boolean }>();
  let calls = 0;
  api.registerImpl = () => (++calls === 1 ? first.promise : second.promise);
  await controller.start();
  const accountA = controller.setSession({ userId: 'account-a', epoch: 1 });
  await flush();
  adapter.token = { ...adapter.token, expoPushToken: 'ExpoPushToken[token-new-123456]' };
  const accountB = controller.setSession({ userId: 'account-b', epoch: 2 });
  assert.equal(controller.getSnapshot().registered, false);
  first.resolve({ rotated: false, transferred: false });
  await accountA;
  await flush();
  assert.equal(api.registrations.length, 2);
  assert.equal(controller.getSnapshot().registered, false);
  second.resolve({ rotated: true, transferred: true });
  await accountB;
  assert.equal(controller.getSnapshot().registered, true);
  assert.equal(api.registrations[1].expoPushToken, 'ExpoPushToken[token-new-123456]');
});

test('logout sends the last confirmed token and never substitutes an unconfirmed rotation', async () => {
  const { adapter, api, controller } = createFixture();
  adapter.permission = 'granted';
  await controller.start();
  await controller.setSession({ userId: 'account-a', epoch: 1 });
  adapter.token = { ...adapter.token, expoPushToken: 'ExpoPushToken[token-new-123456]' };
  const result = await controller.prepareSignOut();
  assert.deepEqual(result, { unlinked: true });
  assert.equal(api.unlinks[0].expoPushToken, 'ExpoPushToken[token-old-123456]');
});

test('token rotation is serialized and confirms the new Expo token', async () => {
  const { adapter, api, controller } = createFixture();
  adapter.permission = 'granted';
  await controller.start();
  await controller.setSession({ userId: 'account-a', epoch: 1 });
  adapter.rotate('ExpoPushToken[token-new-123456]');
  await flush();
  await controller.reconcile();
  assert.equal(api.registrations.at(-1)?.expoPushToken, 'ExpoPushToken[token-new-123456]');
  assert.equal(controller.getSnapshot().registered, true);
});

test('logout queued behind token rotation unlinks the newly confirmed binding', async () => {
  const { adapter, api, controller } = createFixture();
  adapter.permission = 'granted';
  await controller.start();
  await controller.setSession({ userId: 'account-a', epoch: 1 });
  const rotation = new Deferred<{ rotated: boolean; transferred: boolean }>();
  api.registerImpl = () => rotation.promise;
  const nextToken = 'ExpoPushToken[token-new-123456]';
  api.unlinkImpl = async input => ({ unlinked: input.expoPushToken === nextToken });
  adapter.rotate(nextToken);
  await flush();
  const logout = controller.prepareSignOut();
  rotation.resolve({ rotated: true, transferred: false });
  assert.deepEqual(await logout, { unlinked: true });
  assert.equal(api.unlinks[0].expoPushToken, nextToken);
});

test('logout timeout is reported while local session can be cleared and late DELETE cannot start under B', async () => {
  const { adapter, api, controller } = createFixture();
  adapter.permission = 'granted';
  await controller.start();
  await controller.setSession({ userId: 'account-a', epoch: 1 });
  const blocked = new Deferred<{ unlinked: boolean }>();
  api.unlinkImpl = () => blocked.promise;
  const result = await controller.prepareSignOut();
  assert.deepEqual(result, { unlinked: false, reason: 'timeout' });
  assert.equal(api.unlinkSignals[0]?.aborted, true);
  assert.equal(controller.getSnapshot().remoteUnlinkPending, true);
  controller.clearSession();
  const accountB = controller.setSession({ userId: 'account-b', epoch: 2 });
  blocked.resolve({ unlinked: true });
  await accountB;
  assert.equal(controller.getSnapshot().registered, true);
});

test('queued logout for A is abandoned before HTTP when the session changes to B', async () => {
  const { adapter, api, controller } = createFixture();
  adapter.permission = 'granted';
  await controller.start();
  await controller.setSession({ userId: 'account-a', epoch: 1 });
  const registration = new Deferred<{ rotated: boolean; transferred: boolean }>();
  api.registerImpl = () => registration.promise;
  adapter.rotate('ExpoPushToken[token-new-123456]');
  await flush();
  const logout = controller.prepareSignOut();
  await new Promise(resolve => setTimeout(resolve, 25));
  controller.clearSession();
  api.registerImpl = async () => ({ rotated: false, transferred: true });
  const accountB = controller.setSession({ userId: 'account-b', epoch: 2 });
  registration.resolve({ rotated: false, transferred: false });
  assert.deepEqual(await logout, { unlinked: false, reason: 'timeout' });
  await accountB;
  assert.equal(api.unlinks.length, 0);
});

test('HTTP adapter sends installation identity without a client-controlled user ID', async () => {
  const requests: Array<{ path: string; init?: RequestInit }> = [];
  const api = createNativePushApi({
    async request(path, init) {
      requests.push({ path, init });
      return new Response(JSON.stringify(init?.method === 'DELETE'
        ? { unlinked: true }
        : { rotated: false, transferred: true }), { status: 200 });
    },
  });
  const registration: NativePushRegistrationInput = {
    installationId: 'installation-1', expoPushToken: 'ExpoPushToken[token-123456789]',
    projectId: 'project-real', platform: 'ios',
  };
  await api.register(registration);
  await api.unlink({ installationId: registration.installationId, expoPushToken: registration.expoPushToken });
  assert.equal(requests[0].path, '/api/push/native-installations');
  assert.equal(requests[0].init?.method, 'POST');
  assert.equal(requests[1].init?.method, 'DELETE');
  assert.equal('userId' in JSON.parse(String(requests[0].init?.body)), false);
});
