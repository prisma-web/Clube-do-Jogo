import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import { createBearerClient } from './bearer';

export async function createClient() {
  // Evitar erros em tempo de build se as variáveis de ambiente não estiverem definidas
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

  const authorization = (await headers()).get('authorization');
  if (authorization !== null) return createBearerClient(url, anonKey, authorization);

  const cookieStore = await cookies();

  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // O método setAll pode ser chamado a partir de um Server Component
            // onde cookies não podem ser modificados. Ignora para evitar quebra.
          }
        },
      },
    }
  );
}
