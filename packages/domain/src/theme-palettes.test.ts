import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { formatThemeColor, parseThemeColor, platformDivergenceReasons, resolveThemePalette, themeColorTokens, themePaletteSource, webThemeColorProperty } from './theme-palettes';
import { renderThemeTokensCss, THEME_TOKENS_CSS_PATH, THEME_TOKENS_GENERATE_COMMAND } from './theme-tokens-css';
import { themes } from './themes';

test('o CSS de tokens da web está em dia com a paleta compartilhada', () => {
  const generated = readFileSync(new URL(`../../../${THEME_TOKENS_CSS_PATH}`, import.meta.url), 'utf8');
  assert.equal(generated, renderThemeTokensCss(), `${THEME_TOKENS_CSS_PATH} está desatualizado: rode \`${THEME_TOKENS_GENERATE_COMMAND}\`.`);
});

test('a paleta cobre exatamente os temas do catálogo', () => {
  assert.deepEqual(Object.keys(themePaletteSource).sort(), themes.map(theme => theme.id).sort());
});

test('todo valor é uma cor válida e pares por plataforma só existem para divergências reais', () => {
  for (const [themeId, palette] of Object.entries(themePaletteSource)) {
    for (const [token, value] of Object.entries(palette)) {
      if (typeof value === 'string') {
        parseThemeColor(value);
        continue;
      }
      assert.ok(value.app !== null || value.web !== null, `${themeId}.${token} não define nenhuma plataforma`);
      if (value.app !== null && value.web !== null) {
        assert.notDeepEqual(parseThemeColor(value.app), parseThemeColor(value.web), `${themeId}.${token} é igual nas duas plataformas: use um valor único`);
        assert.ok('reason' in value && value.reason in platformDivergenceReasons, `${themeId}.${token} diverge entre web e app sem motivo documentado`);
      }
    }
  }
});

test('todos os temas definem o mesmo conjunto de cores no app', () => {
  const expected = Object.keys(resolveThemePalette('original', 'app'));
  for (const theme of themes) assert.deepEqual(Object.keys(resolveThemePalette(theme.id, 'app')), expected, theme.id);
});

test('cada plataforma recebe a cor na própria notação', () => {
  assert.equal(formatThemeColor('rgb(255 255 255 / 3.5%)', 'app'), 'rgba(255,255,255,0.035)');
  assert.equal(formatThemeColor('rgb(255 255 255 / 3.5%)', 'web'), 'rgb(255 255 255 / 3.5%)');
  assert.equal(formatThemeColor('rgba(211,181,99,0.20)', 'web'), 'rgb(211 181 99 / 20%)');
  assert.equal(formatThemeColor('#FFF', 'app'), '#ffffff');
  assert.equal(formatThemeColor('transparent', 'web'), 'transparent');
  assert.throws(() => parseThemeColor('oklch(70% 0.1 200)'));
  assert.deepEqual(themeColorTokens.filter(token => token.startsWith('zinc')).map(webThemeColorProperty).slice(0, 2), ['--color-zinc-50', '--color-zinc-100']);
  assert.equal(webThemeColorProperty('surfaceSoft'), '--surface-soft');
});

test('nier e crossing são os únicos temas claros', () => {
  assert.deepEqual(themes.filter(theme => theme.scheme === 'light').map(theme => theme.id), ['nier', 'crossing']);
});
