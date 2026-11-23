import type { RankingItem } from '@clube-do-jogo/domain';

/** Keeps the opening deck focused on the newest additions the member has not answered. */
export function recentVotingItems(
  items: readonly RankingItem[],
  answeredGameIds: ReadonlySet<string> = new Set(),
  limit = 8,
): RankingItem[] {
  return [...items]
    .filter(item => !item.votedByMe && !answeredGameIds.has(item.game.id))
    .sort((left, right) => right.addedAt.localeCompare(left.addedAt))
    .slice(0, limit);
}
