import type { DataSupabaseClient } from '@clube-do-jogo/data';

export type MemberCheck = {
  /** Pergunta ao Auth se a sessão ainda existe, ao custo de uma ida ao Supabase. */
  checkRevocation?: boolean;
};

/**
 * O projeto assina os JWTs com ES256, então getClaims confere a assinatura contra
 * o JWKS em cache sem sair da máquina, enquanto getUser custa uma ida e volta ao
 * Supabase. A troca tem preço: um token continua válido até expirar mesmo depois
 * de sair da conta, porque ninguém mais pergunta ao servidor. Por isso as rotas
 * que agem com a service role em nome do membro pedem checkRevocation e pagam o
 * getUser. Se o projeto voltar a assinar com chave simétrica, o próprio getClaims
 * cai de novo no getUser, então a checagem nunca fica frouxa por acidente.
 */
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
  // A chave anon e a service role também são JWTs assinados pelo projeto.
  return role === 'authenticated' && typeof sub === 'string' && sub ? sub : null;
}
