import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareRankingItems,
  legacyRankingScore,
  rankingScore,
} from './ranking';
import { shiftMonth } from './dates';
import type { Game, RankingItem } from './types';

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
    choiceCounts: { would_play: wouldPlay, would_not_play: wouldNotPlay },
    choiceProfiles: { would_play: [], would_not_play: [] },
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
  assert.equal(rankingScore('legacy', candidate, { would_play: 1, would_not_play: 1 }, 0), 9.6);
});

test('ranking callers can calculate votes from the following club month', () => {
  const voteMonth = shiftMonth('2024-12', 1);
  const counts = { would_play: 2, would_not_play: 1 };

  assert.equal(voteMonth, '2025-01');
  assert.equal(rankingScore('preference', game('Next month'), counts, 0), 1);
});
