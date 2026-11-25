export interface ProductUpdateVisibilityState {
  loading: boolean;
  seen: boolean;
  reopenSignal: number;
  closedSignal: number;
  autoOpenEnabled?: boolean;
}

export function shouldShowProductUpdate(state: ProductUpdateVisibilityState): boolean {
  const autoOpenEnabled = state.autoOpenEnabled ?? true;
  const autoShowPending = autoOpenEnabled && !state.loading && !state.seen && state.closedSignal < 0;
  const manualShowPending = state.reopenSignal > Math.max(state.closedSignal, 0);
  return autoShowPending || manualShowPending;
}
