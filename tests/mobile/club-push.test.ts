import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dispatchClubGamePush } from '../../apps/mobile/src/platform/club-push';

type Call = { path: string; init?: RequestInit };

function recorder(fail?: (path: string) => unknown) {
  const calls: Call[] = [];
  const transport = {
    async request(path: string, init?: RequestInit) {
      calls.push({ path, init });
      const failure = fail?.(path);
      if (failure instanceof Error) throw failure;
      return new Response('{}', { status: typeof failure === 'number' ? failure : 200 });
    },
  };
  return { calls, transport };
}

const body = (call: Call) => JSON.parse(String(call.init?.body));

test('current mode only announces the club game', async () => {
  const { calls, transport } = recorder();
  await dispatchClubGamePush(() => transport, { gameId: 'g1', month: '2026-05', mode: 'current', closedMonth: '2026-04' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/api/push/club-game');
  assert.equal(calls[0].init?.method, 'POST');
  assert.deepEqual(body(calls[0]), { gameId: 'g1', month: '2026-05' });
});

test('next mode with a closed cycle also sends reward pushes for the closed month', async () => {
  const { calls, transport } = recorder();
  await dispatchClubGamePush(() => transport, { gameId: 'g2', month: '2026-06', mode: 'next', closedMonth: '2026-05' });
  assert.deepEqual(calls.map(call => call.path).sort(), ['/api/push/club-game', '/api/push/rewards']);
  const rewards = calls.find(call => call.path === '/api/push/rewards') as Call;
  assert.deepEqual(body(rewards), { clubMonth: '2026-05' });
  assert.deepEqual(body(calls.find(call => call.path === '/api/push/club-game') as Call), { gameId: 'g2', month: '2026-06' });
});

test('next mode without a previous cycle sends no reward push', async () => {
  for (const closedMonth of [undefined, null]) {
    const { calls, transport } = recorder();
    await dispatchClubGamePush(() => transport, { gameId: 'g3', month: '2026-06', mode: 'next', closedMonth });
    assert.deepEqual(calls.map(call => call.path), ['/api/push/club-game']);
  }
});

test('push failures never reject and one failure does not stop the other request', async () => {
  const networkDown = recorder(() => new Error('offline'));
  await assert.doesNotReject(dispatchClubGamePush(() => networkDown.transport, { gameId: 'g', month: '2026-06', mode: 'next', closedMonth: '2026-05' }));
  assert.equal(networkDown.calls.length, 2);

  const rewardsFail = recorder(path => path.endsWith('/rewards') ? new Error('boom') : 500);
  await assert.doesNotReject(dispatchClubGamePush(() => rewardsFail.transport, { gameId: 'g', month: '2026-06', mode: 'next', closedMonth: '2026-05' }));
  assert.equal(rewardsFail.calls.length, 2);

  const syncThrow = { request: () => { throw new Error('sync'); } };
  await assert.doesNotReject(dispatchClubGamePush(() => syncThrow, { gameId: 'g', month: '2026-06', mode: 'current' }));
  await assert.doesNotReject(dispatchClubGamePush(() => { throw new Error('no client'); }, { gameId: 'g', month: '2026-06', mode: 'current' }));
});
