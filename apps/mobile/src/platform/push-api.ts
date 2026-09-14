import type { PushPlatform } from './push-controller';

type MobileApiTransport = {
  request(path: string, init?: RequestInit): Promise<Response>;
};

export type NativePushRegistrationInput = {
  installationId: string;
  expoPushToken: string;
  projectId: string;
  platform: PushPlatform;
};

export type NativePushRegistrationResult = {
  rotated: boolean;
  transferred: boolean;
};

export interface NativePushApi {
  register(input: NativePushRegistrationInput): Promise<NativePushRegistrationResult>;
  unlink(
    input: Pick<NativePushRegistrationInput, 'installationId' | 'expoPushToken'>,
    options?: { signal?: AbortSignal },
  ): Promise<{ unlinked: boolean }>;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const value = await response.json().catch(() => null);
  if (!response.ok) {
    const message = value && typeof value === 'object' && typeof (value as { error?: unknown }).error === 'string'
      ? (value as { error: string }).error
      : 'Não foi possível atualizar as notificações.';
    throw new Error(message);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('O servidor retornou uma resposta inválida para notificações.');
  }
  return value as Record<string, unknown>;
}

export function createNativePushApi(transport: MobileApiTransport): NativePushApi {
  return {
    async register(input) {
      const value = await readJson(await transport.request('/api/push/native-installations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }));
      return { rotated: value.rotated === true, transferred: value.transferred === true };
    },
    async unlink(input, options) {
      const value = await readJson(await transport.request('/api/push/native-installations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: options?.signal,
      }));
      return { unlinked: value.unlinked === true };
    },
  };
}
