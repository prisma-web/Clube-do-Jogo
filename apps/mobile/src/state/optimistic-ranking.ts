import {
  applyMyVote,
  compareRankingItems,
  countChoices,
  emptyChoiceProfiles,
  legacyPlaytimePoints,
} from '@clube-do-jogo/domain';
import type { Game, RankingFormula, RankingItem, VoteChoice, VoteParticipant } from '@clube-do-jogo/domain';

export type OptimisticVote = {
  gameId: string;
  choice: VoteChoice | null;
  game?: Game;
};

export function unvotedRankingItem(game: Game, addedAt = new Date().toISOString()): RankingItem {
  const choiceProfiles = emptyChoiceProfiles();
  return {
    game,
    addedAt,
    choiceCounts: countChoices(choiceProfiles),
    choiceProfiles,
    myChoice: null,
    myReason: null,
    myReasonText: null,
    votesCount: 0,
    completedCount: 0,
    voters: [],
    completedBy: [],
    playtimePoints: legacyPlaytimePoints(Number(game.duration_hours)),
    ratingMultiplier: Number(game.average_rating ?? 50) / 100,
    totalPoints: 0,
    legacyTotalPoints: 0,
    votedByMe: false,
    completedByMe: false,
    inBacklog: false,
  };
}

export function optimisticRanking(
  items: RankingItem[] | undefined,
  input: OptimisticVote,
  me: VoteParticipant,
  formula: RankingFormula,
): RankingItem[] | undefined {
  if (!items) return items;
  const exists = items.some(item => item.game.id === input.gameId);
  let next = items.map(item => item.game.id === input.gameId ? applyMyVote(item, me, input.choice, formula) : item);
  if (!exists && input.choice && input.game && input.game.id === input.gameId) {
    next = [...next, applyMyVote(unvotedRankingItem(input.game), me, input.choice, formula)];
  }
  return next
    .filter(item => item.game.id !== input.gameId || item.votesCount > 0)
    .sort(compareRankingItems);
}

export function isNewVote(previous: RankingItem[] | undefined, input: Pick<OptimisticVote, 'gameId' | 'choice'>): boolean {
  if (!input.choice) return false;
  const existing = previous?.find(item => item.game.id === input.gameId);
  return !existing?.myChoice;
}
