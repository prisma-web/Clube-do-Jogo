import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@clube-do-jogo/data';
import { getApiBaseUrl } from './config';

function resolveApiUrl(path: string, baseValue: string) {
  let base: URL;
  try {
    base = new URL(baseValue);
  } catch {
    throw new Error('A URL da API está inválida.');
  }
  const localDevelopment = base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname);
  if ((base.protocol !== 'https:' && !localDevelopment) || base.username || base.password || base.pathname !== '/') {
    throw new Error('A URL da API deve ser uma origem HTTPS.');
  }
  let url: URL;
  try {
    url = new URL(path, `${base.origin}/`);
  } catch {
    throw new Error('A rota da API está inválida.');
  }
  if (url.origin !== base.origin || url.username || url.password || url.hash
    || !(url.pathname === '/api' || url.pathname.startsWith('/api/'))) {
    throw new Error('O aplicativo só acessa rotas /api do servidor configurado.');
  }
  return url.toString();
}

const SESSION_EXPIRED = 'Sua sessão expirou. Entre novamente para continuar.';

export function createMobileApiTransport(client: SupabaseClient | null, apiBaseUrlOverride?: string) {
  return {
    async request(path: string, init?: RequestInit) {
      const base = apiBaseUrlOverride ?? getApiBaseUrl();
      if (!base) throw new Error('Configure EXPO_PUBLIC_API_BASE_URL para explorar jogos.');
      if (!client) throw new Error('Configure o Supabase para acessar a API.');
      const { data, error } = await client.auth.getSession();
      if (error) throw new Error('Não foi possível validar sua sessão.');
      if (!data.session?.access_token) throw new ApiError(401, SESSION_EXPIRED);

      const url = resolveApiUrl(path, base);
      const send = (token: string) => {
        const headers = new Headers(init?.headers);
        headers.delete('Authorization');
        headers.delete('Cookie');
        headers.set('Authorization', `Bearer ${token}`);
        return fetch(url, { ...init, headers, credentials: 'omit', redirect: 'error' });
      };

      const response = await send(data.session.access_token);
      if (response.status !== 401) return response;

      const refreshed = await client.auth.refreshSession();
      const token = refreshed.data.session?.access_token;
      if (refreshed.error || !token) throw new ApiError(401, SESSION_EXPIRED);

      // Repetir um POST costuma ser perigoso, mas um 401 é recusa antes de
      // executar, então a primeira tentativa não deixou efeito para duplicar.
      const retry = await send(token);
      if (retry.status === 401) {
        throw new ApiError(401, 'O servidor recusou o acesso mesmo com a sessão renovada.', 'refused-after-refresh');
      }
      return retry;
    },
  };
}
