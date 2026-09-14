import { formatShortDate } from '@clube-do-jogo/domain';

/**
 * Mirrors the web's day-boundary check (src/components/notes-chat.tsx `dateKey`), which
 * groups notes by calendar day in the club's fixed America/Fortaleza timezone rather than
 * the device's local timezone, so two members in different timezones see the same splits.
 */
export function shouldShowDateSeparator(previousCreatedAt: string | undefined, createdAt: string): boolean {
  if (previousCreatedAt === undefined) return true;
  return formatShortDate(previousCreatedAt) !== formatShortDate(createdAt);
}
