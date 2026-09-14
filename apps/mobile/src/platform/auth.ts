import type { SupabaseClient } from '@supabase/supabase-js';

export type AuthCallbackClient = { auth: Pick<SupabaseClient['auth'], 'exchangeCodeForSession'> };
export type AuthSignOutClient = { auth: Pick<SupabaseClient['auth'], 'signOut'> };

export interface AuthCallbackResult {
  userId: string;
}

async function setupNativeUrlPolyfill() {
  const { setupURLPolyfill } = await import('react-native-url-polyfill');
  setupURLPolyfill();
}

class AuthCallbackError extends Error {}

const completedCallbacks = new Map<string, AuthCallbackResult>();
const pendingCallbacks = new Map<string, Promise<AuthCallbackResult>>();

function authError(error: unknown) {
  if (!error || typeof error !== 'object') return new AuthCallbackError('Não foi possível concluir a autenticação.');
  const message = 'message' in error ? String((error as { message: unknown }).message) : '';
  if (/expired|invalid|code/i.test(message)) return new AuthCallbackError('O link de autenticação expirou. Solicite um novo link.');
  if (/network|fetch|connect/i.test(message)) return new AuthCallbackError('Não foi possível conectar. Tente novamente.');
  return new AuthCallbackError('Não foi possível concluir a autenticação.');
}

export async function completeAuthCallback(url: string, clientOverride?: AuthCallbackClient): Promise<AuthCallbackResult> {
  if (!clientOverride) await setupNativeUrlPolyfill();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('O link de autenticação é inválido.');
  }
  const callbackError = parsed.searchParams.get('error_description') || parsed.searchParams.get('error');
  if (callbackError) throw new Error(`Não foi possível concluir a autenticação. ${callbackError}`);
  const code = parsed.searchParams.get('code');
  if (!code) throw new Error('O link de autenticação não contém um código. Solicite um novo link.');
  const client = clientOverride || (await import('./supabase')).getMobileSupabaseClient();
  if (!client) throw new Error('Configure o Supabase para concluir a autenticação.');
  const completed = completedCallbacks.get(code);
  if (completed) return completed;
  const pending = pendingCallbacks.get(code);
  if (pending) return pending;

  const exchange = client.auth.exchangeCodeForSession(code).then(({ data, error }) => {
    if (error) throw authError(error);
    const userId = data.session?.user.id;
    if (!userId) throw new AuthCallbackError('Login concluído, mas não foi possível confirmar sua sessão. Tente novamente.');
    const result = { userId };
    completedCallbacks.set(code, result);
    if (completedCallbacks.size > 100) completedCallbacks.delete(completedCallbacks.keys().next().value as string);
    return result;
  }).catch(error => {
    throw error instanceof AuthCallbackError
      ? error
      : authError(error);
  }).finally(() => {
    pendingCallbacks.delete(code);
  });
  pendingCallbacks.set(code, exchange);
  return exchange;
}

export async function signOutCurrentDevice(client: AuthSignOutClient): Promise<void> {
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) throw error;
}

export function resetAuthCallbacksForTests() {
  completedCallbacks.clear();
  pendingCallbacks.clear();
}
