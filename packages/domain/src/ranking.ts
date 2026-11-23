import type { Game, RankingFormula, RankingItem, VoteChoice, VoteParticipant } from './types';

export const voteChoices: readonly VoteChoice[] = ['would_play', 'neutral', 'would_not_play'];

export function isVoteChoice(value: unknown): value is VoteChoice {
  return voteChoices.includes(value as VoteChoice);
}

export function byChoice<T>(build: (choice: VoteChoice) => T): Record<VoteChoice, T> {
  return { would_play: build('would_play'), neutral: build('neutral'), would_not_play: build('would_not_play') };
}

export function emptyChoiceProfiles(): Record<VoteChoice, VoteParticipant[]> {
  return byChoice(() => []);
}

export function countChoices(profiles: Record<VoteChoice, readonly unknown[]>): Record<VoteChoice, number> {
  return byChoice(choice => profiles[choice].length);
}

/** Everyone who answered, in `voteChoices` order. A neutral answer is participation. */
export function choiceParticipants(profiles: Record<VoteChoice, VoteParticipant[]>): VoteParticipant[] {
  return voteChoices.flatMap(choice => profiles[choice]);
}

/** Moves one member into `choice`, or out of every group when `choice` is null. Only a negative answer keeps a reason. */
export function moveParticipant(
  profiles: Record<VoteChoice, VoteParticipant[]>,
  participant: VoteParticipant,
  choice: VoteChoice | null,
): Record<VoteChoice, VoteParticipant[]> {
  const next = byChoice(option => profiles[option].filter(person => person.id !== participant.id));
  if (choice) {
    const kept = choice === 'would_not_play' ? participant : { ...participant, reason: null, reasonText: null };
    next[choice] = [...next[choice], kept];
  }
  return next;
}

export function legacyPlaytimePoints(hours: number): number {
  if (hours < 8) return 1;
  if (hours <= 15) return 3;
  if (hours <= 20) return 2;
  return 1;
}

type ScoredGame = Pick<Game, 'duration_hours' | 'average_rating'>;

export function legacyRankingScore(game: ScoredGame, votes: number, completed: number): number {
  const playtime = legacyPlaytimePoints(Number(game.duration_hours));
  const rating = Number(game.average_rating ?? 50) / 100;
  const penalty = completed > 0 ? completed * 2 : 1;
  return Math.round(((votes * 2 * playtime * rating) / penalty) * 10) / 10;
}

export function preferenceRankingScore(counts: Record<VoteChoice, number>): number {
  return counts.would_play - counts.would_not_play;
}

export function rankingScore(
  formula: RankingFormula,
  game: ScoredGame,
  counts: Record<VoteChoice, number>,
  completed: number,
): number {
  return formula === 'legacy'
    ? legacyRankingScore(game, counts.would_play + counts.would_not_play, completed)
    : preferenceRankingScore(counts);
}

/** Recomputes a ranking row after the current member answers `choice` (null removes the vote). */
export function applyMyVote(
  item: RankingItem,
  me: VoteParticipant,
  choice: VoteChoice | null,
  formula: RankingFormula,
): RankingItem {
  const choiceProfiles = moveParticipant(item.choiceProfiles, me, choice);
  const choiceCounts = countChoices(choiceProfiles);
  const voters = choiceParticipants(choiceProfiles);
  const negative = choice === 'would_not_play';
  return {
    ...item,
    choiceProfiles,
    choiceCounts,
    myChoice: choice,
    myReason: negative ? me.reason ?? null : null,
    myReasonText: negative ? me.reasonText ?? null : null,
    votesCount: voters.length,
    voters,
    totalPoints: rankingScore(formula, item.game, choiceCounts, item.completedCount),
    legacyTotalPoints: rankingScore('legacy', item.game, choiceCounts, item.completedCount),
    votedByMe: choice !== null,
  };
}

export function compareRankingItems<T extends Pick<RankingItem, 'totalPoints' | 'choiceCounts'> & { game: Pick<Game, 'title'> }>(a: T, b: T): number {
  return b.totalPoints - a.totalPoints
    || b.choiceCounts.would_play - a.choiceCounts.would_play
    || a.choiceCounts.would_not_play - b.choiceCounts.would_not_play
    || a.game.title.localeCompare(b.game.title, 'pt-BR');
}
