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

async function post(transport: ClubPushTransport, path: string, body: Record<string, string>) {
  return await transport.request(path, {
    method: 'POST',
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
    post(transport, '/api/push/club-game', { gameId: input.gameId, month: input.month }),
  ];
  if (input.mode === 'next' && input.closedMonth) {
    requests.push(post(transport, '/api/push/rewards', { clubMonth: input.closedMonth }));
  }
  await Promise.allSettled(requests);
}
