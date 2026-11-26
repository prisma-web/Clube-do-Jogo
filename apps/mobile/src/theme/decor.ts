import type { TextStyle, ViewStyle } from 'react-native';
import type { ThemeDecor, ThemeDecorShadows } from '@clube-do-jogo/domain';

export function decorPanel(decor: ThemeDecor | null, shadow: keyof ThemeDecorShadows = 'card'): ViewStyle {
  if (!decor) return {};
  return { borderWidth: 0, borderRadius: 0, backgroundColor: decor.panel, boxShadow: decor.shadows[shadow] };
}

export function decorAccentPanel(decor: ThemeDecor | null, shadow: keyof ThemeDecorShadows = 'card'): ViewStyle {
  if (!decor) return {};
  return { ...decorPanel(decor, shadow), borderLeftWidth: decor.accentWidth, borderLeftColor: decor.ink };
}

export function decorInk(decor: ThemeDecor | null, shadow?: keyof ThemeDecorShadows): ViewStyle {
  if (!decor) return {};
  return {
    borderRadius: 0,
    borderColor: decor.ink,
    backgroundColor: decor.ink,
    ...(shadow && { boxShadow: decor.shadows[shadow] }),
  };
}

export function decorInkText(decor: ThemeDecor | null): TextStyle {
  return decor ? { color: decor.onInk } : {};
}

export function decorOutline(decor: ThemeDecor | null): ViewStyle {
  if (!decor) return {};
  return { borderRadius: 0, borderWidth: 1, borderColor: decor.line, backgroundColor: 'transparent' };
}

export function decorSquare(decor: ThemeDecor | null): ViewStyle {
  return decor ? { borderRadius: 0 } : {};
}
