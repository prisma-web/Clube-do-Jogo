import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBolaoLeaderboard,
  computeBolaoProgress,
  computePersonalCommunityWall,
  evaluate2026ReleaseEligibility,
  isBolaoVotingOpen,
} from './goty';
import {
  createDemoGotyState,
  GOTY_2026_DEFAULT_EVENT,
  GOTY_2026_OFFICIAL_CATEGORIES,
  GOTY_2026_PERSONAL_CATEGORIES,
} from './goty-data-2026';

const NOW_NOV_23_2026 = Date.UTC(2026, 10, 23, 18, 0, 0);

test('official TGA 2026 seed has all 30 unique categories and official GOTY nominees', () => {
  assert.equal(GOTY_2026_OFFICIAL_CATEGORIES.length, 30);
  const slugs = new Set(GOTY_2026_OFFICIAL_CATEGORIES.map(category => category.slug));
  assert.equal(slugs.size, 30);

  const goty = GOTY_2026_OFFICIAL_CATEGORIES.find(category => category.slug === 'game-of-the-year');
  assert.ok(goty);
  assert.equal(goty.nominees.length, 6);
  assert.deepEqual(
    goty.nominees.map(nominee => nominee.title),
    [
      '007 First Light',
      'Control Resonant',
      'Grand Theft Auto VI',
      'Phantom Blade Zero',
      'Resident Evil Requiem',
      'The Legend of Zelda: Ocarina of Time',
    ],
  );
  assert.equal(GOTY_2026_PERSONAL_CATEGORIES.length, 9);
});

test('evaluate2026ReleaseEligibility accepts commercial 2026 main release and rejects future/TBD', () => {
  const commercial = evaluate2026ReleaseEligibility({
    gameType: 0,
    versionParent: null,
    releaseDates: [
      { date: Math.floor(Date.UTC(2026, 4, 15) / 1000), y: 2026, dateFormat: 0, statusName: 'Full Release' },
    ],
  }, 2026, NOW_NOV_23_2026);
  assert.equal(commercial.eligible, true);
  assert.equal(commercial.eligibility, 'commercial_2026');
  assert.equal(commercial.effectiveYear, 2026);

  const announcedFuture = evaluate2026ReleaseEligibility({
    gameType: 0,
    versionParent: null,
    releaseDates: [
      { date: Math.floor(Date.UTC(2026, 11, 20) / 1000), y: 2026, dateFormat: 0, statusName: 'Full Release' },
    ],
  }, 2026, NOW_NOV_23_2026);
  assert.equal(announcedFuture.eligible, false);

  const tbd = evaluate2026ReleaseEligibility({
    gameType: 0,
    versionParent: null,
    releaseDates: [{ date: null, y: 2026, dateFormat: 7, statusName: null }],
  }, 2026, NOW_NOV_23_2026);
  assert.equal(tbd.eligible, false);
});

test('evaluate2026ReleaseEligibility handles Early Access graduation vs ongoing Early Access vs older release port', () => {
  const graduated = evaluate2026ReleaseEligibility({
    gameType: 0,
    versionParent: null,
    firstReleaseDate: Math.floor(Date.UTC(2024, 9, 10) / 1000),
    releaseDates: [
      { date: Math.floor(Date.UTC(2024, 9, 10) / 1000), y: 2024, dateFormat: 0, statusName: 'Early Access' },
      { date: Math.floor(Date.UTC(2026, 9, 8) / 1000), y: 2026, dateFormat: 0, statusName: 'Full Release' },
    ],
  }, 2026, NOW_NOV_23_2026);
  assert.equal(graduated.eligible, true);
  assert.equal(graduated.eligibility, 'early_access_graduated_2026');

  const stillEarlyAccess = evaluate2026ReleaseEligibility({
    gameType: 0,
    versionParent: null,
    releaseDates: [
      { date: Math.floor(Date.UTC(2026, 2, 10) / 1000), y: 2026, dateFormat: 0, statusName: 'Early Access' },
    ],
  }, 2026, NOW_NOV_23_2026);
  assert.equal(stillEarlyAccess.eligible, false);

  const olderWithPort = evaluate2026ReleaseEligibility({
    gameType: 0,
    versionParent: null,
    firstReleaseDate: Math.floor(Date.UTC(2023, 7, 3) / 1000),
    releaseDates: [
      { date: Math.floor(Date.UTC(2023, 7, 3) / 1000), y: 2023, dateFormat: 0, statusName: 'Full Release' },
      { date: Math.floor(Date.UTC(2026, 5, 1) / 1000), y: 2026, dateFormat: 0, statusName: 'Full Release' },
    ],
  }, 2026, NOW_NOV_23_2026);
  assert.equal(olderWithPort.eligible, false);
  assert.equal(olderWithPort.effectiveYear, 2023);

  const remake2026 = evaluate2026ReleaseEligibility({
    gameType: 8,
    versionParent: null,
    firstReleaseDate: Math.floor(Date.UTC(2026, 9, 23) / 1000),
  }, 2026, NOW_NOV_23_2026);
  assert.equal(remake2026.eligible, true);
  assert.equal(remake2026.eligibility, 'remake_remaster_2026');

  const dlcOrVariant = evaluate2026ReleaseEligibility({
    gameType: 1,
    versionParent: null,
    firstReleaseDate: Math.floor(Date.UTC(2026, 4, 1) / 1000),
  }, 2026, NOW_NOV_23_2026);
  assert.equal(dlcOrVariant.eligible, false);
});

