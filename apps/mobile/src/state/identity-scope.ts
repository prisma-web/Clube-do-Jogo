export interface IdentitySnapshot {
  userId: string | null;
  isDemo: boolean;
  sessionEpoch: number;
}

type Listener = () => void;

const initialSnapshot: IdentitySnapshot = { userId: null, isDemo: false, sessionEpoch: 0 };

let snapshot: IdentitySnapshot = initialSnapshot;
const listeners = new Set<Listener>();

function sameIdentity(a: IdentitySnapshot, b: IdentitySnapshot): boolean {
  return a.userId === b.userId && a.isDemo === b.isDemo && a.sessionEpoch === b.sessionEpoch;
}

export function publishIdentity(next: IdentitySnapshot) {
  if (sameIdentity(snapshot, next)) return;
  snapshot = next;
  listeners.forEach(listener => listener());
}

export function getIdentitySnapshot(): IdentitySnapshot {
  return snapshot;
}

export function subscribeIdentity(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
