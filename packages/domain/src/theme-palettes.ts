// Fonte única das cores de tema da web (CSS gerado) e do app (palette.ts do mobile).
//
// Como ler cada token:
// - '#rrggbb' ou 'rgb(r g b / a%)': mesma cor nas duas plataformas. Cada uma formata na
//   própria notação (o app recebe 'rgba(r,g,b,a)'), então diferença só de notação não existe aqui.
// - { app, web }: divergência real entre as plataformas, preservada de propósito até alguém
//   decidir qual valor vale. Não "corrija" uma divergência sem decidir isso com quem cuida do tema.
// - appOnly(...) / webOnly(...): só uma plataforma define o token. Na web, um token de escala
//   ausente herda o padrão do Tailwind; no app, todo token de ThemeColors precisa existir.
//
// Para mudar uma cor: edite aqui e rode `npm run themes:generate` para atualizar
// src/app/theme-tokens.generated.css. O teste de domínio falha se o CSS gerado ficar velho.

export type ThemeColorPlatform = 'app' | 'web';

export const themeColorTokens = [
  'background', 'foreground', 'surface', 'surfaceSoft', 'surfaceSofter', 'surfaceDeep', 'card', 'hairline', 'hairlineSoft',
  'violet200', 'violet300', 'violet400', 'violet500', 'violet600', 'violet700', 'violet950',
  'fuchsia600', 'fuchsia700',
  'zinc50', 'zinc100', 'zinc200', 'zinc300', 'zinc400', 'zinc500', 'zinc600', 'zinc700', 'zinc800', 'zinc900', 'zinc950',
  'amber200', 'amber300', 'amber400', 'amber500', 'amber950',
  'emerald300', 'emerald400', 'emerald500',
  'sky200', 'sky400',
  'red300', 'red400', 'red500', 'red600',
  'pink400',
  'supportVote', 'supportCompleted', 'supportBacklog', 'supportDanger',
  'primaryOn', 'white', 'black',
] as const;

export type ThemeColorToken = (typeof themeColorTokens)[number];

/** Valor por plataforma; `null` significa que a plataforma não define o token. */
export interface PlatformThemeColor {
  readonly app: string | null;
  readonly web: string | null;
}

export type ThemeColorValue = string | PlatformThemeColor;
export type ThemePaletteSource = { readonly [Token in ThemeColorToken]?: ThemeColorValue };

function appOnly(app: string): PlatformThemeColor {
  return { app, web: null };
}

function webOnly(web: string): PlatformThemeColor {
  return { app: null, web };
}

