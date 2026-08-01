import type { GameProgress, ProgressStatus } from './types';

type StoredProgress = Pick<GameProgress, 'status' | 'rating' | 'rating_mode' | 'rating_details' | 'started_at' | 'finished_at'>;

export function transitionProgress(existing: StoredProgress | null | undefined, status: ProgressStatus, now = new Date().toISOString()): StoredProgress {
  if (status === 'not_started') {
    return {
      status,
      rating: null,
      rating_mode: 'simple',
      rating_details: null,
      started_at: null,
      finished_at: null,
    };
  }

  return {
    status,
    rating: existing?.rating ?? null,
    rating_mode: existing?.rating_mode || 'simple',
    rating_details: existing?.rating_details || null,
    started_at: existing?.started_at || now,
    finished_at: status === 'finished'
      ? existing?.status === 'finished' ? existing.finished_at || now : now
      : null,
  };
}
