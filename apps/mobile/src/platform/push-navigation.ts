import { DEFAULT_APP_ROUTE, type PushNavIntent } from '../lib/nav-intent';
import type { NativeNotificationResponse } from './push-controller';

const DEFAULT_ACTION = 'expo.modules.notifications.actions.DEFAULT';

export type PushDestinationExists = {
  game(id: string): Promise<boolean>;
  profile(id: string): Promise<boolean>;
};

function dynamicIntent(pathname: string): PushNavIntent | null {
  const match = pathname.match(/^\/(jogos|perfil)\/([^/]+)$/);
  if (!match) return null;
  let id: string;
  try {
    id = decodeURIComponent(match[2]);
  } catch {
    return null;
  }
  if (!id || /[\u0000-\u001f\u007f]/.test(id)) return null;
  return match[1] === 'jogos'
    ? { pathname: '/(app)/jogos/[id]', params: { id } }
    : { pathname: '/(app)/perfil/[id]', params: { id } };
}

export function parsePushDestination(rawUrl: unknown): PushNavIntent | null {
  if (typeof rawUrl !== 'string' || !rawUrl.startsWith('/') || rawUrl.startsWith('//')) return null;
  if (rawUrl.includes('#') || rawUrl.includes('\\') || /[\u0000-\u001f\u007f]/.test(rawUrl)) return null;
  const queryAt = rawUrl.indexOf('?');
  const pathname = queryAt === -1 ? rawUrl : rawUrl.slice(0, queryAt);
  const search = queryAt === -1 ? '' : rawUrl.slice(queryAt);
  if (pathname === '/jogo-do-mes') {
    if (!search) return { pathname: DEFAULT_APP_ROUTE };
    return search === '?section=timeline'
      ? { pathname: DEFAULT_APP_ROUTE, params: { section: 'timeline' } }
      : null;
  }
  if (search) return null;
  if (pathname === '/ranking') return { pathname: '/(app)/(tabs)/ranking' };
  if (pathname === '/perfil') return { pathname: '/(app)/(tabs)/perfil' };
  return dynamicIntent(pathname);
}

export async function resolvePushDestination(rawUrl: unknown, exists: PushDestinationExists): Promise<PushNavIntent> {
  const intent = parsePushDestination(rawUrl);
  if (!intent) return { pathname: DEFAULT_APP_ROUTE };
  if (intent.pathname === '/(app)/jogos/[id]') {
    return await exists.game(intent.params.id) ? intent : { pathname: DEFAULT_APP_ROUTE };
  }
  if (intent.pathname === '/(app)/perfil/[id]') {
    return await exists.profile(intent.params.id) ? intent : { pathname: DEFAULT_APP_ROUTE };
  }
  return intent;
}

export function notificationResponseKey(value: NativeNotificationResponse) {
  return `${value.identifier}\u0000${value.actionIdentifier}`;
}

export class PushResponseInbox {
  private readonly handled = new Set<string>();
  private pending: NativeNotificationResponse | null = null;

  capture(response: NativeNotificationResponse) {
    const key = notificationResponseKey(response);
    if (this.handled.has(key)) return false;
    this.handled.add(key);
    if (response.actionIdentifier !== DEFAULT_ACTION || parsePushDestination(response.data.url) === null) return false;
    this.pending = response;
    return true;
  }

  peek() {
    return this.pending;
  }

  consume() {
    const value = this.pending;
    this.pending = null;
    return value;
  }

  clearPending() {
    this.pending = null;
  }
}

export type PushAuthBoundary = {
  ready: boolean;
  userId: string | null;
  epoch: number;
  isDemo: boolean;
};

type PushNavigationResolution = {
  generation: number;
  response: NativeNotificationResponse;
};

const DEMO_IDENTITY = Symbol('demo');

function sameBoundary(left: PushAuthBoundary | null, right: PushAuthBoundary) {
  return left?.ready === right.ready && left.userId === right.userId
    && left.epoch === right.epoch && left.isDemo === right.isDemo;
}

export class PushNavigationCoordinator {
  private readonly inbox = new PushResponseInbox();
  private boundary: PushAuthBoundary | null = null;
  private settledIdentity: string | null | typeof DEMO_IDENTITY | undefined;
  private generation = 0;

  capture(response: NativeNotificationResponse) {
    if (!this.inbox.capture(response)) return false;
    this.generation += 1;
    return true;
  }

  updateBoundary(next: PushAuthBoundary) {
    if (!sameBoundary(this.boundary, next)) {
      this.boundary = next;
      this.generation += 1;
    }
    if (next.isDemo) {
      this.inbox.clearPending();
      this.settledIdentity = DEMO_IDENTITY;
      return false;
    }
    if (!next.ready) {
      if (this.settledIdentity === DEMO_IDENTITY) {
        this.inbox.clearPending();
        this.settledIdentity = next.userId;
      } else if (typeof next.userId === 'string'
        && typeof this.settledIdentity === 'string'
        && next.userId !== this.settledIdentity) {
        this.inbox.clearPending();
        this.settledIdentity = next.userId;
      } else if (next.userId === null && typeof this.settledIdentity === 'string') {
        this.inbox.clearPending();
        this.settledIdentity = null;
      }
      return false;
    }
    if (!next.userId) {
      if (typeof this.settledIdentity === 'string' || this.settledIdentity === DEMO_IDENTITY) {
        this.inbox.clearPending();
      }
      this.settledIdentity = null;
      return false;
    }
    if ((typeof this.settledIdentity === 'string' && this.settledIdentity !== next.userId)
      || this.settledIdentity === DEMO_IDENTITY) {
      this.inbox.clearPending();
    }
    this.settledIdentity = next.userId;
    return true;
  }

  beginResolution(): PushNavigationResolution | null {
    const response = this.inbox.peek();
    if (!response) return null;
    this.generation += 1;
    return { generation: this.generation, response };
  }

  isCurrent(resolution: PushNavigationResolution, currentBoundary?: PushAuthBoundary) {
    if (currentBoundary && (!sameBoundary(this.boundary, currentBoundary)
      || !currentBoundary.ready || !currentBoundary.userId || currentBoundary.isDemo)) return false;
    return this.generation === resolution.generation && this.inbox.peek() === resolution.response;
  }

  consume(resolution: PushNavigationResolution, currentBoundary?: PushAuthBoundary) {
    if (!this.isCurrent(resolution, currentBoundary)) return null;
    return this.inbox.consume();
  }

  peek() {
    return this.inbox.peek();
  }
}
