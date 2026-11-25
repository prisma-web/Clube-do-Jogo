import type { DataSupabaseClient } from '@clube-do-jogo/data';

export type MemberCheck = {
  checkRevocation?: boolean;
};

export async function authenticatedUserId(
  supabase: DataSupabaseClient,
  authorization: string | null,
  { checkRevocation = false }: MemberCheck = {},
): Promise<string | null> {
  const bearer = /^Bearer\s+(\S+)$/i.exec(authorization ?? '')?.[1];
  if (checkRevocation) {
    const { data, error } = await supabase.auth.getUser(bearer);
    return !error && data.user?.id ? data.user.id : null;
  }
  const { data, error } = await supabase.auth.getClaims(bearer);
  if (error || !data) return null;
  const { sub, role } = data.claims;
  return role === 'authenticated' && typeof sub === 'string' && sub ? sub : null;
}
