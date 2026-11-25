import assert from 'node:assert/strict';
import { test } from 'node:test';
import { voteChoices, voteChoiceLabels } from '@clube-do-jogo/domain';
import { voteChoiceOptions } from '../../apps/mobile/src/components/vote-choice-options';

test('o botão fica na mesma ordem do contador acima dele', () => {
  assert.deepEqual(voteChoiceOptions.map(option => option.value), voteChoices);
});

test('a ordem canônica vai do Não ao Jogaria, com Neutro no meio', () => {
  assert.deepEqual(voteChoices, ['would_not_play', 'neutral', 'would_play']);
  assert.deepEqual(voteChoices.map(choice => voteChoiceLabels[choice]), ['Não', 'Neutro', 'Jogaria']);
});
