import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createExpoPushTransport,
  createSupabaseNativePushStore,
  enqueueNativePushNotification,
  parseNativeInstallationInput,
  registerNativePushInstallation,
  runNativePushWorker,
  unlinkNativePushInstallation,
  type ClaimedNativeDelivery,
  type ClaimedNativeReceipt,
  type NativePushStore,
  type NativeReceiptOutcome,
  type NativeTicketOutcome,
} from '../../src/lib/push-native';

const savedProjectId = process.env.EXPO_PROJECT_ID;

afterEach(() => {
  if (savedProjectId === undefined) delete process.env.EXPO_PROJECT_ID;
  else process.env.EXPO_PROJECT_ID = savedProjectId;
});

function supabaseRpc(rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: null }>) {
  return { rpc } as unknown as SupabaseClient;
}

function delivery(overrides: Partial<ClaimedNativeDelivery> = {}): ClaimedNativeDelivery {
  return {
    deliveryId: 'delivery-1',
    attemptId: 'attempt-1',
    attemptNumber: 1,
    installationId: 'installation-1',
    expoPushToken: 'ExpoPushToken[token1111111111]',
    projectId: 'project-1',
    message: { title: 'Titulo', body: 'Corpo', url: '/ranking', tag: 'ranking:1' },
    ...overrides,
  };
}

function receipt(overrides: Partial<ClaimedNativeReceipt> = {}): ClaimedNativeReceipt {
  return {
    deliveryId: 'delivery-old',
    attemptId: 'attempt-old',
    receiptAttemptNumber: 1,
    installationId: 'installation-old',
    expoPushToken: 'ExpoPushToken[token2222222222]',
    ticketId: 'ticket-old',
    ...overrides,
  };
}

function store(deliveries: ClaimedNativeDelivery[], receipts: ClaimedNativeReceipt[]) {
  const ticketOutcomes: NativeTicketOutcome[] = [];
  const receiptOutcomes: NativeReceiptOutcome[] = [];
  const value: NativePushStore = {
    claimDeliveries: async limit => deliveries.slice(0, limit),
    recordTickets: async outcomes => {
      ticketOutcomes.push(...outcomes);
    },
    claimReceipts: async limit => receipts.slice(0, limit),
    recordReceipts: async outcomes => {
      receiptOutcomes.push(...outcomes);
    },
  };
  return { value, ticketOutcomes, receiptOutcomes };
}

test('fan-out nativo preserva destinatários e deduplica evento por instalação', async () => {
  process.env.EXPO_PROJECT_ID = 'project-1';
  const installations = [
    { id: 'a', userId: 'user-a' },
    { id: 'b', userId: 'user-b' },
    { id: 'c', userId: 'author' },
  ];
  const keys = new Set<string>();
  const client = supabaseRpc(async (name, params) => {
    assert.equal(name, 'enqueue_native_push_deliveries');
    assert.equal('user_id' in params, false);
    const users = params.target_user_ids as string[] | null;
    let queued = 0;
    for (const installation of installations) {
      if (users && !users.includes(installation.userId)) continue;
      if (params.excluded_user_id === installation.userId) continue;
      const key = `${params.target_event_key}:expo:${installation.id}`;
      if (!keys.has(key)) {
        keys.add(key);
        queued += 1;
      }
    }
    return { data: queued, error: null };
  });
  const message = { title: 'Comentario', body: 'Novo', url: '/jogo-do-mes', tag: 'comment:month' };

  assert.deepEqual(
    await enqueueNativePushNotification(client, 'comment:one', message, undefined, 'author'),
    { queued: 2, configured: true },
  );
  assert.deepEqual(
    await enqueueNativePushNotification(client, 'comment:one', message, undefined, 'author'),
    { queued: 0, configured: true },
  );
  assert.deepEqual(
    await enqueueNativePushNotification(client, 'reward:one', message, ['user-b']),
    { queued: 1, configured: true },
  );
});

