import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import {
  APP_STACK_ANCHOR,
  AUTHENTICATED_INTENT_NAVIGATION_OPTIONS,
} from '../../apps/mobile/src/lib/nav-intent';

const require = createRequire(import.meta.url);
const { getExactRoutes } = require('expo-router/build/getRoutes.js') as typeof import('expo-router/build/getRoutes');
const { getReactNavigationConfig } = require('expo-router/build/getReactNavigationConfig.js') as typeof import('expo-router/build/getReactNavigationConfig');

type ModuleLoader = (request: string, parent?: { filename?: string }, isMain?: boolean) => unknown;
let linkedState: unknown;
const authenticatedRootState = {
  stale: false as const,
  type: 'stack',
  key: 'root',
  index: 0,
  routeNames: ['(auth)', '(app)'],
  routes: [{ key: 'auth', name: '(auth)' }],
};
const fakeRouterStore = {
  assertIsReady: () => undefined,
  navigationRef: { current: { getRootState: () => authenticatedRootState } },
  linking: { config: {}, getStateFromPath: () => linkedState },
  getRouteInfo: () => ({ pathname: '/login', segments: [], params: {} }),
  redirects: [],
};
const moduleInternals = require('node:module') as { _load: ModuleLoader };
const originalLoad = moduleInternals._load;
moduleInternals._load = function loadExpoRouterModule(request, parent, isMain) {
  if (parent?.filename?.endsWith('/fork/getStateFromPath.js') && request === '../react-navigation/native') {
    return { validatePathConfig: () => undefined };
  }
  if (parent?.filename?.endsWith('/global-state/getNavigationAction.js')) {
    if (request === './store') return { store: fakeRouterStore };
    if (request === '../getRoutesRedirects') return { applyRedirects: (href: string) => href };
  }
  return originalLoad(request, parent, isMain);
};
const { getStateFromPath } = require('expo-router/build/fork/getStateFromPath.js') as typeof import('expo-router/build/fork/getStateFromPath');
const { getNavigateAction } = require('expo-router/build/global-state/getNavigationAction.js') as typeof import('expo-router/build/global-state/getNavigationAction');
moduleInternals._load = originalLoad;

const EmptyRoute = () => null;

test('deep link protegido pós-login cria a aba inicial antes do detalhe', () => {
  const files = {
    './_layout.tsx': { default: EmptyRoute },
    './(auth)/_layout.tsx': { default: EmptyRoute },
    './(auth)/login.tsx': { default: EmptyRoute },
    './(app)/_layout.tsx': {
      default: EmptyRoute,
      unstable_settings: { anchor: APP_STACK_ANCHOR },
    },
    './(app)/(tabs)/_layout.tsx': { default: EmptyRoute },
    './(app)/(tabs)/jogo-do-mes.tsx': { default: EmptyRoute },
    './(app)/jogos/[id].tsx': { default: EmptyRoute },
  };
  const context = Object.assign(
    (key: keyof typeof files) => files[key],
    { keys: () => Object.keys(files), resolve: (key: string) => key, id: 'deep-link-back' },
  );
  const config = getReactNavigationConfig(getExactRoutes(context), true);
  const state = getStateFromPath('/jogos/game-42', config);
  const appState = state?.routes[0]?.state;
  linkedState = state;
  const action = getNavigateAction(
    '/jogos/game-42',
    AUTHENTICATED_INTENT_NAVIGATION_OPTIONS,
    'REPLACE',
    AUTHENTICATED_INTENT_NAVIGATION_OPTIONS.withAnchor,
  );

  assert.equal(config.screens['(app)'].initialRouteName, '(tabs)');
  assert.deepEqual(appState?.routes.map(route => route.name), ['(tabs)', 'jogos/[id]']);
  assert.equal(appState?.index, 1);
  assert.deepEqual([
    action?.payload.params?.initial,
    (action?.payload.params?.params as { initial?: boolean } | undefined)?.initial,
  ], [false, false]);
});
