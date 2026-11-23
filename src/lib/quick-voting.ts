import type { RankingItem } from './types';

const CARD_LIMIT = 8;

export function pendingGames(items: readonly RankingItem[], reviewedGameIds: readonly string[]) {
  return [...items]
    .filter(item => !item.votedByMe && !reviewedGameIds.includes(item.game.id))
    .sort((left, right) => right.addedAt.localeCompare(left.addedAt))
    .slice(0, CARD_LIMIT);
}
