import type { Update } from './release';

export type UpdateFlow =
  | { readonly phase: 'idle' }
  | { readonly phase: 'available'; readonly update: Update }
  | { readonly phase: 'downloading'; readonly update: Update; readonly percent: number }
  | { readonly phase: 'installing'; readonly update: Update }
  | { readonly phase: 'error'; readonly update: Update };

export type UpdateEvent =
  | { readonly type: 'checked'; readonly update: Update | null }
  | { readonly type: 'accepted' }
  | { readonly type: 'progressed'; readonly percent: number }
  | { readonly type: 'installerOpened' }
  | { readonly type: 'installerClosed' }
  | { readonly type: 'failed' }
  | { readonly type: 'dismissed' };

export const idleFlow: UpdateFlow = { phase: 'idle' };

export function updateFlowReducer(flow: UpdateFlow, event: UpdateEvent): UpdateFlow {
  switch (event.type) {
    case 'checked':
      if (flow.phase === 'downloading' || flow.phase === 'installing' || flow.phase === 'error') return flow;
      return event.update ? { phase: 'available', update: event.update } : idleFlow;
    case 'accepted':
      return flow.phase === 'available' || flow.phase === 'error'
        ? { phase: 'downloading', update: flow.update, percent: 0 }
        : flow;
    case 'progressed':
      return flow.phase === 'downloading' && flow.percent !== event.percent ? { ...flow, percent: event.percent } : flow;
    case 'installerOpened':
      return flow.phase === 'downloading' ? { phase: 'installing', update: flow.update } : flow;
    case 'installerClosed':
      return flow.phase === 'installing' ? { phase: 'available', update: flow.update } : flow;
    case 'failed':
      return flow.phase === 'downloading' || flow.phase === 'installing' ? { phase: 'error', update: flow.update } : flow;
    case 'dismissed':
      return idleFlow;
  }
}

export function downloadPercent({ bytesWritten, totalBytes }: { bytesWritten: number; totalBytes: number }, assetSize: number): number {
  const total = totalBytes > 0 ? totalBytes : assetSize;
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.floor((bytesWritten / total) * 100)));
}
