import type { ThemeName } from '../types.ts';

export const tokens = {
  spacingMd: 12,
  spacingLg: 16,
  spacingXl: 24,
  radiusMd: 12,
  fontSizeSubhead: 15,
  fontSizeCallout: 16,
  fontSizeBody: 17,
  fontWeightSemibold: '600' as const,
  cellSize: 36,
};

export type PaletteColors = {
  black: string;
  darkRed: string;
  darkGreen: string;
  darkYellow: string;
  darkBlue: string;
  darkMagenta: string;
  darkCyan: string;
  lightGray: string;
  darkGray: string;
  lightRed: string;
  lightGreen: string;
  lightYellow: string;
  lightBlue: string;
  lightMagenta: string;
  lightCyan: string;
  white: string;
};

// ─── ORIGINAL ────────────────────────────────────────────────────────────────

const originalLight: PaletteColors = {
  black: '#1f2328',
  darkRed: '#cf222e',
  darkGreen: '#08872B',
  darkYellow: '#A06100',
  darkBlue: '#0969da',
  darkMagenta: '#8250df',
  darkCyan: '#1b7c83',
  lightGray: '192, 192, 192',
  darkGray: '128, 128, 128',
  lightRed: '#a40e26',
  lightGreen: '#EBF9F4',
  lightYellow: '#BE7D00',
  lightBlue: '#218bff',
  lightMagenta: '#a475f9',
  lightCyan: '#3192aa',
  white: '255, 255, 255',
};

const originalDark: PaletteColors = { ...originalLight };

// ─── CRIMSON ─────────────────────────────────────────────────────────────────

const crimsonLight: PaletteColors = {
  black: '0, 0, 0',
  darkRed: '160, 20, 20',
  darkGreen: '0, 120, 40',
  darkYellow: '160, 80, 0',
  darkBlue: '60, 0, 120',
  darkMagenta: '140, 0, 80',
  darkCyan: '0, 100, 120',
  lightGray: '192, 192, 192',
  darkGray: '128, 128, 128',
  lightRed: '255, 60, 60',
  lightGreen: '60, 220, 100',
  lightYellow: '255, 160, 0',
  lightBlue: '220, 20, 60',
  lightMagenta: '255, 60, 140',
  lightCyan: '0, 220, 220',
  white: '255, 255, 255',
};

const crimsonDark: PaletteColors = { ...crimsonLight };

// ─── GRUVBOX ─────────────────────────────────────────────────────────────────

const gruvboxDark: PaletteColors = {
  black: '40, 40, 40',
  darkRed: '204, 36, 29',
  darkGreen: '152, 151, 26',
  darkYellow: '215, 153, 33',
  darkBlue: '69, 133, 136',
  darkMagenta: '177, 98, 134',
  darkCyan: '104, 157, 106',
  lightGray: '168, 153, 132',
  darkGray: '146, 131, 116',
  lightRed: '251, 73, 52',
  lightGreen: '184, 187, 38',
  lightYellow: '250, 189, 47',
  lightBlue: '131, 165, 152',
  lightMagenta: '211, 134, 155',
  lightCyan: '142, 192, 124',
  white: '235, 219, 178',
};

const gruvboxLight: PaletteColors = {
  black: '60, 56, 54',
  darkRed: '157, 0, 6',
  darkGreen: '121, 116, 14',
  darkYellow: '181, 118, 20',
  darkBlue: '7, 102, 120',
  darkMagenta: '143, 63, 113',
  darkCyan: '66, 123, 88',
  darkGray: '124, 111, 100',
  lightGray: '146, 131, 116',
  lightRed: '204, 36, 29',
  lightGreen: '152, 151, 26',
  lightYellow: '215, 153, 33',
  lightBlue: '69, 133, 136',
  lightMagenta: '177, 98, 134',
  lightCyan: '104, 157, 106',
  white: '251, 241, 199',
};

// ─── Exports ─────────────────────────────────────────────────────────────────

export const PALETTES: Record<
  ThemeName,
  { light: PaletteColors; dark: PaletteColors }
> = {
  original: { light: originalLight, dark: originalDark },
  crimson: { light: crimsonLight, dark: crimsonDark },
  gruvbox: { light: gruvboxLight, dark: gruvboxDark },
};

export const PALETTE_META: Record<ThemeName, { label: string }> = {
  original: { label: 'Original' },
  crimson: { label: 'Crimson' },
  gruvbox: { label: 'Gruvbox' },
};

export const PALETTE_NAMES = Object.keys(PALETTES) as ThemeName[];
