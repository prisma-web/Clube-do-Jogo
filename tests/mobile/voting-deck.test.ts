import assert from 'node:assert/strict';
import test from 'node:test';
import { nextVotingCardIndex, recentVotingItems } from '../../apps/mobile/src/features/voting/voting-deck';
import type { RankingItem } from '@clube-do-jogo/domain';

function item(id: string, addedAt: string): RankingItem {
  return {
    game: { id, title: id, duration_hours: 4, image_url: null, description: '' },
    addedAt,
    choiceCounts: { would_play: 0, would_not_play: 0 },
    choiceProfiles: { would_play: [], would_not_play: [] },
    myChoice: null,
    votesCount: 0,
    completedCount: 0,
    voters: [],
    completedBy: [],
    playtimePoints: 0,
    ratingMultiplier: 0,
    totalPoints: 0,
    legacyTotalPoints: 0,
    votedByMe: false,
    completedByMe: false,
    inBacklog: false,
  };
}

test('opening voting deck lists newest additions first and caps the deck', () => {
  const cards = recentVotingItems([
    item('old', '2026-10-01T00:00:00.000Z'),
    item('new', '2026-10-03T00:00:00.000Z'),
    item('middle', '2026-10-02T00:00:00.000Z'),
  ], 2);

  assert.deepEqual(cards.map(card => card.game.id), ['new', 'middle']);
});

test('opening voting deck closes after its final card', () => {
  assert.equal(nextVotingCardIndex(0, 2), 1);
  assert.equal(nextVotingCardIndex(1, 2), null);
});
