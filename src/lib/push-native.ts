import type { SupabaseClient } from '@supabase/supabase-js';
import type { PushMessage } from './push';

const DELIVERY_CLAIM_LIMIT = 25;
const RECEIPT_CLAIM_LIMIT = 100;
const EXPO_SEND_LIMIT = 100;
const EXPO_RECEIPT_LIMIT = 1000;
const MAX_ATTEMPTS = 5;
const SEND_RETRY_SECONDS = [60, 300, 1800, 7200] as const;
const RECEIPT_RETRY_SECONDS = 15 * 60;
const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const EXPO_REQUEST_TIMEOUT_MS = 30_000;
const STORE_REQUEST_TIMEOUT_MS = 8_000;
export const NATIVE_PUSH_SEND_CONCURRENCY = 10;
export const NATIVE_PUSH_STORE_WRITE_CONCURRENCY = 20;

class ExpoPushRequestError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

export type NativePlatform = 'android' | 'ios';
export type NativePushStatus =
  | 'pending'
  | 'sending'
  | 'ticketed'
  | 'retry'
  | 'delivered'
  | 'invalid_token'
  | 'failed'
  | 'unknown'
  | 'cancelled';

export type NativeInstallationInput = {
  installationId: string;
  expoPushToken: string;
  projectId: string;
  platform: NativePlatform;
};

export type NativeInstallationRegistration = {
  installation: {
    installationId: string;
    projectId: string;
    platform: NativePlatform;
    linkedAt: string;
  };
  rotated: boolean;
  transferred: boolean;
};

export type ClaimedNativeDelivery = {
  deliveryId: string;
  attemptId: string;
  attemptNumber: number;
  installationId: string;
  expoPushToken: string;
  projectId: string;
  message: PushMessage;
};

export type ClaimedNativeReceipt = {
  deliveryId: string;
  attemptId: string;
  receiptAttemptNumber: number;
  installationId: string;
  expoPushToken: string;
  ticketId: string;
};

export type NativeTicketOutcome = {
  delivery: ClaimedNativeDelivery;
  status: 'ticketed' | 'retry' | 'invalid_token' | 'failed' | 'unknown';
  ticketId?: string;
  errorCode?: string;
  errorMessage?: string;
  retryAt?: string;
  uncertain?: boolean;
  raw?: unknown;
};

export type NativeReceiptOutcome = {
  receipt: ClaimedNativeReceipt;
  status: 'delivered' | 'retry' | 'invalid_token' | 'failed' | 'unknown' | 'awaiting';
  errorCode?: string;
  errorMessage?: string;
  retryAt?: string;
  raw?: unknown;
};

export type NativePushStore = {
  claimDeliveries(limit: number): Promise<ClaimedNativeDelivery[]>;
  recordTickets(outcomes: NativeTicketOutcome[]): Promise<void>;
  claimReceipts(limit: number): Promise<ClaimedNativeReceipt[]>;
  recordReceipts(outcomes: NativeReceiptOutcome[]): Promise<void>;
};

export type ExpoPushTransport = {
  send(messages: Array<{
    to: string;
    title: string;
    body: string;
    sound: 'default';
    channelId: 'default';
    data: { url: string; tag: string };
  }>): Promise<unknown[]>;
  getReceipts(ticketIds: string[]): Promise<Record<string, unknown>>;
};

