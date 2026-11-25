import type { SupabaseClient } from '@supabase/supabase-js';
import type { Game } from '@clube-do-jogo/domain';
import type { Database, Tables } from './database.types';

export type { Database, Json, Tables, TablesInsert, TablesUpdate } from './database.types';

/**
 * Cliente Supabase tipado pelo schema versionado no repositório. Uma tabela,
 * coluna ou argumento de RPC que não existe no `Database` vira erro de tipo.
 */
export type DataSupabaseClient = SupabaseClient<Database>;

type DatabaseFunctions = Database['public']['Functions'];
type RpcArgs<Fn extends keyof DatabaseFunctions> = DatabaseFunctions[Fn]['Args'];

/** Argumentos de `Fn` em que os parâmetros `Nullable` também aceitam `null`. */
export type RpcArgsAcceptingNull<
  Fn extends keyof DatabaseFunctions,
  Nullable extends keyof RpcArgs<Fn>,
> = {
  [P in keyof RpcArgs<Fn>]: P extends Nullable ? RpcArgs<Fn>[P] | null : RpcArgs<Fn>[P];
};

/**
 * O postgres-meta gera todo argumento de RPC como não anulável, mesmo quando
 * a função SQL declara `DEFAULT NULL` e trata NULL como "não alterar". Esta
 * identidade só alarga, nos tipos, os parâmetros listados em `Nullable`: os
 * nomes continuam conferidos contra o `Database`. Use apenas para parâmetros
 * cuja função SQL aceita NULL de fato.
 */
export function rpcArgsAcceptingNull<
  Fn extends keyof DatabaseFunctions,
  Nullable extends keyof RpcArgs<Fn>,
>(args: RpcArgsAcceptingNull<Fn, Nullable>): RpcArgs<Fn> {
  return args as RpcArgs<Fn>;
}

/**
 * Linha de `games` exposta como `Game`, sem copiar nem normalizar nada.
 * ATENÇÃO: `games.description` é anulável no SQL, mas `Game.description` é
 * `string`. Nenhum código converte NULL em texto, então uma linha sem
 * descrição chega à interface com `description: null` (o mesmo que acontecia
 * antes, quando o cliente não era tipado). Este é o único ponto da fronteira
 * em que essa diferença é aceita para as rotas da web.
 */
export function gameRowAsDomain(row: Tables<'games'>): Game {
  return row as Game;
}

/** Versão em lote de `gameRowAsDomain`; devolve o mesmo array. */
export function gameRowsAsDomain(rows: Tables<'games'>[]): Game[] {
  return rows as Game[];
}