test('isBolaoVotingOpen respects status and deadline', () => {
  assert.equal(isBolaoVotingOpen(GOTY_2026_DEFAULT_EVENT, new Date(NOW_NOV_23_2026)), true);
  assert.equal(
    isBolaoVotingOpen({ ...GOTY_2026_DEFAULT_EVENT, status: 'locked' }, new Date(NOW_NOV_23_2026)),
    false,
  );
  assert.equal(
    isBolaoVotingOpen(GOTY_2026_DEFAULT_EVENT, new Date('2026-12-11T01:00:00Z')),
    false,
  );
});

test('computeBolaoProgress and computeBolaoLeaderboard score predictions accurately with GOTY tiebreaker', () => {
  const state = createDemoGotyState();
  const goty = state.categories[0];
  const direction = state.categories[1];

  // Set official winners for first two categories
  goty.winner_nominee_id = goty.nominees[2].id; // Grand Theft Auto VI
  direction.winner_nominee_id = direction.nominees[0].id; // Control Resonant

  const votes = [
    { edition_year: 2026, user_id: 'u1', category_id: goty.id, nominee_id: goty.nominees[2].id, updated_at: '2026-11-20T10:00:00Z' },
    { edition_year: 2026, user_id: 'u1', category_id: direction.id, nominee_id: direction.nominees[1].id, updated_at: '2026-11-20T10:00:00Z' },
    { edition_year: 2026, user_id: 'u2', category_id: goty.id, nominee_id: goty.nominees[0].id, updated_at: '2026-11-20T09:00:00Z' },
    { edition_year: 2026, user_id: 'u2', category_id: direction.id, nominee_id: direction.nominees[0].id, updated_at: '2026-11-20T09:00:00Z' },
  ];
  const profiles = [
    { id: 'u1', name: 'Ana', avatar_url: null },
    { id: 'u2', name: 'Bruno', avatar_url: null },
  ];

  const progress = computeBolaoProgress(state.categories, votes.filter(v => v.user_id === 'u1'));
  assert.equal(progress.answered, 2);
  assert.equal(progress.total, 30);
  assert.equal(progress.isComplete, false);

  const board = computeBolaoLeaderboard(state.categories, votes, [], profiles);
  assert.equal(board.length, 2);
  // Both got 1 correct, but u1 hit Game of the Year so u1 ranks #1
  assert.equal(board[0].user_id, 'u1');
  assert.equal(board[0].correctCount, 1);
  assert.equal(board[0].hitGoty, true);
  assert.equal(board[0].rank, 1);
  assert.equal(board[1].user_id, 'u2');
  assert.equal(board[1].correctCount, 1);
  assert.equal(board[1].hitGoty, false);
  assert.equal(board[1].rank, 2);
});

test('computePersonalCommunityWall aggregates club favorites and member showcases', () => {
  const state = createDemoGotyState();
  const wall = computePersonalCommunityWall(state.personalPicks, state.personalCategories, state.profiles);
  assert.equal(wall.totalParticipants, 4);
  assert.ok(wall.topGames.length > 0);
  assert.equal(wall.memberShowcases.length, 4);
  assert.ok(wall.topGames[0].uniqueMembersCount >= 2);
});
