export type RatingScale = 5 | 10;

export function ratingForScale(value: number, scale: RatingScale): number {
  return scale === 5 ? value / 2 : value;
}

export function ratingFromScale(value: number, scale: RatingScale): number {
  return scale === 5 ? value * 2 : value;
}
