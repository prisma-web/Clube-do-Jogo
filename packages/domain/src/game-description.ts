import { gameDescriptionFallback } from './labels';

export function gameDescriptionText(description: string | null | undefined): string {
  return description?.trim() || gameDescriptionFallback;
}

export function gameDescriptionPreview(
  description: string | null | undefined,
  expandThreshold: number,
): { text: string; hasMore: boolean } {
  const trimmed = description?.trim() ?? '';
  return { text: trimmed || gameDescriptionFallback, hasMore: trimmed.length > expandThreshold };
}