export type NativePushWorkerResult = {
  claimed: number;
  ticketed: number;
  delivered: number;
  retried: number;
  invalidTokens: number;
  failed: number;
  awaitingReceipt: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

function errorCode(value: unknown) {
  const record = asRecord(value);
  const details = asRecord(record?.details);
  return typeof details?.error === 'string' ? details.error : undefined;
}

function errorMessage(value: unknown) {
  const record = asRecord(value);
  return typeof record?.message === 'string' ? record.message : undefined;
}

function retryAt(now: Date, attemptNumber: number) {
  const seconds = SEND_RETRY_SECONDS[Math.min(attemptNumber - 1, SEND_RETRY_SECONDS.length - 1)];
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

function ticketOutcome(delivery: ClaimedNativeDelivery, ticket: unknown, now: Date): NativeTicketOutcome {
  const record = asRecord(ticket);
  if (record?.status === 'ok' && typeof record.id === 'string') {
    return { delivery, status: 'ticketed', ticketId: record.id, raw: ticket };
  }
  const code = errorCode(ticket);
  if (code === 'DeviceNotRegistered') {
    return { delivery, status: 'invalid_token', errorCode: code, errorMessage: errorMessage(ticket), raw: ticket };
  }
  if (code === 'MessageRateExceeded' && delivery.attemptNumber < MAX_ATTEMPTS) {
    return {
      delivery,
      status: 'retry',
      errorCode: code,
      errorMessage: errorMessage(ticket),
      retryAt: retryAt(now, delivery.attemptNumber),
      raw: ticket,
    };
  }
  return {
    delivery,
    status: delivery.attemptNumber >= MAX_ATTEMPTS ? 'unknown' : 'failed',
    errorCode: code ?? 'InvalidTicket',
    errorMessage: errorMessage(ticket) ?? 'Expo returned an invalid push ticket.',
    raw: ticket,
  };
}

function uncertainOutcomes(deliveries: ClaimedNativeDelivery[], error: unknown, now: Date): NativeTicketOutcome[] {
  return deliveries.map(delivery => ({
    delivery,
    status: delivery.attemptNumber < MAX_ATTEMPTS ? 'retry' : 'unknown',
    errorCode: 'ExpoRequestUncertain',
    errorMessage: error instanceof Error ? error.message : 'Expo push request failed without a usable response.',
    retryAt: delivery.attemptNumber < MAX_ATTEMPTS ? retryAt(now, delivery.attemptNumber) : undefined,
    uncertain: true,
  }));
}

function receiptOutcome(receipt: ClaimedNativeReceipt, value: unknown, now: Date): NativeReceiptOutcome {
  if (value === undefined) {
    return receipt.receiptAttemptNumber < MAX_ATTEMPTS
      ? {
          receipt,
          status: 'awaiting',
          retryAt: new Date(now.getTime() + RECEIPT_RETRY_SECONDS * 1000).toISOString(),
        }
      : { receipt, status: 'unknown', errorCode: 'ReceiptMissing' };
  }
  const record = asRecord(value);
  if (record?.status === 'ok') return { receipt, status: 'delivered', raw: value };
  const code = errorCode(value);
  if (code === 'DeviceNotRegistered') {
    return { receipt, status: 'invalid_token', errorCode: code, errorMessage: errorMessage(value), raw: value };
  }
  if (code === 'MessageRateExceeded' && receipt.receiptAttemptNumber < MAX_ATTEMPTS) {
    return {
      receipt,
      status: 'retry',
      errorCode: code,
      errorMessage: errorMessage(value),
      retryAt: retryAt(now, receipt.receiptAttemptNumber),
      raw: value,
    };
  }
  return {
    receipt,
    status: 'failed',
    errorCode: code ?? 'ReceiptError',
    errorMessage: errorMessage(value) ?? 'Expo reported a failed push receipt.',
    raw: value,
  };
}

export function parseNativeInstallationInput(value: unknown, configuredProjectId: string | undefined): NativeInstallationInput {
  if (!configuredProjectId) throw new Error('Native push is not configured.');
  const record = asRecord(value);
  const installationId = typeof record?.installationId === 'string' ? record.installationId.trim() : '';
  const expoPushToken = typeof record?.expoPushToken === 'string' ? record.expoPushToken.trim() : '';
  const projectId = typeof record?.projectId === 'string' ? record.projectId.trim() : '';
  const platform = record?.platform;
  if (installationId.length < 8 || installationId.length > 200) throw new Error('Invalid installation ID.');
  if (!/^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,}\]$/.test(expoPushToken)) throw new Error('Invalid Expo push token.');
  if (projectId !== configuredProjectId) throw new Error('Invalid Expo project.');
  if (platform !== 'android' && platform !== 'ios') throw new Error('Invalid native platform.');
  return { installationId, expoPushToken, projectId, platform };
}