// As chaves são os ids de tema; themes.ts depende deste módulo (e não o contrário) para as prévias,
// e o teste de domínio garante que as chaves batem com a lista de temas.
export const themePaletteSource = {
  original: {
    background: '#08080a',
    foreground: '#f4f4f5',
    surface: '#101014',
    surfaceSoft: 'rgb(255 255 255 / 3.5%)',
    surfaceSofter: appOnly('rgb(255 255 255 / 2.5%)'),
    surfaceDeep: 'rgb(0 0 0 / 24%)',
    card: appOnly('#0c0c0f'),
    hairline: 'rgb(255 255 255 / 8%)',
    hairlineSoft: appOnly('rgb(255 255 255 / 7%)'),
    violet300: appOnly('#c4b5fd'),
    violet400: appOnly('#a78bfa'),
    violet500: appOnly('#8b5cf6'),
    violet600: appOnly('#7c3aed'),
    fuchsia600: appOnly('#c026d3'),
    zinc300: appOnly('#d4d4d8'),
    zinc400: appOnly('#a1a1aa'),
    zinc500: appOnly('#71717a'),
    zinc600: appOnly('#52525b'),
    zinc700: appOnly('#3f3f46'),
    zinc800: appOnly('#27272a'),
    zinc900: appOnly('#18181b'),
    zinc950: appOnly('#09090b'),
    amber200: appOnly('#fde68a'),
    amber300: appOnly('#fcd34d'),
    amber400: appOnly('#fbbf24'),
    amber950: appOnly('#451a03'),
    emerald300: appOnly('#6ee7b7'),
    emerald400: appOnly('#34d399'),
    emerald500: appOnly('#10b981'),
    sky400: appOnly('#38bdf8'),
    red300: appOnly('#fca5a5'),
    red400: appOnly('#f87171'),
    red500: appOnly('#ef4444'),
    red600: appOnly('#dc2626'),
    pink400: appOnly('#f472b6'),
    supportVote: '#8b5cf6',
    supportCompleted: '#10b981',
    supportBacklog: '#38bdf8',
    supportDanger: '#ef4444',
    primaryOn: '#ffffff',
    white: appOnly('#ffffff'),
    black: appOnly('#000000'),
  },
  zelda: {
    background: '#070807',
    foreground: '#efe6cf',
    surface: '#10120f',
    surfaceSoft: '#151712',
    surfaceSofter: appOnly('#12140f'),
    surfaceDeep: '#0a0c0a',
    card: appOnly('#0d0f0c'),
    hairline: 'rgb(211 181 99 / 20%)',
    hairlineSoft: appOnly('rgb(211 181 99 / 12%)'),
    violet200: webOnly('#fff1bd'),
    violet300: '#ead58e',
    violet400: '#d7bb6f',
    violet500: '#c39b42',
    violet600: '#b48732',
    violet700: webOnly('#76551e'),
    violet950: webOnly('#2e220d'),
    fuchsia600: '#3d7553',
    fuchsia700: webOnly('#28523a'),
    zinc50: webOnly('#faf6e9'),
    zinc100: webOnly('#f1ead7'),
    zinc200: webOnly('#ddd2b9'),
    zinc300: '#c5b99e',
    zinc400: '#a79f8b',
    zinc500: '#8f8878',
    zinc600: { app: '#7c7461', web: '#575348' },
    zinc700: '#3d4037',
    zinc800: '#252d27',
    zinc900: '#152019',
    zinc950: '#0b120d',
    amber200: appOnly('#fff1bd'),
    amber300: appOnly('#ead58e'),
    amber400: appOnly('#d7bb6f'),
    amber950: appOnly('#2e220d'),
    emerald300: '#91c59c',
    emerald400: '#6eaa7d',
    emerald500: '#4c855f',
    sky200: webOnly('#dbe2df'),
    sky400: '#9eaaa7',
    red300: appOnly('#d79aa0'),
    red400: appOnly('#c07079'),
    red500: appOnly('#a64e56'),
    red600: appOnly('#8c3f47'),
    pink400: appOnly('#c98f7a'),
    supportVote: '#5274a6',
    supportCompleted: '#4f8a67',
    supportBacklog: '#7c929f',
    supportDanger: '#a64e56',
    primaryOn: '#171006',
    white: appOnly('#ffffff'),
    black: appOnly('#000000'),
  },
  nier: {
    background: '#c7c1aa',
    foreground: '#332d2a',
    surface: '#d8d2bc',
    surfaceSoft: '#d3cdb6',
    surfaceSofter: appOnly('#dcd6c0'),
    surfaceDeep: '#bdb6a0',
    card: appOnly('#d8d2bc'),
    hairline: 'rgb(75 65 61 / 28%)',
    hairlineSoft: appOnly('rgb(75 65 61 / 16%)'),
    violet200: webOnly('#6d5e57'),
    violet300: '#5f514c',
    violet400: '#4b413d',
    violet500: '#514641',
    violet600: '#403733',
    violet700: webOnly('#332c29'),
    violet950: webOnly('#211d1b'),
    fuchsia600: '#8a5848',
    fuchsia700: webOnly('#70463a'),
    zinc50: webOnly('#332d2a'),
    zinc100: webOnly('#3f3733'),
    zinc200: webOnly('#4b413d'),
    zinc300: '#594e4a',
    zinc400: '#5e5550',
    zinc500: { app: '#6b615b', web: '#574e49' },
    zinc600: '#7c7268',
    zinc700: '#b0ab98',
    zinc800: '#c3bda8',
    zinc900: '#d5cfb8',
    zinc950: '#e3deca',
    amber200: '#5c3d34',
    amber300: '#915b48',
    amber400: '#7e4e3e',
    amber500: webOnly('#6f4437'),
    amber950: appOnly('#f4efdc'),
    emerald300: '#55735e',
    emerald400: '#476450',
    emerald500: '#3d5745',
    sky200: webOnly('#625a55'),
    sky400: '#514945',
    red300: '#87362f',
    red400: appOnly('#96392f'),
    red500: '#a83f35',
    red600: '#8f332c',
    pink400: appOnly('#8f4a4a'),
    supportVote: '#6f5148',
    supportCompleted: '#4f6956',
    supportBacklog: '#59676a',
    supportDanger: '#8f4037',
    primaryOn: '#f4efdc',
    white: appOnly('#ffffff'),
    black: appOnly('#000000'),
  },
  crossing: {
    background: { app: '#e7dcc0', web: '#d8edce' },
    foreground: { app: '#4d6258', web: '#3f5f56' },
    surface: { app: '#f7eccf', web: '#fff8df' },
    surfaceSoft: { app: '#f2e4c5', web: '#f6edcf' },
    surfaceSofter: appOnly('#f6ead0'),
    surfaceDeep: { app: '#e8d9b8', web: '#ebe2bd' },
    card: appOnly('#f9efd6'),
    hairline: { app: 'rgb(119 84 57 / 16%)', web: 'transparent' },
    hairlineSoft: appOnly('rgb(119 84 57 / 10%)'),
    violet200: webOnly('#e8fff9'),
    violet300: { app: '#08756d', web: '#2f8176' },
    violet400: { app: '#07968c', web: '#27998c' },
    violet500: { app: '#08aaa0', web: '#45ab9e' },
    violet600: { app: '#087a73', web: '#3d998d' },
    violet700: webOnly('#2e746b'),
    violet950: webOnly('#164a45'),
    fuchsia600: '#75b94e',
    fuchsia700: webOnly('#568f37'),
    zinc50: webOnly('#35564e'),
    zinc100: webOnly('#3d5d54'),
    zinc200: webOnly('#45645b'),
    zinc300: { app: '#596e63', web: '#506e65' },
    zinc400: { app: '#687c71', web: '#617b72' },
    zinc500: { app: '#77897e', web: '#6e837a' },
    zinc600: { app: '#819187', web: '#91a096' },
    zinc700: { app: '#c3cdbd', web: '#c4cfbb' },
    zinc800: { app: '#e3e8d9', web: '#e6e8ce' },
    zinc900: { app: '#f5f4e5', web: '#f5efd3' },
    zinc950: { app: '#fffaf0', web: '#fff8df' },
    amber200: '#7a4824',
    amber300: { app: '#a86b35', web: '#c07b42' },
    amber400: { app: '#cf8e4c', web: '#aa682e' },
    amber500: webOnly('#d79b52'),
    amber950: appOnly('#4b2c12'),
    emerald300: { app: '#3d7f2d', web: '#3f8b52' },
    emerald400: { app: '#397b2b', web: '#37834a' },
    emerald500: { app: '#4f9138', web: '#60a95b' },
    sky200: webOnly('#347b91'),
    sky400: '#3c94aa',
    red300: '#a92f35',
    red400: appOnly('#b93a3f'),
    red500: '#c63f44',
    red600: '#ac2e34',
    pink400: appOnly('#d3607e'),
    supportVote: { app: '#56bfb1', web: '#4eafa2' },
    supportCompleted: { app: '#86c673', web: '#72b86a' },
    supportBacklog: { app: '#78b8cc', web: '#6ab6c7' },
    supportDanger: { app: '#d26f78', web: '#dc796f' },
    primaryOn: { app: '#fffaf0', web: '#ffffff' },
    white: appOnly('#ffffff'),
    black: appOnly('#000000'),
  },
  ori: {
    background: '#030a16',
    foreground: '#e8fbff',
    surface: { app: '#06182a', web: 'rgb(6 24 42 / 88%)' },
    surfaceSoft: 'rgb(105 215 240 / 7%)',
    surfaceSofter: appOnly('rgb(105 215 240 / 4.5%)'),
    surfaceDeep: 'rgb(1 8 18 / 52%)',
    card: appOnly('#04121f'),
    hairline: 'rgb(159 235 249 / 18%)',
    hairlineSoft: appOnly('rgb(159 235 249 / 10%)'),
    violet200: webOnly('#dffbff'),
    violet300: '#b7f3fb',
    violet400: '#73e1f2',
    violet500: '#40c9e3',
    violet600: '#20aecb',
    violet700: webOnly('#147b99'),
    violet950: webOnly('#08263e'),
    fuchsia600: '#5d74d7',
    fuchsia700: webOnly('#4055af'),
    zinc50: webOnly('#effdff'),
    zinc100: webOnly('#ddf7fb'),
    zinc200: webOnly('#c7e8ed'),
    zinc300: '#a8ccd3',
    zinc400: '#7faab4',
    zinc500: '#648d99',
    zinc600: { app: '#557b89', web: '#416878' },
    zinc700: '#29495a',
    zinc800: '#143246',
    zinc900: '#091f33',
    zinc950: '#041321',
    amber200: '#e9fdff',
    amber300: '#bff7ff',
    amber400: '#79e5f5',
    amber500: webOnly('#45c9e1'),
    amber950: appOnly('#03111e'),
    emerald300: '#91f0cf',
    emerald400: '#68dfbd',
    emerald500: '#34bd97',
    sky200: webOnly('#c8f7ff'),
    sky400: '#58c9ec',
    red300: '#ff9ba8',
    red400: appOnly('#f78896'),
    red500: '#f07686',
    red600: '#cc5265',
    pink400: appOnly('#a99df8'),
    supportVote: '#958bea',
    supportCompleted: '#68dfbd',
    supportBacklog: '#58c9ec',
    supportDanger: '#f07686',
    primaryOn: '#03111e',
    white: appOnly('#ffffff'),
    black: appOnly('#000000'),
  },
  'cosmic-campfire': {
    background: '#010205',
    foreground: '#f3ead9',
    surface: { app: '#060a0e', web: 'rgb(6 10 14 / 91%)' },
    surfaceSoft: 'rgb(225 235 232 / 5.5%)',
    surfaceSofter: appOnly('rgb(225 235 232 / 3.5%)'),
    surfaceDeep: 'rgb(0 2 5 / 66%)',
    card: appOnly('#04070b'),
    hairline: 'rgb(224 187 138 / 18%)',
    hairlineSoft: appOnly('rgb(224 187 138 / 10%)'),
    violet200: webOnly('#ffe8c9'),
    violet300: '#f5c48d',
    violet400: '#efa15a',
    violet500: '#d9843f',
    violet600: '#bd682c',
    violet700: webOnly('#82431f'),
    violet950: webOnly('#321b10'),
    fuchsia600: '#ce7441',
    fuchsia700: webOnly('#944826'),
    zinc50: webOnly('#fff9ef'),
    zinc100: webOnly('#f3ead9'),
    zinc200: webOnly('#dfd4c1'),
    zinc300: '#c5b8a4',
    zinc400: '#a99d8c',
    zinc500: '#857e73',
    zinc600: { app: '#7a746c', web: '#65625d' },
    zinc700: '#44494a',
    zinc800: '#28333a',
    zinc900: '#13232d',
    zinc950: '#08131d',
    amber200: '#ffe5bd',
    amber300: '#f5bd79',
    amber400: '#e8964b',
    amber500: webOnly('#c97634'),
    amber950: appOnly('#1c1007'),
    emerald300: '#9bd3b6',
    emerald400: '#69b994',
    emerald500: '#448e70',
    sky200: webOnly('#b9e6e9'),
    sky400: '#74c2d1',
    red300: '#f0a092',
    red400: appOnly('#e78c7e'),
    red500: '#df776a',
    red600: '#ba514b',
    pink400: appOnly('#d99a8a'),
    supportVote: '#a9a1d7',
    supportCompleted: '#69b994',
    supportBacklog: '#74c2d1',
    supportDanger: '#df776a',
    primaryOn: '#1c1007',
    white: appOnly('#ffffff'),
    black: appOnly('#000000'),
  },
} satisfies Record<string, ThemePaletteSource>;

