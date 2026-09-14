import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RankingItem } from '@clube-do-jogo/domain';
import {
  computeRankingPlacements,
  filterRankingBySearch,
  friendlyRankingDay,
  groupRankingByDay,
  groupRankingByPlacement,
  normalizeForSearch,
} from '../../apps/mobile/src/features/ranking/ranking-view';

function makeItem(options: {
  id: string;
  title: string;
  totalPoints: number;
  addedAt?: string;
  genres?: string[];
  platforms?: string[];
}): RankingItem {
  return {
    game: {
      id: options.id,
      title: options.title,
      duration_hours: 10,
      image_url: '',
      description: '',
      genres: options.genres ?? [],
      platforms: options.platforms ?? [],
    },
    addedAt: options.addedAt ?? '2026-09-01T12:00:00.000Z',
    choiceCounts: { would_play: 0, would_not_play: 0 },
    choiceProfiles: { would_play: [], would_not_play: [] },
    myChoice: null,
    votesCount: 0,
    completedCount: 0,
    voters: [],
    completedBy: [],
    playtimePoints: 0,
    ratingMultiplier: 1,
    totalPoints: options.totalPoints,
    legacyTotalPoints: options.totalPoints,
    votedByMe: false,
    completedByMe: false,
    inBacklog: false,
  };
}

test('normalizeForSearch strips accents and lowercases', () => {
  assert.equal(normalizeForSearch('AÇÃO Épico'), 'acao epico');
});

test('filterRankingBySearch matches by accent-insensitive title', () => {
  const items = [makeItem({ id: 'a', title: 'Hades', totalPoints: 10 }), makeItem({ id: 'b', title: 'Ação Total', totalPoints: 5 })];
  const result = filterRankingBySearch(items, 'acao');
  assert.deepEqual(result.map(item => item.game.id), ['b']);
});

test('filterRankingBySearch matches by genre and platform', () => {
  const items = [
    makeItem({ id: 'a', title: 'Hades', totalPoints: 10, genres: ['Roguelike'], platforms: ['PC'] }),
    makeItem({ id: 'b', title: 'Celeste', totalPoints: 5, genres: ['Plataforma'], platforms: ['Switch'] }),
  ];
  assert.deepEqual(filterRankingBySearch(items, 'roguelike').map(item => item.game.id), ['a']);
  assert.deepEqual(filterRankingBySearch(items, 'switch').map(item => item.game.id), ['b']);
});

test('filterRankingBySearch returns everything for an empty query', () => {
  const items = [makeItem({ id: 'a', title: 'Hades', totalPoints: 10 })];
  assert.equal(filterRankingBySearch(items, '   ').length, 1);
});

test('computeRankingPlacements ties games with equal points at the same placement', () => {
  const items = [
    makeItem({ id: 'a', title: 'Hades', totalPoints: 10 }),
    makeItem({ id: 'b', title: 'Celeste', totalPoints: 10 }),
    makeItem({ id: 'c', title: 'Outer Wilds', totalPoints: 5 }),
  ];
  const placements = computeRankingPlacements(items);
  assert.equal(placements.get('a'), 1);
  assert.equal(placements.get('b'), 1);
  assert.equal(placements.get('c'), 2);
});

test('groupRankingByPlacement groups tied items under one header', () => {
  const items = [
    makeItem({ id: 'a', title: 'Hades', totalPoints: 10 }),
    makeItem({ id: 'b', title: 'Celeste', totalPoints: 10 }),
  ];
  const placements = computeRankingPlacements(items);
  const groups = groupRankingByPlacement(items, placements);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, '1º');
  assert.equal(groups[0].items.length, 2);
});

test('friendlyRankingDay labels the current Fortaleza day as Hoje', () => {
  // 01:00 UTC on Sep 10 is 22:00 in America/Fortaleza on Sep 9 (UTC-3).
  const now = new Date('2026-09-10T01:00:00.000Z');
  assert.equal(friendlyRankingDay('2026-09-10T01:00:00.000Z', now), 'Hoje');
});

test('friendlyRankingDay labels the previous Fortaleza day as Ontem', () => {
  const now = new Date('2026-09-10T13:00:00.000Z'); // 10:00 in Fortaleza on the 10th
  assert.equal(friendlyRankingDay('2026-09-09T23:30:00.000Z', now), 'Ontem'); // 20:30 in Fortaleza on the 9th
});

test('friendlyRankingDay groups by the Fortaleza calendar day, not UTC', () => {
  // 02:30 UTC on the 10th is 23:30 in America/Fortaleza on the 9th, so it is "Ontem"
  // relative to 13:00 UTC on the 10th even though both are UTC-calendar-day 10.
  const now = new Date('2026-09-10T13:00:00.000Z');
  assert.equal(friendlyRankingDay('2026-09-10T02:30:00.000Z', now), 'Ontem');
});

test('friendlyRankingDay formats older dates without the year when it matches', () => {
  const now = new Date('2026-09-10T13:00:00.000Z');
  assert.equal(friendlyRankingDay('2026-09-01T13:00:00.000Z', now), '01 de setembro');
});

test('groupRankingByDay groups items on the same Fortaleza day even across UTC midnight', () => {
  const items = [
    makeItem({ id: 'a', title: 'Hades', totalPoints: 10, addedAt: '2026-09-09T22:00:00.000Z' }),
    makeItem({ id: 'b', title: 'Celeste', totalPoints: 5, addedAt: '2026-09-09T23:30:00.000Z' }),
  ];
  const groups = groupRankingByDay(items, new Date('2026-09-10T13:00:00.000Z'));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 2);
});
