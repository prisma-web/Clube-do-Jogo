import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emojiKeyboardTheme, emojiKeyboardTranslation } from '../../apps/mobile/src/features/timeline/emoji-keyboard-theme';
import { themePalettes } from '../../apps/mobile/src/theme/palette';

test('emojiKeyboardTheme maps the dark original palette onto every keyboard slot', () => {
  assert.deepEqual(emojiKeyboardTheme(themePalettes.original), {
    container: '#101014',
    header: '#a1a1aa',
    skinTonesContainer: 'rgba(255,255,255,0.035)',
    category: {
      icon: '#71717a',
      iconActive: '#ffffff',
      container: 'rgba(255,255,255,0.025)',
      containerActive: '#8b5cf6',
    },
    search: {
      background: 'rgba(255,255,255,0.025)',
      text: '#f4f4f5',
      placeholder: '#71717a',
      icon: '#a1a1aa',
    },
  });
});

test('emojiKeyboardTheme follows a light palette instead of hardcoding dark', () => {
  const light = emojiKeyboardTheme(themePalettes.crossing);
  assert.equal(light.container, '#f7eccf');
  assert.equal(light.search.text, '#4d6258');
  assert.equal(light.search.placeholder, '#77897e');
  assert.equal(light.search.background, '#f6ead0');
  assert.equal(light.category.containerActive, '#08aaa0');
  assert.equal(light.category.iconActive, '#fffaf0');
});

test('emojiKeyboardTranslation names every category in Portuguese', () => {
  assert.deepEqual(emojiKeyboardTranslation, {
    recently_used: 'Usado recentemente',
    smileys_emotion: 'Sorrisos & Emoções',
    people_body: 'Pessoas & Corpo',
    animals_nature: 'Animais & Natureza',
    food_drink: 'Comida & Bebida',
    travel_places: 'Viagens & Lugares',
    activities: 'Atividades',
    objects: 'Objetos',
    symbols: 'Símbolos',
    flags: 'Bandeiras',
    search: 'Buscar emoji',
  });
});
