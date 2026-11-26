import assert from 'node:assert/strict';
import test from 'node:test';
import { nextAutoModalHolder, type AutoModal } from '../../apps/mobile/src/features/auto-modal-turn';

const wanting = (...modals: AutoModal[]) => new Set(modals);

test('a reward and the voting deck asking together show only the reward', () => {
  assert.equal(nextAutoModalHolder(null, wanting('voting-deck', 'reward')), 'reward');
});

test('the voting deck gets its turn after the reward closes', () => {
  assert.equal(nextAutoModalHolder('reward', wanting('voting-deck')), 'voting-deck');
});

test('an open modal is not replaced by one that asks later', () => {
  assert.equal(nextAutoModalHolder('voting-deck', wanting('voting-deck', 'reward')), 'voting-deck');
});

test('the product update goes before the voting deck', () => {
  assert.equal(nextAutoModalHolder(null, wanting('voting-deck', 'product-update')), 'product-update');
});

test('nobody holds the turn when no modal wants it', () => {
  assert.equal(nextAutoModalHolder('reward', wanting()), null);
});
