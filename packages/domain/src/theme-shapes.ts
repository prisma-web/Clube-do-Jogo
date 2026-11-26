import type { ThemeId } from './themes';

export type ThemeFont = 'sans' | 'mono';

export interface ThemeControlText {
  readonly fontSize?: number;
  readonly letterSpacingEm: number;
}

export interface ThemeCorners {
  readonly from: number;
  readonly radius: number;
}

export interface ThemeDecorShadows {
  readonly card: string;
  readonly control: string;
  readonly chip: string;
  readonly cover: string;
  readonly hero: string;
  readonly dialog: string;
}

export interface ThemeDecor {
  readonly ink: string;
  readonly onInk: string;
  readonly panel: string;
  readonly panelDeep: string;
  readonly ownedPanel: string;
  readonly line: string;
  readonly accentWidth: number;
  readonly dialogAccentWidth: number;
  readonly medals: readonly [string, string, string];
  readonly medalEdge: string;
  readonly shadows: ThemeDecorShadows;
}

export interface ThemeShape {
  readonly font: ThemeFont;
  readonly corners: ThemeCorners | null;
  readonly button: ThemeControlText | null;
  readonly tab: ThemeControlText | null;
  readonly decor: ThemeDecor | null;
}

const standardShape: ThemeShape = { font: 'sans', corners: null, button: null, tab: null, decor: null };

function inkShadow(offset: number, alpha: number): string {
  return `${offset}px ${offset}px 0 rgba(75, 65, 61, ${alpha / 100})`;
}

export const themeShapes: Record<ThemeId, ThemeShape> = {
  original: standardShape,
  zelda: standardShape,
  nier: {
    font: 'mono',
    corners: { from: 12, radius: 2 },
    button: { letterSpacingEm: 0.045 },
    tab: { fontSize: 10, letterSpacingEm: 0.012 },
    decor: {
      ink: '#4b413d',
      onInk: '#e3deca',
      panel: '#d8d2bc',
      panelDeep: '#c9c3ad',
      ownedPanel: '#bfc1aa',
      line: 'rgba(75, 65, 61, 0.42)',
      accentWidth: 4,
      dialogAccentWidth: 5,
      medals: ['#4b413d', '#70665e', '#805746'],
      medalEdge: '#c7c1aa',
      shadows: {
        card: inkShadow(5, 16),
        control: inkShadow(3, 18),
        chip: inkShadow(4, 17),
        cover: inkShadow(6, 25),
        hero: inkShadow(7, 22),
        dialog: inkShadow(8, 22),
      },
    },
  },
  crossing: standardShape,
  ori: standardShape,
  'cosmic-campfire': standardShape,
};

const webRoundedClasses: readonly (readonly [string, number])[] = [
  ['.rounded-3xl', 24], ['.rounded-2xl', 16], ['.rounded-xl', 12],
  ['.rounded-\\[30px\\]', 30], ['.rounded-\\[32px\\]', 32], ['.rounded-\\[28px\\]', 28],
];

const webFontFamilies: Record<ThemeFont, string | null> = {
  sans: null,
  mono: 'var(--font-geist-mono), monospace',
};

function cssEm(value: number): string {
  return `${String(value).replace(/^0\./, '.')}em`;
}

export function renderThemeShapeCss(themeId: ThemeId): string[] {
  const shape = themeShapes[themeId];
  const root = `:root[data-theme='${themeId}']`;
  const rules: string[] = [];
  if (shape.corners) {
    const { from, radius } = shape.corners;
    const classes = webRoundedClasses.filter(([, px]) => px >= from).map(([selector]) => selector);
    rules.push(`${root} :where(${classes.join(', ')}) { border-radius: ${radius}px !important; }`);
  }
  const family = webFontFamilies[shape.font];
  if (family) rules.push(`${root} body { font-family: ${family}; }`);
  if (shape.button) {
    rules.push(`${root} :where(button, [role='menuitem']) { text-transform: uppercase; letter-spacing: ${cssEm(shape.button.letterSpacingEm)}; }`);
  }
  if (shape.tab) {
    const size = shape.tab.fontSize === undefined ? '' : ` font-size: ${shape.tab.fontSize}px !important;`;
    rules.push(`${root} [role='tab'] {${size} text-transform: uppercase; letter-spacing: ${cssEm(shape.tab.letterSpacingEm)}; }`);
  }
  return rules;
}
