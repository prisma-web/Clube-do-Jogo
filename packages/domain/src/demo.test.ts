import assert from 'node:assert/strict';
import test from 'node:test';
import { demoGames } from './demo';

const verifiedCovers: Record<string, { igdbId: number; cover: string }> = {
  'hades': { igdbId: 113112, cover: 'co39vc' },
  'hollow-knight': { igdbId: 14593, cover: 'co93cr' },
  'cocoon': { igdbId: 204627, cover: 'co4v2z' },
  'outer-wilds': { igdbId: 11737, cover: 'co65ac' },
  'celeste': { igdbId: 26226, cover: 'co3byy' },
  'inscryption': { igdbId: 139090, cover: 'co401c' },
  'tunic': { igdbId: 23733, cover: 'td1t8kb33gyo8mvhl2pc' },
  'dredge': { igdbId: 164867, cover: 'co9kyk' },
  'sea-of-stars': { igdbId: 131890, cover: 'co215b' },
  'animal-well': { igdbId: 191435, cover: 'co4hdh' },
  'balatro': { igdbId: 251833, cover: 'co9f4g' },
  'gris': { igdbId: 22917, cover: 'co1qv5' },
};

const coverUrl = (cover: string) => `https://images.igdb.com/igdb/image/upload/t_cover_big/${cover}.jpg`;

test('cada jogo do demo tem uma capa só dele', () => {
  const owners = new Map<string, string>();
  for (const game of demoGames) {
    assert.ok(game.image_url, `${game.id} está sem capa`);
    const other = owners.get(game.image_url);
    assert.equal(other, undefined, `${game.id} repete a capa de ${other}`);
    owners.set(game.image_url, game.id);
  }
});

test('a capa e o igdb_id de cada jogo do demo são os do próprio jogo', () => {
  assert.deepEqual(demoGames.map(game => game.id).sort(), Object.keys(verifiedCovers).sort());
  for (const game of demoGames) {
    const expected = verifiedCovers[game.id];
    assert.equal(game.igdb_id, expected.igdbId, `igdb_id de ${game.id}`);
    assert.equal(game.image_url, coverUrl(expected.cover), `capa de ${game.id}`);
  }
});