export function parseNativeUnlinkInput(value: unknown) {
  const record = asRecord(value);
  const installationId = typeof record?.installationId === 'string' ? record.installationId.trim() : '';
  const expoPushToken = typeof record?.expoPushToken === 'string' ? record.expoPushToken.trim() : '';
  if (installationId.length < 8 || installationId.length > 200) throw new Error('Invalid installation ID.');
  if (!/^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,}\]$/.test(expoPushToken)) throw new Error('Invalid Expo push token.');
  return { installationId, expoPushToken };
}

export async function registerNativePushInstallation(
  client: SupabaseClient,
  input: NativeInstallationInput,
): Promise<NativeInstallationRegistration> {
  const { data, error } = await client.rpc('register_native_push_installation', {
    target_installation_id: input.installationId,
    target_expo_push_token: input.expoPushToken,
    target_project_id: input.projectId,
    target_platform: input.platform,
  });
  if (error) throw error;
  const result = asRecord(data);
  const installation = asRecord(result?.installation);
  if (!installation || typeof installation.linkedAt !== 'string') throw new Error('Invalid installation registration response.');
  return data as NativeInstallationRegistration;
}

export async function unlinkNativePushInstallation(
  client: SupabaseClient,
  installationId: string,
  expoPushToken: string,
) {
  const { data, error } = await client.rpc('unlink_native_push_installation', {
    target_installation_id: installationId,
    expected_expo_push_token: expoPushToken,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function enqueueNativePushNotification(
  admin: SupabaseClient,
  eventKey: string,
  message: PushMessage,
  userIds?: string[],
  excludeUserId?: string,
) {
  const projectId = process.env.EXPO_PROJECT_ID;
  if (!projectId) return { queued: 0, configured: false };
  const { data, error } = await admin.rpc('enqueue_native_push_deliveries', {
    target_event_key: eventKey,
    target_project_id: projectId,
    target_message: message,
    target_user_ids: userIds ?? null,
    excluded_user_id: excludeUserId ?? null,
  });
  if (error) throw error;
  return { queued: Number(data ?? 0), configured: true };
}

export function createExpoPushTransport(
  fetcher: typeof fetch = fetch,
  { timeoutMs = EXPO_REQUEST_TIMEOUT_MS }: { timeoutMs?: number } = {},
): ExpoPushTransport {
  const headers = () => {
    const value: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
    if (process.env.EXPO_ACCESS_TOKEN) value.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
    return value;
  };
  const request = async (url: string, body: unknown) => {
    const response = await fetcher(url, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new ExpoPushRequestError(
        `Expo push request failed with HTTP ${response.status}.`,
        response.status === 429 || response.status >= 500,
      );
    }
    const payload = asRecord(await response.json());
    if (!payload || !('data' in payload)) throw new Error('Expo push response did not contain data.');
    return payload.data;
  };
  return {
    async send(messages) {
      const data = await request(EXPO_SEND_URL, messages);
      if (!Array.isArray(data)) throw new Error('Expo push ticket response was not an array.');
      return data;
    },
    async getReceipts(ticketIds) {
      const data = await request(EXPO_RECEIPTS_URL, { ids: ticketIds });
      const records = asRecord(data);
      if (!records) throw new Error('Expo push receipt response was not an object.');
      return records;
    },
  };
}

async function awaitStoreRequest<T>(request: PromiseLike<T>): Promise<T> {
  const abortable = request as PromiseLike<T> & {
    abortSignal?: (signal: AbortSignal) => PromiseLike<T>;
  };
  return await (abortable.abortSignal?.(AbortSignal.timeout(STORE_REQUEST_TIMEOUT_MS)) ?? request);
}

export function createSupabaseNativePushStore(admin: SupabaseClient, workerId: string): NativePushStore {
  return {
    async claimDeliveries(limit) {
      const { data, error } = await awaitStoreRequest(admin.rpc('claim_native_push_deliveries', {
        target_worker_id: workerId,
        target_limit: limit,
      }));
      if (error) throw error;
      return (data ?? []).map((row: Record<string, unknown>) => ({
        deliveryId: row.delivery_id,
        attemptId: row.attempt_id,
        attemptNumber: row.attempt_number,
        installationId: row.installation_id,
        expoPushToken: row.expo_push_token,
        projectId: row.project_id,
        message: row.message,
      })) as ClaimedNativeDelivery[];
    },
    async recordTickets(outcomes) {
      await runAllWithConcurrency(outcomes, NATIVE_PUSH_STORE_WRITE_CONCURRENCY, async outcome => {
        const { data, error } = await awaitStoreRequest(admin.rpc('record_native_push_ticket', {
          target_delivery_id: outcome.delivery.deliveryId,
          target_attempt_id: outcome.delivery.attemptId,
          target_worker_id: workerId,
          target_expo_push_token: outcome.delivery.expoPushToken,
          target_status: outcome.status,
          target_ticket_id: outcome.ticketId ?? null,
          target_error_code: outcome.errorCode ?? null,
          target_error_message: outcome.errorMessage ?? null,
          target_retry_at: outcome.retryAt ?? null,
          target_uncertain: outcome.uncertain ?? false,
          target_raw: outcome.raw ?? null,
        }));
        if (error) throw error;
        if (data !== true) throw new Error(`Push ticket outcome was not persisted for delivery ${outcome.delivery.deliveryId}.`);
      });
    },
    async claimReceipts(limit) {
      const { data, error } = await awaitStoreRequest(admin.rpc('claim_native_push_receipts', {
        target_worker_id: workerId,
        target_limit: limit,
      }));
      if (error) throw error;
      return (data ?? []).map((row: Record<string, unknown>) => ({
        deliveryId: row.delivery_id,
        attemptId: row.attempt_id,
        receiptAttemptNumber: row.receipt_attempt_number,
        installationId: row.installation_id,
        expoPushToken: row.expo_push_token,
        ticketId: row.ticket_id,
      })) as ClaimedNativeReceipt[];
    },
    async recordReceipts(outcomes) {
      await runAllWithConcurrency(outcomes, NATIVE_PUSH_STORE_WRITE_CONCURRENCY, async outcome => {
        const { data, error } = await awaitStoreRequest(admin.rpc('record_native_push_receipt', {
          target_delivery_id: outcome.receipt.deliveryId,
          target_attempt_id: outcome.receipt.attemptId,
          target_worker_id: workerId,
          target_expo_push_token: outcome.receipt.expoPushToken,
          target_status: outcome.status,
          target_error_code: outcome.errorCode ?? null,
          target_error_message: outcome.errorMessage ?? null,
          target_retry_at: outcome.retryAt ?? null,
          target_raw: outcome.raw ?? null,
        }));
        if (error) throw error;
        if (data !== true) throw new Error(`Push receipt outcome was not persisted for delivery ${outcome.receipt.deliveryId}.`);
      });
    },
  };
}

async function runAllWithConcurrency<T>(items: T[], concurrency: number, operation: (item: T) => Promise<void>) {
  let nextIndex = 0;
  let hasError = false;
  let firstError: unknown;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      try {
        await operation(items[index]);
      } catch (error) {
        if (!hasError) {
          hasError = true;
          firstError = error;
        }
      }
    }
  });
  await Promise.all(workers);
  if (hasError) throw firstError;
}

