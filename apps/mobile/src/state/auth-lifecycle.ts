export interface AuthSessionSnapshot {
  ready: boolean;
  userId: string | null;
  isDemo: boolean;
}

export interface InitialSessionGate {
  observeAuthEvent(): void;
  shouldApplyInitialRead(): boolean;
}

export function createInitialSessionGate(): InitialSessionGate {
  let observedAuthEvent = false;
  return {
    observeAuthEvent() {
      observedAuthEvent = true;
    },
    shouldApplyInitialRead() {
      return !observedAuthEvent;
    },
  };
}

export function shouldHydrateAuthSession(
  nextUserId: string | null,
  current: AuthSessionSnapshot,
): boolean {
  return !current.ready || current.isDemo || current.userId !== nextUserId;
}
