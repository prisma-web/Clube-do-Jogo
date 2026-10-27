import assert from 'node:assert/strict';
import test from 'node:test';
import { recentVotingItems } from '../../apps/mobile/src/features/voting/voting-deck';
import type { RankingItem } from '@clube-do-jogo/domain';

function item(id: string, addedAt: string, votedByMe = false): RankingItem {
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
    votedByMe,
    completedByMe: false,
    inBacklog: false,
  };
}

test('opening voting deck lists newest games that the current user has not voted on', () => {
  const cards = recentVotingItems([
    item('old', '2026-10-01T00:00:00.000Z'),
    item('new', '2026-10-03T00:00:00.000Z'),
    item('already-voted', '2026-10-04T00:00:00.000Z', true),
    item('middle', '2026-10-02T00:00:00.000Z'),
  ], 2);

  assert.deepEqual(cards.map(card => card.game.id), ['new', 'middle']);
});
