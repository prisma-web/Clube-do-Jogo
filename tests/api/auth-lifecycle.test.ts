import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  captureNavIntent,
  clearNavIntent,
  consumeNavIntent,
  decideRootNavigation,
  peekNavIntent,
} from '../../apps/mobile/src/lib/nav-intent';
import { signOutCurrentDevice } from '../../apps/mobile/src/platform/auth';
import {
  createInitialSessionGate,
  shouldHydrateAuthSession,
} from '../../apps/mobile/src/state/auth-lifecycle';

afterEach(() => clearNavIntent());

test('mesma identidade não hidrata nem redireciona ao voltar para ready', () => {
  assert.equal(shouldHydrateAuthSession('user-a', {
    ready: true,
    userId: 'user-a',
    isDemo: false,
  }), false);
  assert.deepEqual(decideRootNavigation({
    ready: true,
    userId: 'user-a',
    settledUserId: 'user-a',
    pathname: '/jogos',
    pendingIntent: null,
  }), { type: 'none' });
});

test('nova identidade abre o intent uma vez e a sessão warm limpa o intent atendido', () => {
  captureNavIntent('clubedojogo://jogos/game-42');
  const intent = peekNavIntent();
  assert.deepEqual(decideRootNavigation({
    ready: true,
    userId: 'user-a',
    settledUserId: null,
    pathname: '/login',
    pendingIntent: intent,
  }), { type: 'open-intent', intent: {
    pathname: '/(app)/jogos/[id]',
    params: { id: 'game-42' },
  } });

  assert.deepEqual(decideRootNavigation({
    ready: true,
    userId: 'user-a',
    settledUserId: 'user-a',
    pathname: '/jogos/game-42',
    pendingIntent: intent,
  }), { type: 'clear-intent' });
  clearNavIntent();
  assert.equal(peekNavIntent(), null);
});

test('callback cold mantém a rota enquanto a sessão armazenada não é a identidade trocada', () => {
  assert.deepEqual(decideRootNavigation({
    ready: true,
    userId: 'stored-user',
    settledUserId: undefined,
    pathname: '/auth/callback',
    pendingIntent: null,
  }), { type: 'none' });
});

test('troca direta de usuário consome o intent mesmo quando a rota já coincide', () => {
  captureNavIntent('/jogos/game-42');
  assert.deepEqual(decideRootNavigation({
    ready: true,
    userId: 'user-b',
    settledUserId: 'user-a',
    pathname: '/jogos/game-42',
    pendingIntent: peekNavIntent(),
  }), {
    type: 'open-intent',
    intent: { pathname: '/(app)/jogos/[id]', params: { id: 'game-42' } },
  });
});

test('logout limpa o intent sem substituir a rota protegida', () => {
  captureNavIntent('/perfil/profile-7');
  const action = decideRootNavigation({
    ready: true,
    userId: null,
    settledUserId: 'user-a',
    pathname: '/jogos',
    pendingIntent: peekNavIntent(),
  });
  assert.deepEqual(action, { type: 'clear-intent' });
  if (action.type === 'clear-intent') clearNavIntent();
  assert.equal(consumeNavIntent(), null);
});

test('evento de auth invalida a leitura inicial que começou antes dele', () => {
  const gate = createInitialSessionGate();
  assert.equal(gate.shouldApplyInitialRead(), true);
  gate.observeAuthEvent();
  assert.equal(gate.shouldApplyInitialRead(), false);
});

test('somente mudança de identidade ou estado ainda não carregado hidratam', () => {
  const current = { ready: true, userId: 'user-a', isDemo: false };
  assert.equal(shouldHydrateAuthSession('user-b', current), true);
  assert.equal(shouldHydrateAuthSession('user-a', current), false);
  assert.equal(shouldHydrateAuthSession(null, { ...current, ready: false, userId: null }), true);
});

test('logout do aparelho usa somente o escopo local', async () => {
  let receivedOptions: unknown;
  const client = {
    auth: {
      signOut: async (options: unknown) => {
        receivedOptions = options;
        return { error: null };
      },
    },
  } as unknown as SupabaseClient;

  await signOutCurrentDevice(client);

  assert.deepEqual(receivedOptions, { scope: 'local' });
});
