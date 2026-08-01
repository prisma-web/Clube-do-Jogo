'use client';

import { usePersistentState } from './use-persistent-state';

export type RatingScale = 5 | 10;

export function useRatingScale() {
  return usePersistentState<RatingScale>('preferences:rating-scale', 10);
}

export function ratingForScale(value: number, scale: RatingScale) {
  return scale === 5 ? value / 2 : value;
}
