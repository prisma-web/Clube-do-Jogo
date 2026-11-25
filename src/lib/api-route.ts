import { NextResponse } from 'next/server';
import type { ApiErrorStatus, ApiResult, ApiRouteKey } from '@clube-do-jogo/data';

type ContractResponseInit<K extends ApiRouteKey> = Omit<ResponseInit, 'status'> & { status?: ApiErrorStatus<K> };

export function contractJson<K extends ApiRouteKey>() {
  return (body: ApiResult<K>, init?: ContractResponseInit<K>) => NextResponse.json(body, init);
}