test('registro troca conta, rotaciona token e logout antigo não remove vínculo novo', async () => {
  type State = { userId: string; token: string; projectId: string; platform: 'android' | 'ios'; linkedAt: string };
  let state: State | null = null;
  const clientFor = (userId: string) => supabaseRpc(async (name, params) => {
    if (name === 'register_native_push_installation') {
      const previous: State | null = state;
      state = {
        userId,
        token: String(params.target_expo_push_token),
        projectId: String(params.target_project_id),
        platform: params.target_platform as State['platform'],
        linkedAt: '2026-09-10T12:00:00.000Z',
      };
      return {
        data: {
          installation: {
            installationId: String(params.target_installation_id),
            projectId: state.projectId,
            platform: state.platform,
            linkedAt: state.linkedAt,
          },
          rotated: previous !== null && previous.token !== state.token,
          transferred: previous !== null && previous.userId !== state.userId,
        },
        error: null,
      };
    }
    assert.equal(name, 'unlink_native_push_installation');
    const matches = state?.userId === userId && state.token === params.expected_expo_push_token;
    if (matches) state = null;
    return { data: matches, error: null };
  });
  const first = {
    installationId: 'installation-device-1',
    expoPushToken: 'ExpoPushToken[token1111111111]',
    projectId: 'project-1',
    platform: 'android' as const,
  };

  assert.equal((await registerNativePushInstallation(clientFor('user-a'), first)).transferred, false);
  const rotated = { ...first, expoPushToken: 'ExpoPushToken[token2222222222]' };
  assert.equal((await registerNativePushInstallation(clientFor('user-a'), rotated)).rotated, true);
  assert.equal((await registerNativePushInstallation(clientFor('user-b'), rotated)).transferred, true);
  assert.equal(await unlinkNativePushInstallation(clientFor('user-a'), rotated.installationId, rotated.expoPushToken), false);
  assert.equal(state?.userId, 'user-b');
  assert.equal(await unlinkNativePushInstallation(clientFor('user-b'), rotated.installationId, first.expoPushToken), false);
  assert.equal(state?.userId, 'user-b');
});

test('worker persiste tickets, token inválido e retries transitórios por item', async () => {
  const claimed = [
    delivery(),
    delivery({ deliveryId: 'delivery-2', attemptId: 'attempt-2' }),
    delivery({ deliveryId: 'delivery-3', attemptId: 'attempt-3', attemptNumber: 2 }),
  ];
  const dueReceipt = receipt();
  const fake = store(claimed, [dueReceipt]);
  const result = await runNativePushWorker(fake.value, {
    send: async messages => {
      assert.equal(messages.length, 3);
      assert.deepEqual(messages[0].data, { url: '/ranking', tag: 'ranking:1' });
      assert.equal(messages[0].sound, 'default');
      assert.equal(messages[0].channelId, 'default');
      return [
        { status: 'ok', id: 'ticket-1' },
        { status: 'error', details: { error: 'DeviceNotRegistered' } },
        { status: 'error', details: { error: 'MessageRateExceeded' } },
      ];
    },
    getReceipts: async ids => {
      assert.deepEqual(ids, ['ticket-old']);
      return {
        'ticket-old': { status: 'error', details: { error: 'MessageRateExceeded' } },
      };
    },
  }, new Date('2026-09-10T12:00:00.000Z'));

  assert.deepEqual(fake.ticketOutcomes.map(outcome => outcome.status), ['ticketed', 'invalid_token', 'retry']);
  assert.equal(fake.ticketOutcomes[2].retryAt, '2026-09-10T12:05:00.000Z');
  assert.deepEqual(fake.receiptOutcomes.map(outcome => outcome.status), ['retry']);
  assert.deepEqual(result, {
    claimed: 3,
    ticketed: 1,
    delivered: 0,
    retried: 2,
    invalidTokens: 1,
    failed: 0,
    awaitingReceipt: 0,
  });
});

test('worker limita resposta externa incerta e receipt ausente', async () => {
  const fake = store(
    [delivery({ attemptNumber: 5 })],
    [receipt({ receiptAttemptNumber: 5 })],
  );
  const result = await runNativePushWorker(fake.value, {
    send: async () => {
      throw new Error('connection reset after write');
    },
    getReceipts: async () => ({}),
  }, new Date('2026-09-10T12:00:00.000Z'));

  assert.equal(fake.ticketOutcomes[0].status, 'unknown');
  assert.equal(fake.ticketOutcomes[0].uncertain, true);
  assert.equal(fake.receiptOutcomes[0].status, 'unknown');
  assert.equal(result.failed, 2);
});

test('worker nunca mistura projetos Expo no mesmo lote', async () => {
  const fake = store([
    delivery({ deliveryId: 'delivery-a', projectId: 'project-a' }),
    delivery({ deliveryId: 'delivery-b', projectId: 'project-b' }),
    delivery({ deliveryId: 'delivery-c', projectId: 'project-a' }),
  ], []);
  const batches: string[][] = [];
  await runNativePushWorker(fake.value, {
    send: async messages => {
      batches.push(messages.map(message => message.to));
      return messages.map((_, index) => ({ status: 'ok', id: `ticket-${batches.length}-${index}` }));
    },
    getReceipts: async () => ({}),
  });

  assert.deepEqual(batches.map(batch => batch.length), [2, 1]);
  assert.equal(fake.ticketOutcomes.every(outcome => outcome.status === 'ticketed'), true);
});

