export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 28,
  full: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const fontWeights = {
  bold: '700' as const,
  extrabold: '800' as const,
  black: '900' as const,
};

export const typography = {
  h1: { fontSize: 30, fontWeight: fontWeights.black, letterSpacing: -0.5 },
  h2: { fontSize: 20, fontWeight: fontWeights.black, letterSpacing: -0.2 },
  h3: { fontSize: 16, fontWeight: fontWeights.extrabold },
  body: { fontSize: 14, fontWeight: '500' as const },
  small: { fontSize: 12, fontWeight: '600' as const },
  tiny: { fontSize: 10, fontWeight: fontWeights.extrabold, letterSpacing: 0.6, textTransform: 'uppercase' as const },
} as const;
