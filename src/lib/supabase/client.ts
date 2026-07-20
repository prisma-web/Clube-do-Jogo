import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  // Evitar erros em tempo de build se as variáveis de ambiente não estiverem definidas
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

  return createBrowserClient(url, anonKey);
}