test('receipt ok não é tratado como entrega observada no aparelho e token inválido é desativável', async () => {
  const receipts = [
    receipt(),
    receipt({ deliveryId: 'delivery-bad', attemptId: 'attempt-bad', ticketId: 'ticket-bad' }),
  ];
  const fake = store([], receipts);
  const result = await runNativePushWorker(fake.value, {
    send: async () => [],
    getReceipts: async () => ({
      'ticket-old': { status: 'ok' },
      'ticket-bad': { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
    }),
  });

  assert.deepEqual(fake.receiptOutcomes.map(outcome => outcome.status), ['delivered', 'invalid_token']);
  assert.equal(result.delivered, 1);
  assert.equal(result.invalidTokens, 1);
});

test('validação rejeita projeto, plataforma e token inválidos', () => {
  const valid = {
    installationId: 'installation-device-1',
    expoPushToken: 'ExpoPushToken[token1111111111]',
    projectId: 'project-1',
    platform: 'ios',
  };
  assert.deepEqual(parseNativeInstallationInput(valid, 'project-1'), valid);
  assert.throws(() => parseNativeInstallationInput({ ...valid, projectId: 'project-2' }, 'project-1'), /Invalid Expo project/);
  assert.throws(() => parseNativeInstallationInput({ ...valid, platform: 'web' }, 'project-1'), /Invalid native platform/);
  assert.throws(() => parseNativeInstallationInput({ ...valid, expoPushToken: 'token' }, 'project-1'), /Invalid Expo push token/);
});

test('transporte Expo diferencia rejeição permanente de falha transitória', async () => {
  const messages = [{
    to: 'ExpoPushToken[token1111111111]',
    title: 'Titulo',
    body: 'Corpo',
    sound: 'default' as const,
    channelId: 'default' as const,
    data: { url: '/ranking', tag: 'ranking:1' },
  }];
  const permanent = createExpoPushTransport(async () => new Response('{}', {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  }));
  const transient = createExpoPushTransport(async () => new Response('{}', {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  }));

  const permanentStore = store([delivery()], []);
  await runNativePushWorker(permanentStore.value, permanent);
  assert.equal(permanentStore.ticketOutcomes[0].status, 'failed');
  assert.equal(permanentStore.ticketOutcomes[0].uncertain, undefined);

  const transientStore = store([delivery()], []);
  await runNativePushWorker(transientStore.value, transient);
  assert.equal(transientStore.ticketOutcomes[0].status, 'retry');
  assert.equal(transientStore.ticketOutcomes[0].uncertain, true);
  await assert.rejects(permanent.send(messages), /HTTP 400/);
});

test('store rejeita métricas quando o resultado perdeu a lease antes de persistir', async () => {
  const calls: string[] = [];
  const client = supabaseRpc(async name => {
    calls.push(name);
    return { data: false, error: null };
  });
  const persisted = createSupabaseNativePushStore(client, 'worker-1');

  await assert.rejects(
    persisted.recordTickets([{
      delivery: delivery(),
      status: 'ticketed',
      ticketId: 'ticket-1',
    }]),
    /ticket outcome was not persisted/,
  );
  await assert.rejects(
    persisted.recordReceipts([{
      receipt: receipt(),
      status: 'delivered',
    }]),
    /receipt outcome was not persisted/,
  );
  assert.deepEqual(calls, ['record_native_push_ticket', 'record_native_push_receipt']);
});

test('worker limita chamadas Expo paradas e persiste retry de envio e de receipt', async () => {
  let aborted = 0;
  const stalledFetch: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      aborted += 1;
      reject(init.signal?.reason);
    }, { once: true });
  });
  const fake = store([delivery()], [receipt()]);
  const transport = createExpoPushTransport(stalledFetch, { timeoutMs: 20 });
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      runNativePushWorker(fake.value, transport),
      new Promise((_, reject) => {
        watchdog = setTimeout(() => reject(new Error('Expo transport did not enforce its deadline')), 500);
      }),
    ]);
  } finally {
    clearTimeout(watchdog);
  }
  assert.equal(aborted, 2);
  assert.equal(fake.ticketOutcomes[0].status, 'retry');
  assert.equal(fake.ticketOutcomes[0].uncertain, true);
  assert.equal(fake.receiptOutcomes[0].status, 'awaiting');
});