export type ThemePaletteId = keyof typeof themePaletteSource;

export interface ThemeRgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  /** 0 a 1. */
  readonly a: number;
}

/** Aceita '#rgb', '#rrggbb', '#rrggbbaa', 'rgb()/rgba()' (vírgulas ou espaços, alfa em % ou fração) e 'transparent'. */
export function parseThemeColor(value: string): ThemeRgba {
  const input = value.trim().toLowerCase();
  if (input === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(input);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map(digit => digit + digit).join('') : hex[1];
    const channel = (index: number) => parseInt(digits.slice(index, index + 2), 16);
    return { r: channel(0), g: channel(2), b: channel(4), a: digits.length === 8 ? roundAlpha(channel(6) / 255) : 1 };
  }
  const functional = /^rgba?\((.*)\)$/.exec(input);
  if (functional) {
    const body = functional[1].trim();
    let channels: string[];
    let alpha = '1';
    if (body.includes(',')) {
      channels = body.split(',').map(part => part.trim());
      if (channels.length === 4) alpha = channels.pop() ?? '1';
    } else {
      const [color, alphaPart] = body.split('/').map(part => part.trim());
      channels = color.split(/\s+/);
      if (alphaPart !== undefined) alpha = alphaPart;
    }
    const numbers = channels.map(Number);
    const a = alpha.endsWith('%') ? Number(alpha.slice(0, -1)) / 100 : Number(alpha);
    if (numbers.length === 3 && numbers.every(isChannel) && a >= 0 && a <= 1) {
      return { r: numbers[0], g: numbers[1], b: numbers[2], a: roundAlpha(a) };
    }
  }
  throw new Error(`Cor de tema inválida: ${value}`);
}

