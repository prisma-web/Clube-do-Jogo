import type { RankingItem } from '@clube-do-jogo/domain';

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
