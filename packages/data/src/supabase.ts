import type { SupabaseClient } from '@supabase/supabase-js';
import type { Game } from '@clube-do-jogo/domain';
import type { Database, Tables } from './database.types';

export type { Database, Json, Tables, TablesInsert, TablesUpdate } from './database.types';

export type DataSupabaseClient = SupabaseClient<Database>;

type DatabaseFunctions = Database['public']['Functions'];
type RpcArgs<Fn extends keyof DatabaseFunctions> = DatabaseFunctions[Fn]['Args'];

export type RpcArgsAcceptingNull<
  Fn extends keyof DatabaseFunctions,
  Nullable extends keyof RpcArgs<Fn>,
> = {
  [P in keyof RpcArgs<Fn>]: P extends Nullable ? RpcArgs<Fn>[P] | null : RpcArgs<Fn>[P];
};

export function rpcArgsAcceptingNull<
  Fn extends keyof DatabaseFunctions,
  Nullable extends keyof RpcArgs<Fn>,
>(args: RpcArgsAcceptingNull<Fn, Nullable>): RpcArgs<Fn> {
  return args as RpcArgs<Fn>;
}

export function gameRowAsDomain(row: Tables<'games'>): Game {
  return row as Game;
}

export function gameRowsAsDomain(rows: Tables<'games'>[]): Game[] {
  return rows as Game[];
}
