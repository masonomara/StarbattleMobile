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
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  lightGray: string;
  gray: string;
  white: string;
};

// ─── ORIGINAL ────────────────────────────────────────────────────────────────

const originalLight: PaletteColors = {
  black: '31, 35, 30',
  red: '207, 34, 46',
  green: '31, 136, 61',
  yellow: '188, 76, 0',
  blue: '9, 105, 208',
  magenta: '191, 57, 137',
  cyan: '23, 155, 155',
  lightGray: '209, 217, 224',
  gray: '89, 99, 110',
  white: '255, 255, 255',
};

const originalDark: PaletteColors = { ...originalLight };

// ─── CRIMSON ─────────────────────────────────────────────────────────────────

const crimsonLight: PaletteColors = {
  black: '0, 0, 0',
  red: '160, 20, 20',
  green: '0, 120, 40',
  yellow: '160, 80, 0',
  blue: '60, 0, 120',
  magenta: '140, 0, 80',
  cyan: '0, 100, 120',
  lightGray: '192, 192, 192',
  gray: '128, 128, 128',
  white: '255, 255, 255',
};

const crimsonDark: PaletteColors = { ...crimsonLight };

// ─── GRUVBOX ─────────────────────────────────────────────────────────────────

const gruvboxDark: PaletteColors = {
  black: '40, 40, 40',
  red: '204, 36, 29',
  green: '152, 151, 26',
  yellow: '215, 153, 33',
  blue: '69, 133, 136',
  magenta: '177, 98, 134',
  cyan: '104, 157, 106',
  lightGray: '168, 153, 132',
  gray: '146, 131, 116',
  white: '235, 219, 178',
};

const gruvboxLight: PaletteColors = {
  black: '60, 56, 54',
  red: '157, 0, 6',
  green: '121, 116, 14',
  yellow: '181, 118, 20',
  blue: '7, 102, 120',
  magenta: '143, 63, 113',
  cyan: '66, 123, 88',
  gray: '124, 111, 100',
  lightGray: '146, 131, 116',
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
