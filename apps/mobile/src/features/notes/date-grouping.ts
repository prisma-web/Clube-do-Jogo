import { formatShortDate } from '@clube-do-jogo/domain';

export function shouldShowDateSeparator(previousCreatedAt: string | undefined, createdAt: string): boolean {
  if (previousCreatedAt === undefined) return true;
  return formatShortDate(previousCreatedAt) !== formatShortDate(createdAt);
}
