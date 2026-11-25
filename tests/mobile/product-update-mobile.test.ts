import assert from 'node:assert/strict';
import test from 'node:test';
import { currentProductUpdate } from '@clube-do-jogo/domain';
import { mobileProductUpdate } from '../../apps/mobile/src/features/product-updates/product-update-mobile';

test('mobile update swaps the web-only copy of the settings and performance steps', () => {
  const mobile = mobileProductUpdate(currentProductUpdate);
  const settings = mobile.steps.find(step => step.eyebrow === 'CONFIGURAÇÕES');
  const performance = mobile.steps.find(step => step.eyebrow === 'PERFORMANCE');
  assert.match(settings?.body ?? '', /engrenagem no Perfil/);
  assert.doesNotMatch(settings?.body ?? '', /avatar do cabeçalho/);
  assert.doesNotMatch(performance?.body ?? '', /construído como um site/);
});

test('mobile update keeps step count, visuals and leaves the shared web copy untouched', () => {
  const mobile = mobileProductUpdate(currentProductUpdate);
  assert.equal(mobile.steps.length, currentProductUpdate.steps.length);
  mobile.steps.forEach((step, index) => {
    assert.equal(step.image, currentProductUpdate.steps[index].image);
    assert.equal(step.artwork, currentProductUpdate.steps[index].artwork);
  });
  assert.match(currentProductUpdate.steps.find(step => step.eyebrow === 'CONFIGURAÇÕES')?.body ?? '', /avatar do cabeçalho/);
  assert.match(currentProductUpdate.steps.find(step => step.eyebrow === 'PERFORMANCE')?.body ?? '', /construído como um site/);
});
