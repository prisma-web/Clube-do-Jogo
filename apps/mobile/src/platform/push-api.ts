import { apiRoutes, type ApiRequestBody, type ApiResult, type Unvalidated } from '@clube-do-jogo/data';
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

async function readJson<T>(response: Response): Promise<Unvalidated<T>> {
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
  return value as Unvalidated<T>;
}

export function createNativePushApi(transport: MobileApiTransport): NativePushApi {
  return {
    async register(input) {
      const value = await readJson<ApiResult<'pushNativeRegister'>>(await transport.request(apiRoutes.pushNativeRegister.path, {
        method: apiRoutes.pushNativeRegister.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input satisfies ApiRequestBody<'pushNativeRegister'>),
      }));
      return { rotated: value.rotated === true, transferred: value.transferred === true };
    },
    async unlink(input, options) {
      const value = await readJson<ApiResult<'pushNativeUnlink'>>(await transport.request(apiRoutes.pushNativeUnlink.path, {
        method: apiRoutes.pushNativeUnlink.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input satisfies ApiRequestBody<'pushNativeUnlink'>),
        signal: options?.signal,
      }));
      return { unlinked: value.unlinked === true };
    },
  };
}
