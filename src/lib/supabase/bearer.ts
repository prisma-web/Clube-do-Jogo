import { createClient } from '@supabase/supabase-js';
import type { Database } from '@clube-do-jogo/data';

export function createBearerClient(url: string, anonKey: string, authorization: string) {
  const token = /^Bearer\s+(\S+)$/i.exec(authorization)?.[1];

  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  });
}
