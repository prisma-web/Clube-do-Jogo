export type NavIntent =
  | { pathname: '/(app)/jogos/[id]'; params: { id: string } }
  | { pathname: '/(app)/perfil/[id]'; params: { id: string } };

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

const ROUTE_MATCHERS: Array<{ pattern: RegExp; toIntent: (id: string) => NavIntent }> = [
  { pattern: /^\/jogos\/([^/]+)$/, toIntent: id => ({ pathname: '/(app)/jogos/[id]', params: { id } }) },
  { pattern: /^\/perfil\/([^/]+)$/, toIntent: id => ({ pathname: '/(app)/perfil/[id]', params: { id } }) },
];

let pendingIntent: NavIntent | null = null;

function extractRoutePath(rawUrl: string): string | null {
  if (rawUrl.startsWith('/')) return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== TRUSTED_DEEP_LINK_SCHEME) return null;
    const combined = `${parsed.host}${parsed.pathname}`.replace(/^\/+/, '');
    return combined ? `/${combined}` : null;
  } catch {
    return null;
  }
}

export function captureNavIntent(rawUrl: string): void {
  const path = extractRoutePath(rawUrl);
  if (!path) return;
  for (const matcher of ROUTE_MATCHERS) {
    const match = path.match(matcher.pattern);
    if (!match) continue;
    try {
      pendingIntent = matcher.toIntent(decodeURIComponent(match[1]));
    } catch {
      return;
    }
    return;
  }
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
