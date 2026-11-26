import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderThemeShapeCss } from './theme-shapes';
import { themes } from './themes';

test('só o NieR gera regras de forma para a web', () => {
  for (const theme of themes.filter(item => item.id !== 'nier')) assert.deepEqual(renderThemeShapeCss(theme.id), [], theme.id);
});

test('NieR na web: fonte mono, cantos de rounded-xl para cima em 2px, botões e abas em caixa alta', () => {
  assert.deepEqual(renderThemeShapeCss('nier'), [
    ":root[data-theme='nier'] :where(.rounded-3xl, .rounded-2xl, .rounded-xl, .rounded-\\[30px\\], .rounded-\\[32px\\], .rounded-\\[28px\\]) { border-radius: 2px !important; }",
    ":root[data-theme='nier'] body { font-family: var(--font-geist-mono), monospace; }",
    ":root[data-theme='nier'] :where(button, [role='menuitem']) { text-transform: uppercase; letter-spacing: .045em; }",
    ":root[data-theme='nier'] [role='tab'] { font-size: 10px !important; text-transform: uppercase; letter-spacing: .012em; }",
  ]);
});
