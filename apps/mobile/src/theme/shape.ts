import type { ImageStyle, TextStyle, ViewStyle } from 'react-native';
import type { ThemeControlText, ThemeFont, ThemeShape, ThemeTitleText } from '@clube-do-jogo/domain';
import { decorPanel } from './decor';
import type { ThemeColors } from './palette';
import { radii } from './tokens';

type Style = ViewStyle | TextStyle | ImageStyle;

const fontFamilies: Record<ThemeFont, string | undefined> = {
  sans: undefined,
  mono: 'Geist Mono',
};

const radiusKeys = [
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  'borderTopStartRadius',
  'borderTopEndRadius',
  'borderBottomStartRadius',
  'borderBottomEndRadius',
] as const;

function isCircle(style: Style, radius: number): boolean {
  const { width, height } = style;
  return typeof width === 'number' && width === height && radius * 2 >= width;
}

const cardRadius = radii.xl;

function isCard(style: Style, surfaces: ReadonlySet<string>): boolean {
  const { borderRadius, backgroundColor } = style as Record<string, unknown>;
  return typeof borderRadius === 'number' && borderRadius >= cardRadius && borderRadius < radii.full
    && typeof backgroundColor === 'string' && surfaces.has(backgroundColor) && !isCircle(style, borderRadius);
}

function shapeStyle(style: Style, shape: ThemeShape, fontFamily: string | undefined, surfaces: ReadonlySet<string>): Style {
  const values = style as Record<string, unknown>;
  let next: Record<string, unknown> | null = null;
  const edit = () => (next ??= { ...style });
  if (shape.decor && isCard(style, surfaces)) Object.assign(edit(), decorPanel(shape.decor));
  const { corners } = shape;
  if (corners) {
    for (const key of radiusKeys) {
      const radius = (next ?? values)[key];
      if (typeof radius === 'number' && radius >= corners.from && radius < radii.full && !isCircle(style, radius)) edit()[key] = corners.radius;
    }
  }
  if (fontFamily && !('fontFamily' in style) && ('fontSize' in style || 'fontWeight' in style)) edit().fontFamily = fontFamily;
  return (next ?? style) as Style;
}

export function applyThemeShape<T extends Record<string, Style>>(sheet: T, shape: ThemeShape, colors: ThemeColors): T {
  const fontFamily = fontFamilies[shape.font];
  if (!shape.corners && !fontFamily && !shape.decor) return sheet;
  const surfaces = new Set([colors.surface, colors.surfaceSoft, colors.surfaceSofter, colors.card]);
  const shaped = {} as Record<string, Style>;
  for (const [name, style] of Object.entries(sheet)) shaped[name] = shapeStyle(style, shape, fontFamily, surfaces);
  return shaped as T;
}

export function controlTextStyle(control: ThemeControlText | null, fontSize: number): TextStyle {
  if (!control) return {};
  const size = control.fontSize ?? fontSize;
  return { fontSize: size, textTransform: 'uppercase', letterSpacing: control.letterSpacingEm * size };
}

export function titleTextStyle(title: ThemeTitleText | null): TextStyle {
  return title ? { fontSize: title.fontSize, letterSpacing: title.letterSpacingEm * title.fontSize } : {};
}

export function themeFontStyle(shape: ThemeShape): TextStyle {
  const fontFamily = fontFamilies[shape.font];
  return fontFamily ? { fontFamily } : {};
}
