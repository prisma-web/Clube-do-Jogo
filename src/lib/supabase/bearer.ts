import { createClient } from '@supabase/supabase-js';

/** Cliente isolado por requisição, sempre com chave pública e RLS do usuário. */
export function createBearerClient(url: string, anonKey: string, authorization: string) {
  const token = /^Bearer\s+(\S+)$/i.exec(authorization)?.[1];

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      // auth.getUser() nas rotas valida este JWT no Supabase antes de consultar
      // dados. Um header inválido não pode recuperar a sessão por cookies.
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  });
}
