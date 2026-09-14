import type { ThemeId } from '@clube-do-jogo/domain';

export interface ThemeColors {
  background: string;
  foreground: string;
  surface: string;
  surfaceSoft: string;
  surfaceSofter: string;
  surfaceDeep: string;
  card: string;
  hairline: string;
  hairlineSoft: string;

  violet300: string;
  violet400: string;
  violet500: string;
  violet600: string;
  fuchsia600: string;

  zinc300: string;
  zinc400: string;
  zinc500: string;
  zinc600: string;
  zinc700: string;
  zinc800: string;
  zinc900: string;
  zinc950: string;

  amber200: string;
  amber300: string;
  amber400: string;
  amber950: string;

  emerald300: string;
  emerald400: string;
  emerald500: string;

  sky400: string;

  red300: string;
  red400: string;
  red500: string;
  red600: string;

  pink400: string;

  supportVote: string;
  supportCompleted: string;
  supportBacklog: string;
  supportDanger: string;

  primaryOn: string;
  white: string;
  black: string;
}

const original: ThemeColors = {
  background: '#08080a',
  foreground: '#f4f4f5',
  surface: '#101014',
  surfaceSoft: 'rgba(255,255,255,0.035)',
  surfaceSofter: 'rgba(255,255,255,0.025)',
  surfaceDeep: 'rgba(0,0,0,0.24)',
  card: '#0c0c0f',
  hairline: 'rgba(255,255,255,0.08)',
  hairlineSoft: 'rgba(255,255,255,0.07)',

  violet300: '#c4b5fd',
  violet400: '#a78bfa',
  violet500: '#8b5cf6',
  violet600: '#7c3aed',
  fuchsia600: '#c026d3',

  zinc300: '#d4d4d8',
  zinc400: '#a1a1aa',
  zinc500: '#71717a',
  zinc600: '#52525b',
  zinc700: '#3f3f46',
  zinc800: '#27272a',
  zinc900: '#18181b',
  zinc950: '#09090b',

  amber200: '#fde68a',
  amber300: '#fcd34d',
  amber400: '#fbbf24',
  amber950: '#451a03',

  emerald300: '#6ee7b7',
  emerald400: '#34d399',
  emerald500: '#10b981',

  sky400: '#38bdf8',

  red300: '#fca5a5',
  red400: '#f87171',
  red500: '#ef4444',
  red600: '#dc2626',

  pink400: '#f472b6',

  supportVote: '#8b5cf6',
  supportCompleted: '#10b981',
  supportBacklog: '#38bdf8',
  supportDanger: '#ef4444',

  primaryOn: '#ffffff',
  white: '#ffffff',
  black: '#000000',
};

const zelda: ThemeColors = {
  background: '#070807',
  foreground: '#efe6cf',
  surface: '#10120f',
  surfaceSoft: '#151712',
  surfaceSofter: '#12140f',
  surfaceDeep: '#0a0c0a',
  card: '#0d0f0c',
  hairline: 'rgba(211,181,99,0.20)',
  hairlineSoft: 'rgba(211,181,99,0.12)',

  violet300: '#ead58e',
  violet400: '#d7bb6f',
  violet500: '#c39b42',
  violet600: '#b48732',
  fuchsia600: '#3d7553',

  zinc300: '#c5b99e',
  zinc400: '#a79f8b',
  zinc500: '#8f8878',
  zinc600: '#7c7461',
  zinc700: '#3d4037',
  zinc800: '#252d27',
  zinc900: '#152019',
  zinc950: '#0b120d',

  amber200: '#fff1bd',
  amber300: '#ead58e',
  amber400: '#d7bb6f',
  amber950: '#2e220d',

  emerald300: '#91c59c',
  emerald400: '#6eaa7d',
  emerald500: '#4c855f',

  sky400: '#9eaaa7',

  red300: '#d79aa0',
  red400: '#c07079',
  red500: '#a64e56',
  red600: '#8c3f47',

  pink400: '#c98f7a',

  supportVote: '#5274a6',
  supportCompleted: '#4f8a67',
  supportBacklog: '#7c929f',
  supportDanger: '#a64e56',

  primaryOn: '#171006',
  white: '#ffffff',
  black: '#000000',
};

const nier: ThemeColors = {
  background: '#c7c1aa',
  foreground: '#332d2a',
  surface: '#d8d2bc',
  surfaceSoft: '#d3cdb6',
  surfaceSofter: '#dcd6c0',
  surfaceDeep: '#bdb6a0',
  card: '#d8d2bc',
  hairline: 'rgba(75,65,61,0.28)',
  hairlineSoft: 'rgba(75,65,61,0.16)',

  violet300: '#5f514c',
  violet400: '#4b413d',
  violet500: '#514641',
  violet600: '#403733',
  fuchsia600: '#8a5848',

  zinc300: '#594e4a',
  zinc400: '#5e5550',
  zinc500: '#6b615b',
  zinc600: '#7c7268',
  zinc700: '#b0ab98',
  zinc800: '#c3bda8',
  zinc900: '#d5cfb8',
  zinc950: '#e3deca',

  amber200: '#5c3d34',
  amber300: '#915b48',
  amber400: '#7e4e3e',
  amber950: '#f4efdc',

  emerald300: '#55735e',
  emerald400: '#476450',
  emerald500: '#3d5745',

  sky400: '#514945',

  red300: '#87362f',
  red400: '#96392f',
  red500: '#a83f35',
  red600: '#8f332c',

  pink400: '#8f4a4a',

  supportVote: '#6f5148',
  supportCompleted: '#4f6956',
  supportBacklog: '#59676a',
  supportDanger: '#8f4037',

  primaryOn: '#f4efdc',
  white: '#ffffff',
  black: '#000000',
};