function isChannel(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 255;
}

function roundAlpha(alpha: number): number {
  return Math.round(alpha * 10000) / 10000;
}

function toHex({ r, g, b }: ThemeRgba): string {
  return `#${[r, g, b].map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
}

/** Formata a cor na notação de cada plataforma: hex quando opaca, rgba() no app e rgb(/ %) na web. */
export function formatThemeColor(value: string, platform: ThemeColorPlatform): string {
  const color = parseThemeColor(value);
  if (color.a === 1) return toHex(color);
  if (color.a === 0 && color.r === 0 && color.g === 0 && color.b === 0) return 'transparent';
  if (platform === 'app') return `rgba(${color.r},${color.g},${color.b},${color.a})`;
  return `rgb(${color.r} ${color.g} ${color.b} / ${Math.round(color.a * 10000) / 100}%)`;
}

function platformValue(value: ThemeColorValue, platform: ThemeColorPlatform): string | null {
  return typeof value === 'string' ? value : value[platform];
}

/** Paleta já formatada para uma plataforma; tokens que a plataforma não define ficam de fora. */
export function resolveThemePalette(themeId: ThemePaletteId, platform: ThemeColorPlatform): Partial<Record<ThemeColorToken, string>> {
  const resolved: Partial<Record<ThemeColorToken, string>> = {};
  const source: ThemePaletteSource = themePaletteSource[themeId];
  for (const token of themeColorTokens) {
    const value = source[token];
    if (value === undefined) continue;
    const raw = platformValue(value, platform);
    if (raw !== null) resolved[token] = formatThemeColor(raw, platform);
  }
  return resolved;
}

/** Cor que as duas plataformas compartilham; falha se o token divergir ou faltar em alguma delas. */
export function sharedThemeColor(themeId: ThemePaletteId, token: ThemeColorToken): string {
  const source: ThemePaletteSource = themePaletteSource[themeId];
  const value = source[token];
  if (typeof value !== 'string') throw new Error(`O token ${token} do tema ${themeId} não é compartilhado entre web e app.`);
  return formatThemeColor(value, 'web');
}

/** Nome da custom property da web: escalas viram --color-<família>-<degrau>, o resto vira kebab-case. */
export function webThemeColorProperty(token: ThemeColorToken): string {
  const scale = /^([a-z]+)(\d+)$/.exec(token);
  if (scale) return `--color-${scale[1]}-${scale[2]}`;
  if (token === 'white' || token === 'black') return `--color-${token}`;
  return `--${token.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
}
