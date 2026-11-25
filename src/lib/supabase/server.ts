import { createServerClient } from '@supabase/ssr';
import type { Database, DataSupabaseClient } from '@clube-do-jogo/data';
import { cookies, headers } from 'next/headers';
import { authenticatedUserId, type MemberCheck } from './auth';
import { createBearerClient } from './bearer';

async function clientFor(authorization: string | null): Promise<DataSupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

  if (authorization !== null) return createBearerClient(url, anonKey, authorization);

  const cookieStore = await cookies();

  return createServerClient<Database>(
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
          }
        },
      },
    }
  );
}

export async function createClient() {
  return clientFor((await headers()).get('authorization'));
}

export async function createRequestContext(check?: MemberCheck) {
  const authorization = (await headers()).get('authorization');
  const supabase = await clientFor(authorization);
  return { supabase, userId: await authenticatedUserId(supabase, authorization, check) };
}