export async function runNativePushWorker(
  store: NativePushStore,
  transport: ExpoPushTransport,
  now: Date = new Date(),
): Promise<NativePushWorkerResult> {
  const result: NativePushWorkerResult = {
    claimed: 0,
    ticketed: 0,
    delivered: 0,
    retried: 0,
    invalidTokens: 0,
    failed: 0,
    awaitingReceipt: 0,
  };
  const deliveries = await store.claimDeliveries(DELIVERY_CLAIM_LIMIT);
  result.claimed = deliveries.length;
  const projectDeliveries = new Map<string, ClaimedNativeDelivery[]>();
  for (const delivery of deliveries) {
    const projectBatch = projectDeliveries.get(delivery.projectId);
    if (projectBatch) projectBatch.push(delivery);
    else projectDeliveries.set(delivery.projectId, [delivery]);
  }
  const deliveryBatches: ClaimedNativeDelivery[][] = [];
  for (const projectBatch of projectDeliveries.values()) {
    for (let offset = 0; offset < projectBatch.length; offset += EXPO_SEND_LIMIT) {
      deliveryBatches.push(projectBatch.slice(offset, offset + EXPO_SEND_LIMIT));
    }
  }
  const ticketOutcomes: NativeTicketOutcome[] = [];
  await runAllWithConcurrency(deliveryBatches, NATIVE_PUSH_SEND_CONCURRENCY, async batch => {
    let outcomes: NativeTicketOutcome[];
    try {
      const tickets = await transport.send(batch.map(delivery => ({
        to: delivery.expoPushToken,
        title: delivery.message.title,
        body: delivery.message.body,
        sound: 'default',
        channelId: 'default',
        data: { url: delivery.message.url, tag: delivery.message.tag },
      })));
      outcomes = batch.map((delivery, index) => ticketOutcome(delivery, tickets[index], now));
    } catch (error) {
      outcomes = error instanceof ExpoPushRequestError && !error.retryable
        ? batch.map(delivery => ({
            delivery,
            status: 'failed',
            errorCode: 'ExpoRequestRejected',
            errorMessage: error.message,
          }))
        : uncertainOutcomes(batch, error, now);
    }
    ticketOutcomes.push(...outcomes);
  });
  if (ticketOutcomes.length) await store.recordTickets(ticketOutcomes);
  for (const outcome of ticketOutcomes) {
    if (outcome.status === 'ticketed') result.ticketed += 1;
    if (outcome.status === 'retry') result.retried += 1;
    if (outcome.status === 'invalid_token') result.invalidTokens += 1;
    if (outcome.status === 'failed' || outcome.status === 'unknown') result.failed += 1;
  }

  const receipts = await store.claimReceipts(RECEIPT_CLAIM_LIMIT);
  for (let offset = 0; offset < receipts.length; offset += EXPO_RECEIPT_LIMIT) {
    const batch = receipts.slice(offset, offset + EXPO_RECEIPT_LIMIT);
    let outcomes: NativeReceiptOutcome[];
    try {
      const values = await transport.getReceipts(batch.map(receipt => receipt.ticketId));
      outcomes = batch.map(receipt => receiptOutcome(receipt, values[receipt.ticketId], now));
    } catch {
      outcomes = batch.map(receipt => receipt.receiptAttemptNumber < MAX_ATTEMPTS
        ? {
            receipt,
            status: 'awaiting',
            retryAt: new Date(now.getTime() + RECEIPT_RETRY_SECONDS * 1000).toISOString(),
          }
        : { receipt, status: 'unknown', errorCode: 'ReceiptRequestUncertain' });
    }
    await store.recordReceipts(outcomes);
    for (const outcome of outcomes) {
      if (outcome.status === 'delivered') result.delivered += 1;
      if (outcome.status === 'retry') result.retried += 1;
      if (outcome.status === 'invalid_token') result.invalidTokens += 1;
      if (outcome.status === 'failed' || outcome.status === 'unknown') result.failed += 1;
      if (outcome.status === 'awaiting') result.awaitingReceipt += 1;
    }
  }
  return result;
}
