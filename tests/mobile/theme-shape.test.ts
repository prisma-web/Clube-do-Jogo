import assert from 'node:assert/strict';
import { test } from 'node:test';
import normalizeColor from '@react-native/normalize-colors';
import { themes, themeShapes } from '@clube-do-jogo/domain';
import { applyThemeShape, controlTextStyle } from '../../apps/mobile/src/theme/shape';
import { themePalettes } from '../../apps/mobile/src/theme/palette';
import { radii } from '../../apps/mobile/src/theme/tokens';

const nier = themeShapes.nier;
const nierColors = themePalettes.nier;

const sheet = {
  title: { fontSize: 16, fontWeight: '800' as const },
  row: { flexDirection: 'row' as const },
  card: { borderRadius: radii.xxl, borderWidth: 1, backgroundColor: nierColors.surfaceSofter },
  input: { borderRadius: radii.lg, backgroundColor: nierColors.surfaceSoft },
  chip: { borderRadius: radii.sm },
  pill: { borderRadius: radii.full },
  avatar: { width: 40, height: 40, borderRadius: 20 },
};

test('NieR põe a fonte monoespaçada em todo texto e deixa o resto sem fonte', () => {
  const shaped = applyThemeShape(sheet, nier, nierColors);
  assert.equal(shaped.title.fontFamily, 'Geist Mono');
  assert.equal('fontFamily' in shaped.row, false);
});

test('NieR reduz cantos de 12px para cima a 2px e mantém círculos, pílulas e cantos pequenos', () => {
  const shaped = applyThemeShape(sheet, nier, nierColors);
  assert.equal(shaped.input.borderRadius, 2);
  assert.equal(shaped.chip.borderRadius, radii.sm);
  assert.equal(shaped.pill.borderRadius, radii.full);
  assert.equal(shaped.avatar.borderRadius, 20);
});

test('NieR transforma cartão de superfície em painel reto com sombra sólida', () => {
  const shaped = applyThemeShape(sheet, nier, nierColors);
  assert.deepEqual(shaped.card, {
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: nier.decor?.panel,
    boxShadow: nier.decor?.shadows.card,
  });
});

test('temas sem forma própria recebem a folha de estilo intacta', () => {
  for (const theme of themes.filter(item => item.id !== 'nier')) {
    assert.equal(applyThemeShape(sheet, themeShapes[theme.id], themePalettes[theme.id]), sheet, theme.id);
  }
});

test('botão do NieR fica em caixa alta com espaçamento proporcional ao tamanho', () => {
  assert.deepEqual(controlTextStyle(nier.button, 12), { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.54 });
  assert.deepEqual(controlTextStyle(nier.tab, 14), { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.12 });
  assert.deepEqual(controlTextStyle(themeShapes.original.button, 12), {});
});

test('toda cor e sombra do NieR é entendida pelo React Native', () => {
  const decor = nier.decor;
  assert.ok(decor);
  for (const color of [decor.ink, decor.onInk, decor.panel, decor.panelDeep, decor.ownedPanel, decor.line, decor.medalEdge, ...decor.medals]) {
    assert.notEqual(normalizeColor(color), null, color);
  }
  for (const shadow of Object.values(decor.shadows)) {
    const color = shadow.slice(shadow.indexOf('rgba'));
    assert.notEqual(normalizeColor(color), null, shadow);
  }
});
