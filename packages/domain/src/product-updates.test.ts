import assert from 'node:assert/strict';
import test from 'node:test';
import { currentProductUpdate, productUpdateStorageKey } from './product-updates';

test('productUpdateStorageKey scopes the key by update id', () => {
  assert.equal(productUpdateStorageKey('v1.1'), 'clube-do-jogo:product-update:v1.1:completed');
  assert.equal(productUpdateStorageKey('v2.0'), 'clube-do-jogo:product-update:v2.0:completed');
});

test('currentProductUpdate identifies the V1.1 release', () => {
  assert.equal(currentProductUpdate.id, 'v1.1');
  assert.equal(currentProductUpdate.version, 'V1.1');
  assert.equal(currentProductUpdate.title, 'Atualização V1.1');
  assert.equal(currentProductUpdate.steps.length, 10);
});

test('currentProductUpdate first step introduces the release without an image', () => {
  const [first] = currentProductUpdate.steps;
  assert.equal(first.eyebrow, 'ATUALIZAÇÃO V1.1');
  assert.equal(first.title, 'Mais jogos. Mais você.');
  assert.equal(first.artwork, 'overview');
  assert.equal(first.image, undefined);
});

test('currentProductUpdate ranking step carries highlights and a real screenshot', () => {
  const rankingStep = currentProductUpdate.steps.find(step => step.eyebrow === 'RANKING');
  assert.ok(rankingStep, 'expected a RANKING step');
  assert.deepEqual(rankingStep?.highlights, [
    '“Não” agora permite informar o motivo.',
    'Toque novamente no seu voto para removê-lo.',
    'Mesma pontuação, mesma posição.',
  ]);
  assert.deepEqual(rankingStep?.image, {
    src: '/updates/v1.1/ranking.webp',
    alt: 'Página real do ranking com votos Jogaria e Não e a pontuação dos jogos.',
  });
});

test('currentProductUpdate last step closes on performance, without an image', () => {
  const last = currentProductUpdate.steps.at(-1);
  assert.equal(last?.eyebrow, 'PERFORMANCE');
  assert.equal(last?.artwork, 'performance');
  assert.equal(last?.image, undefined);
});

test('every step has non-empty eyebrow, title, and body text', () => {
  for (const step of currentProductUpdate.steps) {
    assert.ok(step.eyebrow.length > 0, `empty eyebrow for "${step.title}"`);
    assert.ok(step.title.length > 0, 'empty title');
    assert.ok(step.body.length > 0, `empty body for "${step.title}"`);
  }
});