const crossing: ThemeColors = {
  background: '#e7dcc0',
  foreground: '#4d6258',
  surface: '#f7eccf',
  surfaceSoft: '#f2e4c5',
  surfaceSofter: '#f6ead0',
  surfaceDeep: '#e8d9b8',
  card: '#f9efd6',
  hairline: 'rgba(119,84,57,0.16)',
  hairlineSoft: 'rgba(119,84,57,0.10)',

  violet300: '#08756d',
  violet400: '#07968c',
  violet500: '#08aaa0',
  violet600: '#087a73',
  fuchsia600: '#75b94e',

  zinc300: '#596e63',
  zinc400: '#687c71',
  zinc500: '#77897e',
  zinc600: '#819187',
  zinc700: '#c3cdbd',
  zinc800: '#e3e8d9',
  zinc900: '#f5f4e5',
  zinc950: '#fffaf0',

  amber200: '#7a4824',
  amber300: '#a86b35',
  amber400: '#cf8e4c',
  amber950: '#4b2c12',

  emerald300: '#3d7f2d',
  emerald400: '#397b2b',
  emerald500: '#4f9138',

  sky400: '#3c94aa',

  red300: '#a92f35',
  red400: '#b93a3f',
  red500: '#c63f44',
  red600: '#ac2e34',

  pink400: '#d3607e',

  supportVote: '#56bfb1',
  supportCompleted: '#86c673',
  supportBacklog: '#78b8cc',
  supportDanger: '#d26f78',

  primaryOn: '#fffaf0',
  white: '#ffffff',
  black: '#000000',
};

const ori: ThemeColors = {
  background: '#030a16',
  foreground: '#e8fbff',
  surface: '#06182a',
  surfaceSoft: 'rgba(105,215,240,0.07)',
  surfaceSofter: 'rgba(105,215,240,0.045)',
  surfaceDeep: 'rgba(1,8,18,0.52)',
  card: '#04121f',
  hairline: 'rgba(159,235,249,0.18)',
  hairlineSoft: 'rgba(159,235,249,0.10)',

  violet300: '#b7f3fb',
  violet400: '#73e1f2',
  violet500: '#40c9e3',
  violet600: '#20aecb',
  fuchsia600: '#5d74d7',

  zinc300: '#a8ccd3',
  zinc400: '#7faab4',
  zinc500: '#648d99',
  zinc600: '#557b89',
  zinc700: '#29495a',
  zinc800: '#143246',
  zinc900: '#091f33',
  zinc950: '#041321',

  amber200: '#e9fdff',
  amber300: '#bff7ff',
  amber400: '#79e5f5',
  amber950: '#03111e',

  emerald300: '#91f0cf',
  emerald400: '#68dfbd',
  emerald500: '#34bd97',

  sky400: '#58c9ec',

  red300: '#ff9ba8',
  red400: '#f78896',
  red500: '#f07686',
  red600: '#cc5265',

  pink400: '#a99df8',

  supportVote: '#958bea',
  supportCompleted: '#68dfbd',
  supportBacklog: '#58c9ec',
  supportDanger: '#f07686',

  primaryOn: '#03111e',
  white: '#ffffff',
  black: '#000000',
};

const cosmicCampfire: ThemeColors = {
  background: '#010205',
  foreground: '#f3ead9',
  surface: '#060a0e',
  surfaceSoft: 'rgba(225,235,232,0.055)',
  surfaceSofter: 'rgba(225,235,232,0.035)',
  surfaceDeep: 'rgba(0,2,5,0.66)',
  card: '#04070b',
  hairline: 'rgba(224,187,138,0.18)',
  hairlineSoft: 'rgba(224,187,138,0.10)',

  violet300: '#f5c48d',
  violet400: '#efa15a',
  violet500: '#d9843f',
  violet600: '#bd682c',
  fuchsia600: '#ce7441',

  zinc300: '#c5b8a4',
  zinc400: '#a99d8c',
  zinc500: '#857e73',
  zinc600: '#7a746c',
  zinc700: '#44494a',
  zinc800: '#28333a',
  zinc900: '#13232d',
  zinc950: '#08131d',

  amber200: '#ffe5bd',
  amber300: '#f5bd79',
  amber400: '#e8964b',
  amber950: '#1c1007',

  emerald300: '#9bd3b6',
  emerald400: '#69b994',
  emerald500: '#448e70',

  sky400: '#74c2d1',

  red300: '#f0a092',
  red400: '#e78c7e',
  red500: '#df776a',
  red600: '#ba514b',

  pink400: '#d99a8a',

  supportVote: '#a9a1d7',
  supportCompleted: '#69b994',
  supportBacklog: '#74c2d1',
  supportDanger: '#df776a',

  primaryOn: '#1c1007',
  white: '#ffffff',
  black: '#000000',
};

export const themePalettes: Record<ThemeId, ThemeColors> = {
  original,
  zelda,
  nier,
  crossing,
  ori,
  'cosmic-campfire': cosmicCampfire,
};

export const lightThemeIds: readonly ThemeId[] = ['nier', 'crossing'];

export const colors = original;
