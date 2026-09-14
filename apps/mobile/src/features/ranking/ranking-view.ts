import { compareRankingItems } from '@clube-do-jogo/domain';
import type { RankingItem } from '@clube-do-jogo/domain';

/**
 * Mirrors the web's ranking day-boundary and grouping logic (src/app/ranking/page.tsx
 * `friendlyDay`, `filteredRanking`, `rankingGroups`), but groups by calendar day in the
 * club's fixed America/Fortaleza timezone (see apps/mobile/src/features/notes/date-grouping.ts)
 * instead of the device's local timezone, so members in different timezones see the same splits.
 */

export type RankingView = 'ranking' | 'recent';

export interface RankingGroup {
  key: string;
  label: string;
  placement: number | null;
  items: RankingItem[];
}

const clubTimeZone = 'America/Fortaleza';

const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: clubTimeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const yearFormatter = new Intl.DateTimeFormat('en-US', { timeZone: clubTimeZone, year: 'numeric' });

const longDayFormatterWithYear = new Intl.DateTimeFormat('pt-BR', {
  timeZone: clubTimeZone,
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

const longDayFormatterNoYear = new Intl.DateTimeFormat('pt-BR', {
  timeZone: clubTimeZone,
  day: '2-digit',
  month: 'long',
});

export function fortalezaDayKey(value: string | Date): string {
  return dayKeyFormatter.format(new Date(value));
}

export function friendlyRankingDay(value: string, now: Date = new Date()): string {
  const dayKey = fortalezaDayKey(value);
  const todayKey = fortalezaDayKey(now);
  if (dayKey === todayKey) return 'Hoje';
  const yesterdayKey = fortalezaDayKey(new Date(now.getTime() - 86_400_000));
  if (dayKey === yesterdayKey) return 'Ontem';
  const sameYear = yearFormatter.format(new Date(value)) === yearFormatter.format(now);
  return sameYear ? longDayFormatterNoYear.format(new Date(value)) : longDayFormatterWithYear.format(new Date(value));
}

export function normalizeForSearch(value: string): string {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

export function matchesRankingSearch(item: RankingItem, query: string): boolean {
  const normalizedQuery = normalizeForSearch(query);
  if (!normalizedQuery) return true;
  const haystack = [item.game.title, ...(item.game.genres || []), ...(item.game.platforms || [])];
  return haystack.some(value => normalizeForSearch(value).includes(normalizedQuery));
}

export function filterRankingBySearch(items: RankingItem[], query: string): RankingItem[] {
  return normalizeForSearch(query) ? items.filter(item => matchesRankingSearch(item, query)) : [...items];
}

export function sortRankingForView(items: RankingItem[], view: RankingView): RankingItem[] {
  const sorted = [...items];
  return view === 'recent'
    ? sorted.sort((a, b) => b.addedAt.localeCompare(a.addedAt) || compareRankingItems(a, b))
    : sorted.sort(compareRankingItems);
}

export function computeRankingPlacements(items: RankingItem[]): Map<string, number> {
  const placements = new Map<string, number>();
  let lastScore: number | null = null;
  let placement = 0;
  [...items].sort(compareRankingItems).forEach(item => {
    if (lastScore === null || item.totalPoints !== lastScore) placement += 1;
    placements.set(item.game.id, placement);
    lastScore = item.totalPoints;
  });
  return placements;
}

export function groupRankingByPlacement(items: RankingItem[], placements: Map<string, number>): RankingGroup[] {
  const groups = new Map<number, RankingItem[]>();
  items.forEach(item => {
    const placement = placements.get(item.game.id) || 0;
    groups.set(placement, [...(groups.get(placement) || []), item]);
  });
  return Array.from(groups, ([placement, groupItems]) => ({
    key: String(placement),
    label: `${placement}º`,
    placement,
    items: groupItems,
  }));
}

export function groupRankingByDay(items: RankingItem[], now: Date = new Date()): RankingGroup[] {
  const groups = new Map<string, RankingItem[]>();
  items.forEach(item => {
    const key = fortalezaDayKey(item.addedAt);
    groups.set(key, [...(groups.get(key) || []), item]);
  });
  return Array.from(groups, ([key, groupItems]) => ({
    key,
    label: friendlyRankingDay(groupItems[0].addedAt, now),
    placement: null,
    items: groupItems,
  }));
}

export function buildRankingGroups(items: RankingItem[], view: RankingView, placements: Map<string, number>, now: Date = new Date()): RankingGroup[] {
  return view === 'recent' ? groupRankingByDay(items, now) : groupRankingByPlacement(items, placements);
}
