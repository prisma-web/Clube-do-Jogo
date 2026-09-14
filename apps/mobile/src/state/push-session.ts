export type PushSignOutResult = { unlinked: boolean; reason?: 'offline' | 'timeout' | 'stale' };

type PushSignOutHandler = {
  prepareSignOut(): Promise<PushSignOutResult>;
  clearSession(): void;
};

let handler: PushSignOutHandler | null = null;

export function registerPushSignOutHandler(next: PushSignOutHandler) {
  handler = next;
  return () => {
    if (handler === next) handler = null;
  };
}

export async function preparePushSignOut(): Promise<PushSignOutResult> {
  return handler?.prepareSignOut() ?? { unlinked: false, reason: 'stale' };
}

export function clearPushSession() {
  handler?.clearSession();
}
