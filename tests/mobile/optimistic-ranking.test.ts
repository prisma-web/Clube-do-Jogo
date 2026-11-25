import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyMyVote, type RankingItem, type VoteParticipant } from '@clube-do-jogo/domain';
import { demoGames } from '@clube-do-jogo/domain/demo';
import { isNewVote, optimisticRanking, unvotedRankingItem } from '../../apps/mobile/src/state/optimistic-ranking';

const me: VoteParticipant = { id: 'me', name: 'Eu', avatar_url: null, reason: null, reasonText: null };
const other: VoteParticipant = { id: 'other', name: 'Outra', avatar_url: null, reason: null, reasonText: null };

function row(index: number, voter: VoteParticipant, choice: 'would_play' | 'neutral' = 'would_play'): RankingItem {
  const item = applyMyVote(unvotedRankingItem(demoGames[index], '2026-11-01T00:00:00.000Z'), voter, choice, 'preference');
  return voter.id === me.id ? item : { ...item, myChoice: null, votedByMe: false };
}

test('removing the last vote drops the row at once', () => {
  const mine = row(1, me);
  const theirs = row(2, other);
  const next = optimisticRanking([mine, theirs], { gameId: mine.game.id, choice: null }, me, 'preference');
  assert.deepEqual(next?.map(item => item.game.id), [theirs.game.id]);
});

test('removing my vote keeps a row that still has other votes', () => {
  const shared = applyMyVote(row(1, other), me, 'would_play', 'preference');
  const next = optimisticRanking([shared], { gameId: shared.game.id, choice: null }, me, 'preference');
  assert.equal(next?.length, 1);
  assert.equal(next?.[0].votesCount, 1);
  assert.equal(next?.[0].myChoice, null);
});

test('voting on a game outside the ranking inserts it, sorted', () => {
  const existing = row(2, other, 'neutral');
  const game = demoGames[3];
  const next = optimisticRanking([existing], { gameId: game.id, game, choice: 'would_play' }, me, 'preference');
  assert.deepEqual(next?.map(item => item.game.id), [game.id, existing.game.id]);
  assert.equal(next?.[0].myChoice, 'would_play');
  assert.equal(next?.[0].votesCount, 1);
});

test('without the game object an unknown vote leaves the ranking unchanged', () => {
  const existing = row(2, other);
  const next = optimisticRanking([existing], { gameId: 'unknown', choice: 'would_play' }, me, 'preference');
  assert.deepEqual(next?.map(item => item.game.id), [existing.game.id]);
});

test('only a brand-new vote counts as new for the threshold push', () => {
  const mine = applyMyVote(row(1, other), me, 'neutral', 'preference');
  const unvoted = row(2, other);
  assert.equal(isNewVote([mine, unvoted], { gameId: mine.game.id, choice: 'would_play' }), false);
  assert.equal(isNewVote([mine, unvoted], { gameId: unvoted.game.id, choice: 'would_play' }), true);
  assert.equal(isNewVote([mine, unvoted], { gameId: 'outside', choice: 'neutral' }), true);
  assert.equal(isNewVote([mine], { gameId: mine.game.id, choice: null }), false);
});
