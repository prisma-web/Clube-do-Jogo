import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_THEME, getSelectableThemes, isThemeId, themes } from './themes';

test('keeps the six theme IDs, metadata and server eligibility', () => {
  assert.deepEqual(themes, [
    { id: 'original', name: 'Clube Neon', colors: ['#8b5cf6', '#d946ef', '#101014'], background: '#08080a', availability: 'public' },
    { id: 'zelda', name: 'Zelda Deluxe', colors: ['#d3b563', '#5274a6', '#070807'], background: '#070807', availability: 'public' },
    { id: 'nier', name: 'NieR: Automata', colors: ['#4b413d', '#6f5148', '#c7c1aa'], background: '#c7c1aa', availability: 'public' },
    { id: 'crossing', name: 'Animal Crossing', colors: ['#58b6a6', '#77b96a', '#fff6d8'], background: '#e7dcc0', availability: 'reward' },
    { id: 'ori', name: 'Floresta de Nibel', colors: ['#ddfbff', '#55ddf4', '#071a35'], background: '#030a16', availability: 'reward' },
    { id: 'cosmic-campfire', name: 'Fogueira Cósmica', colors: ['#f0a35a', '#77c9d4', '#071522'], background: '#050d16', availability: 'reward' },
  ]);
  assert.equal(DEFAULT_THEME, 'original');
});

test('selectable themes expose public entries and only confirmed rewards', () => {
  assert.deepEqual(getSelectableThemes([]).map(theme => theme.id), ['original', 'zelda', 'nier']);
  assert.deepEqual(getSelectableThemes(['ori', 'ori']).map(theme => theme.id), ['original', 'zelda', 'nier', 'ori']);
  assert.equal(isThemeId('crossing'), true);
  assert.equal(isThemeId('missing'), false);
  assert.equal(isThemeId(null), false);
  assert.equal(isThemeId(42), false);
});
