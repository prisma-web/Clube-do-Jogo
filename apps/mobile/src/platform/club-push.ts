import { apiRoutes, type ApiRequestBody } from '@clube-do-jogo/data';

type ClubPushTransport = {
  request(path: string, init?: RequestInit): Promise<Response>;
};

export type ClubPushInput = {
  gameId: string;
  month: string;
  mode: 'current' | 'next';
  /** Mês do ciclo encerrado por uma troca `next`; é ele que ganha o push de recompensas. */
  closedMonth?: string | null;
};

type PushPostRoute = typeof apiRoutes.pushClubGame | typeof apiRoutes.pushRewards;

async function post(transport: ClubPushTransport, route: PushPostRoute, body: ApiRequestBody<'pushClubGame'> | ApiRequestBody<'pushRewards'>) {
  return await transport.request(route.path, {
    method: route.method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Paridade com `setClubGame` da web (src/components/app-provider.tsx): avisa o clube do novo
 * jogo e, ao avançar de ciclo, das recompensas do mês encerrado. É best-effort: o ciclo já foi
 * gravado, então nenhuma falha aqui (transporte, sessão, resposta não-2xx) pode chegar a quem chama.
 */
export async function dispatchClubGamePush(getTransport: () => ClubPushTransport, input: ClubPushInput): Promise<void> {
  let transport: ClubPushTransport;
  try {
    transport = getTransport();
  } catch {
    return;
  }
  const requests: Array<Promise<unknown>> = [
    post(transport, apiRoutes.pushClubGame, { gameId: input.gameId, month: input.month } satisfies ApiRequestBody<'pushClubGame'>),
  ];
  if (input.mode === 'next' && input.closedMonth) {
    requests.push(post(transport, apiRoutes.pushRewards, { clubMonth: input.closedMonth } satisfies ApiRequestBody<'pushRewards'>));
  }
  await Promise.allSettled(requests);
}
