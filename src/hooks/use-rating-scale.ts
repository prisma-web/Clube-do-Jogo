'use client';

import { usePersistentState } from './use-persistent-state';
import type { RatingScale } from '@clube-do-jogo/domain';

export type { RatingScale } from '@clube-do-jogo/domain';
export { ratingForScale, ratingFromScale } from '@clube-do-jogo/domain';

export function useRatingScale() {
  return usePersistentState<RatingScale>('preferences:rating-scale', 10);
}
