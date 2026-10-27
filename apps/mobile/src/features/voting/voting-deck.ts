import type { RankingItem } from '@clube-do-jogo/domain';

/** Keeps the opening deck focused on the newest additions to the active vote. */
export function recentVotingItems(items: readonly RankingItem[], limit = 8): RankingItem[] {
  return [...items]
    .filter(item => !item.votedByMe)
    .sort((left, right) => right.addedAt.localeCompare(left.addedAt))
    .slice(0, limit);
}
