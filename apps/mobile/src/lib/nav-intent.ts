export type GotyTabParam = 'bolao' | 'seu-goty';

export const GOTY_ROUTE = '/(app)/goty-2026' as const;

export type NavIntent =
  | { pathname: '/(app)/jogos/[id]'; params: { id: string } }
  | { pathname: '/(app)/perfil/[id]'; params: { id: string } }
  | { pathname: typeof GOTY_ROUTE; params?: { tab: GotyTabParam } };

export const DEFAULT_APP_ROUTE = '/(app)/(tabs)/jogo-do-mes' as const;
export const APP_STACK_ANCHOR = '(tabs)' as const;
export const AUTHENTICATED_INTENT_NAVIGATION_OPTIONS = { withAnchor: true } as const;

export type PushNavIntent = NavIntent
  | { pathname: typeof DEFAULT_APP_ROUTE; params?: { section: 'timeline' } }
  | { pathname: '/(app)/(tabs)/ranking' }
  | { pathname: '/(app)/(tabs)/perfil' };

export type RootNavigationAction =
  | { type: 'none' }
  | { type: 'clear-intent' }
  | { type: 'open-home' }
  | { type: 'open-intent'; intent: NavIntent };

export interface RootNavigationState {
  ready: boolean;
  userId: string | null;
  settledUserId: string | null | undefined;
  pathname: string;
  pendingIntent: NavIntent | null;
}

const TRUSTED_DEEP_LINK_SCHEME = 'clubedojogo:';

export function parseGotyTabParam(value: unknown): GotyTabParam | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'bolao' || raw === 'seu-goty' ? raw : null;
}

const ROUTE_MATCHERS: Array<{ pattern: RegExp; toIntent: (match: RegExpMatchArray, search: URLSearchParams) => NavIntent }> = [
  { pattern: /^\/jogos\/([^/]+)$/, toIntent: match => ({ pathname: '/(app)/jogos/[id]', params: { id: decodeURIComponent(match[1]) } }) },
  { pattern: /^\/perfil\/([^/]+)$/, toIntent: match => ({ pathname: '/(app)/perfil/[id]', params: { id: decodeURIComponent(match[1]) } }) },
  {
    pattern: /^\/goty-2026\/?$/,
    toIntent: (_match, search) => {
      const tab = parseGotyTabParam(search.get('tab'));
      return tab ? { pathname: GOTY_ROUTE, params: { tab } } : { pathname: GOTY_ROUTE };
    },
  },
];

let pendingIntent: NavIntent | null = null;

function splitQuery(value: string): { path: string; search: string } {
  const withoutHash = value.split('#')[0];
  const queryAt = withoutHash.indexOf('?');
  return queryAt === -1
    ? { path: withoutHash, search: '' }
    : { path: withoutHash.slice(0, queryAt), search: withoutHash.slice(queryAt + 1) };
}

function extractRoute(rawUrl: string): { path: string; search: URLSearchParams } | null {
  if (rawUrl.startsWith('/')) {
    const { path, search } = splitQuery(rawUrl);
    return { path, search: new URLSearchParams(search) };
  }
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== TRUSTED_DEEP_LINK_SCHEME) return null;
    const combined = `${parsed.host}${parsed.pathname}`.replace(/^\/+/, '');
    return combined ? { path: `/${combined}`, search: parsed.searchParams } : null;
  } catch {
    return null;
  }
}

export function resolveNavIntent(rawUrl: string): NavIntent | null {
  const route = extractRoute(rawUrl);
  if (!route) return null;
  for (const matcher of ROUTE_MATCHERS) {
    const match = route.path.match(matcher.pattern);
    if (!match) continue;
    try {
      return matcher.toIntent(match, route.search);
    } catch {
      return null;
    }
  }
  return null;
}

export function captureNavIntent(rawUrl: string): void {
  const intent = resolveNavIntent(rawUrl);
  if (intent) pendingIntent = intent;
}

export function consumeNavIntent(): NavIntent | null {
  const value = pendingIntent;
  pendingIntent = null;
  return value;
}

export function peekNavIntent(): NavIntent | null {
  return pendingIntent;
}

export function decideRootNavigation(state: RootNavigationState): RootNavigationAction {
  if (!state.ready) return { type: 'none' };
  if (!state.userId) {
    return typeof state.settledUserId === 'string' ? { type: 'clear-intent' } : { type: 'none' };
  }
  if (state.pathname === '/auth/callback') return { type: 'none' };
  if (state.settledUserId !== state.userId) {
    return state.pendingIntent
      ? { type: 'open-intent', intent: state.pendingIntent }
      : { type: 'open-home' };
  }
  return state.pendingIntent
    ? { type: 'clear-intent' }
    : { type: 'none' };
}

export function clearNavIntent(): void {
  pendingIntent = null;
}
