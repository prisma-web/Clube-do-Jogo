import { NextResponse } from 'next/server';
import type { ApiErrorStatus, ApiResult, ApiRouteKey } from '@clube-do-jogo/data';

type ContractResponseInit<K extends ApiRouteKey> = Omit<ResponseInit, 'status'> & { status?: ApiErrorStatus<K> };

/**
 * `NextResponse.json` presa ao contrato da rota (packages/data/src/api-contracts.ts):
 * devolver um corpo fora do contrato ou um status de erro não declarado não compila.
 * Em tempo de execução é exatamente `NextResponse.json(body, init)`.
 */
export function contractJson<K extends ApiRouteKey>() {
  return (body: ApiResult<K>, init?: ContractResponseInit<K>) => NextResponse.json(body, init);
}
