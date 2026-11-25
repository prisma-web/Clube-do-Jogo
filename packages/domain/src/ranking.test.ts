import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyMyVote,
  compareRankingItems,
  emptyChoiceProfiles,
  isVoteChoice,
  legacyRankingScore,
  rankingScore,
  voteChoices,
} from './ranking';
import { shiftMonth } from './dates';
import type { Game, RankingItem, VoteParticipant } from './types';

function game(title: string, duration_hours = 12, average_rating = 80): Game {
  return {
    id: title.toLowerCase(),
    title,
    duration_hours,
    average_rating,
    image_url: '',
    description: '',
  };
}

function item(title: string, totalPoints: number, wouldPlay: number, wouldNotPlay: number): RankingItem {
  return {
    game: game(title),
    addedAt: '',
    choiceCounts: { would_play: wouldPlay, neutral: 0, would_not_play: wouldNotPlay },
    choiceProfiles: emptyChoiceProfiles(),
    myChoice: null,
    votesCount: wouldPlay + wouldNotPlay,
    completedCount: 0,
    voters: [],
    completedBy: [],
    playtimePoints: 3,
    ratingMultiplier: 0.8,
    totalPoints,
    legacyTotalPoints: totalPoints,
    votedByMe: false,
    completedByMe: false,
    inBacklog: false,
  };
}

function person(id: string, extra: Partial<VoteParticipant> = {}): VoteParticipant {
  return { id, name: id, avatar_url: null, reason: null, reasonText: null, ...extra };
}

const me = person('me');

function itemWith(profiles: Partial<RankingItem['choiceProfiles']>): RankingItem {
  const base = item('Pool', 0, 0, 0);
  const choiceProfiles = { ...emptyChoiceProfiles(), ...profiles };
  return applyMyVote({ ...base, choiceProfiles }, person('nobody'), null, 'preference');
}

test('ranking tie uses positive votes, negative votes, then title', () => {
  const sorted = [
    item('Zelda', 3, 2, 1),
    item('Alpha', 3, 2, 1),
    item('Beta', 3, 1, 0),
  ].sort(compareRankingItems);

  assert.deepEqual(sorted.map(entry => entry.game.title), ['Alpha', 'Zelda', 'Beta']);
});

test('legacy formula keeps fallback rating and completion penalty', () => {
  const candidate = game('Fallback', 12, 80);
  const fallback = { ...candidate, average_rating: null };

  assert.equal(legacyRankingScore(candidate, 2, 0), 9.6);
  assert.equal(legacyRankingScore(fallback, 2, 2), 1.5);
  assert.equal(rankingScore('legacy', candidate, { would_play: 1, neutral: 0, would_not_play: 1 }, 0), 9.6);
});

test('ranking callers can calculate votes from the following club month', () => {
  const voteMonth = shiftMonth('2024-12', 1);
  const counts = { would_play: 2, neutral: 0, would_not_play: 1 };

  assert.equal(voteMonth, '2025-01');
  assert.equal(rankingScore('preference', game('Next month'), counts, 0), 1);
});

test('neutral answers are worth zero in both formulas', () => {
  const candidate = game('Neutral', 12, 80);

  assert.equal(rankingScore('preference', candidate, { would_play: 2, neutral: 5, would_not_play: 1 }, 0), 1);
  assert.equal(rankingScore('legacy', candidate, { would_play: 1, neutral: 5, would_not_play: 1 }, 0), 9.6);
  assert.equal(rankingScore('preference', candidate, { would_play: 0, neutral: 3, would_not_play: 0 }, 0), 0);
});

test('neutral is a stored vote choice and unknown choices are not', () => {
  assert.deepEqual(voteChoices, ['would_not_play', 'neutral', 'would_play']);
  assert.equal(isVoteChoice('neutral'), true);
  assert.equal(isVoteChoice('would_play'), true);
  assert.equal(isVoteChoice('unavailable'), false);
  assert.equal(isVoteChoice(null), false);
});

test('answering neutral counts as voted and joins the neutral group', () => {
  const before = itemWith({ would_play: [person('bia'), me], would_not_play: [person('caio')] });
  assert.equal(before.totalPoints, 1);

  const neutral = applyMyVote(before, me, 'neutral', 'preference');

  assert.equal(neutral.myChoice, 'neutral');
  assert.equal(neutral.votedByMe, true);
  assert.deepEqual(neutral.choiceProfiles.neutral.map(entry => entry.id), ['me']);
  assert.deepEqual(neutral.choiceProfiles.would_play.map(entry => entry.id), ['bia']);
  assert.deepEqual(neutral.choiceCounts, { would_play: 1, neutral: 1, would_not_play: 1 });
  assert.equal(neutral.totalPoints, 0);
  assert.deepEqual(neutral.voters.map(entry => entry.id).sort(), ['bia', 'caio', 'me']);
  assert.equal(neutral.votesCount, 3);
});

test('neutral participation does not change the legacy score', () => {
  const before = itemWith({ would_play: [person('bia')], would_not_play: [person('caio')] });
  const neutral = applyMyVote(before, me, 'neutral', 'legacy');

  assert.equal(neutral.totalPoints, before.legacyTotalPoints);
  assert.equal(neutral.legacyTotalPoints, before.legacyTotalPoints);
});

test('clearing a neutral answer removes the vote entirely', () => {
  const neutral = applyMyVote(itemWith({ would_play: [person('bia')] }), me, 'neutral', 'preference');
  const cleared = applyMyVote(neutral, me, null, 'preference');

  assert.equal(cleared.myChoice, null);
  assert.equal(cleared.votedByMe, false);
  assert.deepEqual(cleared.choiceCounts, { would_play: 1, neutral: 0, would_not_play: 0 });
  assert.equal(cleared.votesCount, 1);
});

test('only a negative answer keeps its reason', () => {
  const reasoned = person('me', { reason: 'other', reasonText: 'Sem tempo.' });
  const negative = applyMyVote(itemWith({}), reasoned, 'would_not_play', 'preference');
  assert.equal(negative.myReason, 'other');
  assert.equal(negative.myReasonText, 'Sem tempo.');
  assert.equal(negative.choiceProfiles.would_not_play[0].reason, 'other');

  const neutral = applyMyVote(negative, reasoned, 'neutral', 'preference');
  assert.equal(neutral.myReason, null);
  assert.equal(neutral.myReasonText, null);
  assert.equal(neutral.choiceProfiles.neutral[0].reason, null);
  assert.equal(neutral.choiceProfiles.neutral[0].reasonText, null);
});
