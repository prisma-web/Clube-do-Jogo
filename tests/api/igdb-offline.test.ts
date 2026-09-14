import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  isOfflineCatalogEnabled,
  offlineBrowseGames,
  offlineGameById,
  offlineGameMugshots,
  offlineSearchGames,
  offlineSearchPlatforms,
  OFFLINE_CATALOG,
} from '../../src/lib/igdb-offline';

const savedFlag = process.env.IGDB_OFFLINE_CATALOG;
afterEach(() => {
  if (savedFlag === undefined) delete process.env.IGDB_OFFLINE_CATALOG;
  else process.env.IGDB_OFFLINE_CATALOG = savedFlag;
});

test('the offline catalog is opt-in and never on by default', () => {
  delete process.env.IGDB_OFFLINE_CATALOG;
  assert.equal(isOfflineCatalogEnabled(), false);
  process.env.IGDB_OFFLINE_CATALOG = '1';
  assert.equal(isOfflineCatalogEnabled(), true);
  process.env.IGDB_OFFLINE_CATALOG = 'false';
  assert.equal(isOfflineCatalogEnabled(), false);
});

test('every offline game carries the metadata the search route treats as fresh', () => {
  assert.ok(OFFLINE_CATALOG.length >= 8);
  for (const game of OFFLINE_CATALOG) {
    assert.equal(typeof game.id, 'number');
    assert.notEqual(game.average_rating, null, game.title);
    assert.notEqual(game.release_year, null, game.title);
    assert.ok(game.screenshot_urls.length >= 3, game.title);
    assert.ok(game.genres.length > 0, game.title);
    assert.ok(game.platforms.length > 0, game.title);
    assert.equal(game.platforms.length, game.platform_ids.length, game.title);
  }
  assert.equal(new Set(OFFLINE_CATALOG.map(game => game.id)).size, OFFLINE_CATALOG.length);
});

test('seed games keep their real cover and the rest leave the stored cover alone', () => {
  const byTitle = new Map(OFFLINE_CATALOG.map(game => [game.title, game]));
  assert.equal(byTitle.get('Outer Wilds')?.image_url, 'https://images.igdb.com/igdb/image/upload/t_cover_big/co65ac.jpg');
  assert.equal(byTitle.get('Tunic')?.image_url, null);
});

test('search matches title substrings case- and accent-insensitively and caps at five', () => {
  assert.deepEqual(offlineSearchGames('HOLLOW').map(game => game.title), ['Hollow Knight']);
  assert.deepEqual(offlineSearchGames('céleste').map(game => game.title), ['Celeste']);
  assert.ok(offlineSearchGames('a').length <= 5);
  assert.ok(offlineSearchGames('a').length >= 2);
  assert.deepEqual(offlineSearchGames('zzzz'), []);
});

test('browse paginates deterministically and honours the platform filter', () => {
  const first = offlineBrowseGames({ limit: 3, offset: 0 });
  const second = offlineBrowseGames({ limit: 3, offset: 3 });
  assert.equal(first.length, 3);
  assert.equal(new Set([...first, ...second].map(game => game.id)).size, first.length + second.length);
  const onSwitch = offlineBrowseGames({ platform: 130 });
  assert.ok(onSwitch.length > 0);
  assert.ok(onSwitch.every(game => game.platform_ids.includes(130)));
  assert.deepEqual(offlineBrowseGames({ query: 'hades' }).map(game => game.title), ['Hades']);
});

test('lookups by id and platform search resolve from the same catalog', () => {
  const [game] = OFFLINE_CATALOG;
  assert.deepEqual(offlineGameById(game.id), game);
  assert.equal(offlineGameById(1), null);
  assert.ok(offlineGameMugshots(game.id).length > 0);
  assert.deepEqual(offlineGameMugshots(1), []);
  const platforms = offlineSearchPlatforms('switch');
  assert.equal(platforms.length, 1);
  assert.equal(platforms[0].igdb_platform_id, 130);
  assert.deepEqual(offlineSearchPlatforms('zzzz'), []);
});
