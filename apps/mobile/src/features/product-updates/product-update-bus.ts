type Listener = () => void;

let openRequests = 0;
const listeners = new Set<Listener>();

export function requestProductUpdateReopen(): void {
  openRequests += 1;
  listeners.forEach(listener => listener());
}

export function getProductUpdateReopenSignal(): number {
  return openRequests;
}

export function subscribeProductUpdateReopen(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
